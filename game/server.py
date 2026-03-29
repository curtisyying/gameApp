"""
Emotion Platformer — Flask server
- Runs webcam emotion detection in a background thread
- SSE endpoint /emotions: streams live emotion + stress to the browser
- POST /generate: proxies Replicate API calls (keeps key server-side, avoids CORS)

Start:
    cd game
    REPLICATE_API_KEY=your_key python server.py
"""

import sys
import os
import json
import time
import base64
import threading
import requests
import cv2
from dotenv import load_dotenv

# Load .env from the project root (one level up from game/)
_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(_root, ".env"))

# Add parent directory to path so we can import facial_stress_model from project root
sys.path.insert(0, _root)
from facial_stress_model import FacialStressModel

from flask import Flask, Response, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ── Shared emotion state (written by webcam thread, read by SSE endpoint) ──
_emotion_state = {
    "emotion": "Neutral",
    "stress": 0.0,
    "timestamp": 0.0,
    "is_aligned": False,
}
_state_lock = threading.Lock()

_latest_frame = None
_is_calibrating = True

# ── Server-side stress smoothing buffer ──
_stress_buffer = []
_buffer_size = 10  # Average over 10 frames to smooth jumpiness


def _webcam_thread():
    """Runs facial detection at ~3 fps and updates _emotion_state."""
    try:
        print("[server] Loading TF model (this can take 10-15 s)...")
        model_path = os.path.join(_root, "models", "model_fer_bloss.h5")
        detector = FacialStressModel(model_path=model_path)
        print("[server] Model loaded. Opening webcam...")
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            print("[server] ERROR: Could not open webcam.")
            print("[server] On macOS go to System Settings → Privacy & Security → Camera and enable access for Terminal.")
            return
        print("[server] Webcam started. Streaming emotions.")
        frame_count = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                time.sleep(0.033)
                continue
            
            global _latest_frame, _is_calibrating
            _latest_frame = frame.copy()

            frame_count += 1
            if frame_count % 6 == 0:
                results = detector.predict(frame, detection_only=_is_calibrating)
                if _is_calibrating:
                    is_aligned = False
                    if results:
                        x, y, w, h = results[0]["box"]
                        frame_h, frame_w = frame.shape[:2]
                        face_center_x = x + w / 2
                        face_center_ratio = face_center_x / frame_w
                        face_size_ratio = w / frame_w

                        # Face must be roughly centered (middle 40%) and large enough (20%+ of frame width)
                        if 0.33 < face_center_ratio < 0.67 and face_size_ratio > 0.25:
                            is_aligned = True

                    with _state_lock:
                        _emotion_state["is_aligned"] = is_aligned
                        _emotion_state["timestamp"] = time.time()
                else:
                    if results:
                        r = results[0]
                        raw_stress = float(r["stress_score"]) / 100.0
                        
                        # Add to buffer and maintain size
                        _stress_buffer.append(raw_stress)
                        if len(_stress_buffer) > _buffer_size:
                            _stress_buffer.pop(0)
                        
                        # Calculate smoothed average
                        smoothed_stress = sum(_stress_buffer) / len(_stress_buffer)
                        stress_normalized = round(smoothed_stress, 4)
                        
                        with _state_lock:
                            _emotion_state["emotion"] = r["emotion"]
                            _emotion_state["stress"] = stress_normalized
                            _emotion_state["timestamp"] = time.time()
                        # Debug output
                        print(f"[emotion] {r['emotion']:8s} | Raw: {raw_stress:.4f} → Smoothed: {stress_normalized:.4f} | Prob: {r['emotion_prob']:.2f}")
            time.sleep(0.033)  # ~3 fps — plenty for mood tracking
        cap.release()
    except Exception as e:
        print(f"[server] Webcam thread crashed: {e}")


# ── Routes ──────────────────────────────────────────────────────────────────

@app.route("/health")
def health():
    with _state_lock:
        return jsonify({
            "status": "ok",
            "emotion": _emotion_state["emotion"],
            "stress": _emotion_state["stress"],
        })


@app.route("/emotions")
def stream_emotions():
    """
    Server-Sent Events stream.  Browser connects once and gets updates as they arrive.
    Each event: data: {"emotion": "Happy", "stress": 0.04}
    """
    def _generate():
        last_ts = -1.0
        while True:
            with _state_lock:
                ts = _emotion_state["timestamp"]
                if ts != last_ts:
                    last_ts = ts
                    payload = json.dumps({
                        "emotion": _emotion_state["emotion"],
                        "stress":  _emotion_state["stress"],
                        "is_aligned": _emotion_state.get("is_aligned", False) # <--- CRITICAL
                    })
                    yield f"data: {payload}\n\n"
            time.sleep(0.1)

    return Response(
        _generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.route("/generate", methods=["POST"])
def generate():
    """
    Proxy a Replicate prediction request.
    Body: { version, input: { image (data-url), prompt, ... } }
    Returns: { status: "succeeded", image_data_url: "data:image/webp;base64,..." }
             or { error: "..." }

    The image is fetched server-side and returned as a base64 data URL so the
    browser never needs to deal with Replicate CORS headers.
    """
    api_key = os.environ.get("REPLICATE_API_KEY", "")
    if not api_key:
        print("[generate] ERROR: REPLICATE_API_KEY not set")
        return jsonify({"error": "REPLICATE_API_KEY env var not set"}), 500

    body = request.get_json(force=True)
    emotion = body.get("input", {}).get("prompt", "")[:40]
    print(f"[generate] Starting prediction for: {emotion}...")

    headers = {
        "Authorization": f"Token {api_key}",
        "Content-Type": "application/json",
    }

    # 1. Create prediction
    try:
        r = requests.post(
            "https://api.replicate.com/v1/predictions",
            headers=headers,
            json=body,
            timeout=30,
        )
    except requests.RequestException as e:
        print(f"[generate] ERROR creating prediction: {e}")
        return jsonify({"error": f"Replicate create failed: {e}"}), 502

    if r.status_code not in (200, 201):
        print(f"[generate] ERROR {r.status_code}: {r.text[:200]}")
        return jsonify({"error": "Replicate rejected request", "details": r.text}), 502

    prediction = r.json()
    pred_id = prediction.get("id")
    if not pred_id:
        print(f"[generate] ERROR: no prediction ID in response: {prediction}")
        return jsonify({"error": "No prediction ID returned"}), 502

    print(f"[generate] Prediction {pred_id} created, polling...")

    # 2. Poll until done (up to 90 s)
    for _ in range(90):
        time.sleep(1)
        try:
            poll = requests.get(
                f"https://api.replicate.com/v1/predictions/{pred_id}",
                headers=headers,
                timeout=15,
            )
            result = poll.json()
        except requests.RequestException:
            continue

        status = result.get("status")
        if status == "succeeded":
            output = result.get("output") or []
            img_url = output[0] if output else None
            if not img_url:
                print(f"[generate] ERROR: succeeded but no output URL")
                return jsonify({"error": "No output image URL"}), 500

            # 3. Fetch image and return as data URL (avoids browser CORS)
            print(f"[generate] Fetching image from: {img_url[:80]}...")
            try:
                # Small delay — let CDN finish propagating before fetching
                time.sleep(1)
                img_r = requests.get(img_url, timeout=30, allow_redirects=True)
                print(f"[generate] Fetch status: {img_r.status_code}, headers: {dict(img_r.headers)}")
                if img_r.status_code != 200:
                    print(f"[generate] ERROR: image fetch returned HTTP {img_r.status_code}")
                    return jsonify({"error": f"Image fetch failed: HTTP {img_r.status_code}"}), 502
                if len(img_r.content) == 0:
                    print(f"[generate] ERROR: image fetch returned 0 bytes — full URL: {img_url}")
                    return jsonify({"error": "Image fetch returned empty response"}), 502
                mime = img_r.headers.get("content-type", "image/webp")
                b64 = base64.b64encode(img_r.content).decode("utf-8")
                print(f"[generate] SUCCESS — image {len(img_r.content)} bytes ({mime})")
                return jsonify({
                    "status": "succeeded",
                    "image_data_url": f"data:{mime};base64,{b64}",
                })
            except requests.RequestException as e:
                print(f"[generate] ERROR fetching output image: {e}")
                return jsonify({"error": f"Could not fetch output image: {e}"}), 502

        elif status == "failed":
            print(f"[generate] FAILED. Logs: {result.get('logs', '')[-200:]}")
            return jsonify({
                "error": "Generation failed",
                "logs": result.get("logs", ""),
            }), 500

    print(f"[generate] TIMEOUT waiting for prediction {pred_id}")
    return jsonify({"error": "Timed out waiting for Replicate"}), 504

def generate_video_frames():
    """Yields webcam frames as a continuous MJPEG stream."""
    global _latest_frame
    while True:
        if _latest_frame is not None:
            # OPTIMIZE: Resize frame to 320px wide (keeping aspect ratio) to send 90% less data
            h, w = _latest_frame.shape[:2]
            new_w = 320
            new_h = int(h * (new_w / w))
            small_frame = cv2.resize(_latest_frame, (new_w, new_h))
            
            # Compress to JPEG with 60% quality (default is ~95%)
            ret, buffer = cv2.imencode('.jpg', small_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 60])
            if ret:
                frame_bytes = buffer.tobytes()
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
        time.sleep(0.05) # ~20 FPS for the visual stream

@app.route('/video_feed')
def video_feed():
    """Route that the browser connects to for the live webcam feed."""
    return Response(generate_video_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/start_game', methods=['POST'])
def start_game():
    """Triggered by the frontend to wake up the stress AI."""
    global _is_calibrating
    _is_calibrating = False
    print("[server] Calibration complete. Stress AI activated!")
    return jsonify({"status": "Stress detection started"})


# ── Boot ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    api_key = os.environ.get("REPLICATE_API_KEY", "")
    if api_key:
        print(f"[server] Replicate API key loaded ({api_key[:6]}...)")
    else:
        print("[server] WARNING: REPLICATE_API_KEY not found — image generation will fail")

    t = threading.Thread(target=_webcam_thread, daemon=True)
    t.start()
    print("[server] Starting on http://localhost:8765")
    app.run(host="0.0.0.0", port=8765, threaded=True, debug=False)

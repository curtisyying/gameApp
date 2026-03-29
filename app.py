from flask import Flask, request, jsonify, render_template
import base64
import numpy as np
import cv2
import os
import tensorflow as tf

# Import the class from your existing facial_stress_model.py
from facial_stress_model import FacialStressModel

app = Flask(__name__, 
            static_folder='static', 
            template_folder='templates')

# GLOBAL CACHE: Load the model once when the server starts
# Adjust 'models/model_fer_bloss.h5' if your filename is different
MODEL_PATH = os.path.join(os.getcwd(), "models", "model_fer_bloss.h5")
print(f"--- Initializing AI Model from {MODEL_PATH} ---")
stress_detector = FacialStressModel(model_path=MODEL_PATH)

@app.route('/')
def index():
    """Serves the main game page."""
    return render_template('index.html')

@app.route('/api/predict', methods=['POST'])
def predict():
    """Handles incoming webcam frames and returns stress/emotion data."""
    try:
        data = request.json
        image_b64 = data.get('image')
        
        if not image_b64:
            return jsonify({"error": "No image data"}), 400

        # 1. Decode Base64 image from frontend
        # Strip the "data:image/jpeg;base64," prefix if present
        if "," in image_b64:
            image_b64 = image_b64.split(",")[1]
            
        img_bytes = base64.b64decode(image_b64)
        np_arr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if frame is None:
            return jsonify({"error": "Invalid image frame"}), 400

        # 2. Run prediction using your existing logic
        results = stress_detector.predict(frame)

        if results and len(results) > 0:
            # Send back the data for the first face detected
            return jsonify({
                "success": True,
                "emotion": results[0]["emotion"],
                "stress_score": float(results[0]["stress_score"]),
                "prob": float(results[0]["emotion_prob"])
            })
        else:
            return jsonify({
                "success": False, 
                "message": "No face detected",
                "stress_score": None
            })

    except Exception as e:
        print(f"API Error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Run on port 5000
    print("\nGame Server Starting...")
    print("Go to: http://127.0.0.1:5000")
    app.run(debug=True, port=5000)
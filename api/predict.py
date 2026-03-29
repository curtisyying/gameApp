from flask import Flask, request, jsonify
import base64
import numpy as np
import cv2
import os

# Import your existing class
from facial_stress_model import FacialStressModel

app = Flask(__name__)

# GLOBAL CACHE: This ensures the .h5 model is only loaded into memory ONCE
# when the Vercel function cold-starts, making subsequent requests much faster.
model_instance = None

@app.route('/api/predict', methods=['POST'])
def predict():
    global model_instance
    
    # Initialize model if it hasn't been loaded yet
    if model_instance is None:
        # Construct the path to expect the 'models' folder in your root directory
        model_path = os.path.join(os.getcwd(), "models", "model_fer_bloss.h5")
        model_instance = FacialStressModel(model_path=model_path)

    try:
        # Get the Base64 image string from the frontend
        data = request.json
        image_b64 = data.get('image')
        
        if not image_b64:
            return jsonify({"error": "No image provided"}), 400

        # Strip the data URI header and decode
        img_data = base64.b64decode(image_b64.split(',')[1])
        np_arr = np.frombuffer(img_data, np.uint8)
        
        # Decode into an OpenCV image
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        # Run your existing prediction logic
        results = model_instance.predict(frame)

        if results and len(results) > 0:
            # Return the first detected face's data
            return jsonify(results[0])
        else:
            return jsonify({"error": "No face detected", "stress_score": None}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Vercel requires the app to be exposed 
if __name__ == '__main__':
    app.run()
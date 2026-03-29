import math
import os
import cv2
import numpy as np
import tensorflow as tf

class FacialStressModel:
    def __init__(self, model_path=None):
        """Initialize face detector and load Keras model."""

        # Find model path
        if model_path is None:
            current_folder = os.path.dirname(os.path.abspath(__file__))
            model_path = os.path.join(
                current_folder, "..", "models", "model_fer_bloss.h5"
            )

        # Load OpenCV Haar Cascade for face detection
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        self.face_cascade = cv2.CascadeClassifier(cascade_path)
        try:
            self.model = tf.keras.models.load_model(model_path)
            print("AI Model loaded successfully from:", model_path)
        except Exception as e:
            print(f"Error loading model: {e}")
            self.model = None

        # Emotions and mappings from Facial_Stress
        self.emotion_map = {
            0: "Angry",
            1: "Disgust",
            2: "Fear",
            3: "Happy",
            4: "Sad",
            5: "Surprise",
            6: "Neutral",
        }
        # self.aligned_func = [
        #     self.anger,
        #     self.disgust,
        #     self.fear,
        #     self.happy,
        #     self.sad,
        #     self.surprise,
        #     self.contempt,
        # ]
        self.emotion_weights = {
            0: 100.0, # Angry (Max Stress)
            1: 70.0,  # Disgust
            2: 85.0,  # Fear
            3: 0.0,   # Happy (Zero Stress)
            4: 50.0,  # Sad
            5: 30.0,  # Surprise
            6: 10.0   # Neutral (Base resting stress)
        }

    # Calculations of emotion
    # @staticmethod
    # def anger(p):
    #     return 2.332 * math.log(0.343 * p + 1.003)

    # @staticmethod
    # def fear(p):
    #     return 1.763 * math.log(1.356 * p + 1)

    # @staticmethod
    # def contempt(p):
    #     return 5.03 * math.log(0.01229 * p + 1.036)

    # @staticmethod
    # def disgust(p):
    #     return 7.351 * math.log(0.0123 * p + 1.019)

    # @staticmethod
    # def happy(p):
    #     return 532.2 * math.log(5.221e-5 * p + 0.9997)

    # @staticmethod
    # def sad(p):
    #     return 2.851 * math.log(0.1328 * p + 1.009)

    # @staticmethod
    # def surprise(p):
    #     return 2.478 * math.log(0.2825 * p + 1.003)

    def predict(self, frame):
        """Processes a frame, finds the main face, and predicts stress/emotion."""
        results = []
        if self.model is None:
            return results

        # Convert to grayscale/equalize
        gray_img = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray_img_eq = cv2.equalizeHist(gray_img)

        # Detect face
        faces = self.face_cascade.detectMultiScale(
            gray_img_eq, scaleFactor=1.1, minNeighbors=3, minSize=(30, 30)
        )

        if len(faces) == 0:
            return results
            
        # Sort faces by area (width * height) descending, and keep only the first one
        faces = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
        x, y, w, h = faces[0]

        # Change box a little to capture whole face
        frame_h, frame_w = gray_img.shape
        
        # Expand 10% up, 30% down, and 10% on the sides
        new_y = max(0, y - int(h * 0.1))
        new_h = min(frame_h - new_y, int(h * 1.2)) # 40% taller overall
        
        new_x = max(0, x - int(w * 0.1))
        new_w = min(frame_w - new_x, int(w * 1.2)) # 20% wider overall

        # Crop face using the new expanded bounds
        face_region = gray_img[new_y : new_y + new_h, new_x : new_x + new_w]

        try:
            # Preprocess and predict
            face_resized = cv2.resize(face_region, (48, 48))
            face_normalized = face_resized / 255.0
            input_img = np.reshape(face_normalized, (1, 48, 48, 1))
            predictions = self.model.predict(input_img, verbose=0)[0]

            # Find the dominant emotion to display as the text label
            predicted_emotion_index = np.argmax(predictions)
            predicted_emotion_label = self.emotion_map[predicted_emotion_index]
            probability = np.max(predictions)

            # Calculate overall stress with weighted sum of emotions
            normalized_stress = sum(predictions[i] * self.emotion_weights[i] for i in range(7))
            normalized_stress = max(0.0, min(normalized_stress, 100.0))

            # Append the results for this specific face
            results.append(
                {
                    "face_box": (new_x, new_y, new_w, new_h),
                    "emotion": predicted_emotion_label,
                    "emotion_prob": probability,
                    "stress_score": normalized_stress,
                }
            )
        except Exception as e:
            pass

        return results
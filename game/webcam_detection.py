import cv2
import time
from facial_stress_model import FacialStressModel

detector = FacialStressModel()

# Open webcam
cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("Could not open webcam.")
    exit()

print("System Live. Streaming data... Press 'Ctrl + C' in terminal to quit.")

try:
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # Pass BGR frame
        results = detector.predict(frame)

        # Loop through detected faces (will only be 1 now)
        for result in results:
            emotion = result["emotion"]
            stress = result["stress_score"]
            
            # Output the continuous data stream
            print(f"Emotion: {emotion.ljust(8)} | Stress: {stress:04.1f}%")

        #     x, y, w, h = result["face_box"]
        #     if stress < 33:
        #         color = (0, 255, 0)
        #     elif stress < 66:
        #         color = (0, 255, 255)
        #     else:
        #         color = (0, 0, 255)
        #     cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)
        #     text = f"{emotion} | Stress: {stress:.1f}%"
        #     cv2.putText(frame, text, (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
        # cv2.imshow("Stress Cam", frame)
        # if cv2.waitKey(1) & 0xFF == ord("q"):
        #     break

except KeyboardInterrupt:
    print("\nStream stopped by user.")

# Clean up
cap.release()
cv2.destroyAllWindows()
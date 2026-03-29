const video = document.getElementById('webcam');
const director = new StressDirector();
const game = new OpenWorldEngine('gameCanvas');

let isPredicting = false; 
let lastPredictionTime = 0;
const PREDICT_INTERVAL = 300; // Run ~3 times per second

async function initializeSystem() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        video.srcObject = stream;
        
        await new Promise(resolve => { 
            video.onloadedmetadata = () => {
                video.play();
                resolve(); 
            };
        });
        
        game.start();
        predictLoop(); // Start the communication loop
        
    } catch (err) {
        document.getElementById('rawLabel').innerText = "ERROR: Webcam Access";
        console.error("Initialization failed:", err);
    }
}

async function predictLoop() {
    const now = Date.now();

    if (video.readyState === 4 && !isPredicting && (now - lastPredictionTime >= PREDICT_INTERVAL)) {
        isPredicting = true;
        lastPredictionTime = now;
        
        try {
            // Grab frame directly from camera track, bypassing canvas entirely
            const track = video.srcObject.getVideoTracks()[0];
            const imageCapture = new ImageCapture(track);
            const bitmap = await imageCapture.grabFrame();

            // Draw the bitmap (not the video element) to canvas
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = 160;
            tempCanvas.height = 120;
            const ctx = tempCanvas.getContext('2d');
            ctx.drawImage(bitmap, 0, 0, tempCanvas.width, tempCanvas.height);
            
            const base64Frame = tempCanvas.toDataURL('image/jpeg', 0.7);

            const response = await fetch('/api/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64Frame })
            });

            const data = await response.json();

            if (data.stress_score !== null && data.stress_score !== undefined) {
                document.getElementById('rawLabel').innerText = 
                    `Emotion: ${data.emotion} | Stress: ${data.stress_score.toFixed(1)}%`;
                const directedStress = director.process(data.stress_score);
                game.setTargetStress(directedStress);
            }
        } catch (err) {
            console.error("Prediction error:", err);
        } finally {
            isPredicting = false; 
        }
    }

    requestAnimationFrame(predictLoop);
}

initializeSystem();
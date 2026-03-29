const video = document.getElementById('webcam');
const cropCanvas = document.getElementById('cropCanvas');
const cropCtx = cropCanvas.getContext('2d');

let aiModel;
let faceDetector;

// We can use these classes because we loaded them first in index.html
const director = new StressDirector();
const game = new OpenWorldEngine('gameCanvas');

const emotionWeights = [100.0, 70.0, 85.0, 0.0, 50.0, 30.0, 10.0];

async function initializeSystem() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        video.srcObject = stream;
        await new Promise(resolve => { 
            video.oncanplay = () => {
                video.play();
                console.log("video dimensions:", video.videoWidth, video.videoHeight);
                console.log("video readyState:", video.readyState);
                console.log("stream tracks:", video.srcObject.getTracks().map(t => t.readyState));
                resolve(); 
            };
        });

        const model = faceDetection.SupportedModels.MediaPipeFaceDetector;
        const detectorConfig = { runtime: 'tfjs', maxFaces: 1 };
        faceDetector = await faceDetection.createDetector(model, detectorConfig);

        aiModel = await tf.loadGraphModel('./tfjs_model/model.json');
        
        game.start();
        predictLoop();
        
    } catch (err) {
        document.getElementById('rawLabel').innerText = "ERROR: See Console";
        console.error("Initialization failed:", err);
    }
}

async function predictLoop() {
    console.log("video readyState in loop:", video.readyState, "| size:", video.videoWidth, video.videoHeight);
    if (video.readyState === 4) {
        const faces = await faceDetector.estimateFaces(video);
        console.log("Faces detected:", faces.length);
        
        if (faces.length > 0) {
            let box = faces[0].box;
            let new_y = Math.max(0, box.yMin - (box.height * 0.1));
            let new_h = Math.min(video.videoHeight - new_y, box.height * 1.2);
            let new_x = Math.max(0, box.xMin - (box.width * 0.1));
            let new_w = Math.min(video.videoWidth - new_x, box.width * 1.2);

            cropCanvas.width = cropCanvas.width;
            console.log("video paused:", video.paused, "| ended:", video.ended, "| currentTime:", video.currentTime);
            cropCtx.drawImage(video, new_x, new_y, new_w, new_h, 0, 0, 48, 48);
            const frameCheck = cropCtx.getImageData(0, 0, 1, 1).data;
            console.log("Top-left pixel:", frameCheck[0], frameCheck[1], frameCheck[2]);
            console.log("Direct draw pixel:", frameCheck[0], frameCheck[1], frameCheck[2]);

            const tensor = tf.tidy(() => {
                let img = tf.browser.fromPixels(cropCanvas, 1);
                return img.toFloat().div(127.5).sub(1.0).expandDims(0); 
            });

            let predTensor = aiModel.predict(tensor);
            let predictions = predTensor.dataSync();
            console.log("Raw predictions:", Array.from(predictions));
            
            predTensor.dispose();
            tensor.dispose();

            let adjustedPreds = Array.from(predictions);
            adjustedPreds[6] *= 0.5; 
            adjustedPreds[3] *= 2.0; 
            
            const sum = adjustedPreds.reduce((a, b) => a + b, 0);
            adjustedPreds = adjustedPreds.map(p => p / sum);

            let rawStress = 0;
            for (let i = 0; i < 7; i++) {
                rawStress += adjustedPreds[i] * emotionWeights[i];
            }
            rawStress = Math.max(0, Math.min(100, rawStress));
            console.log("rawStress:", rawStress);

            const directedStress = director.process(rawStress);
            console.log("directedStress:", directedStress);
            game.setTargetStress(directedStress);
        }
    }
    
    await tf.nextFrame();
    requestAnimationFrame(predictLoop);
}

// Start everything up!
initializeSystem();
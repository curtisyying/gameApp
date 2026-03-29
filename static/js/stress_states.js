class StressDirector {
    constructor() {
        this.stressBuffer = [];
        this.bufferSize = 10; // Average over 10 frames
        this.currentState = "NEUTRAL";
        this.lastStateChangeTime = 0;
        this.minStateDuration = 2000; 
    }

    process(rawStressScore) {
        let normalizedStress = rawStressScore / 100;
        this.stressBuffer.push(normalizedStress);
        
        if (this.stressBuffer.length > this.bufferSize) {
            this.stressBuffer.shift();
        }
        
        const avgStress = this.stressBuffer.reduce((a, b) => a + b, 0) / this.stressBuffer.length;
        const now = Date.now();
        
        // Return the continuous average so the game colors can "fade" smoothly
        return avgStress * 100;
    }
}
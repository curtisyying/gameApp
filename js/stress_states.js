class StressDirector {
    constructor() {
        this.stressBuffer = [];
        this.bufferSize = 10;
        this.currentState = "NEUTRAL";
        this.lastStateChangeTime = 0;
        this.minStateDuration = 2000; 
        this.stateChangeBuffer = 0.07;
        this.thresholds = {
            HAPPY: { max: 0.15 },
            NEUTRAL: { min: 0.10, max: 0.35 },
            SAD: { min: 0.30, max: 0.65 },
            ANGRY: { min: 0.60, max: 1.0 }
        };
    }

    process(rawStressScore) {
        let normalizedStress = rawStressScore / 100;
        this.stressBuffer.push(normalizedStress);
        if (this.stressBuffer.length > this.bufferSize) this.stressBuffer.shift();
        if (this.stressBuffer.length < this.bufferSize) return rawStressScore;
    
        const avgStress = this.stressBuffer.reduce((a, b) => a + b) / this.stressBuffer.length;
        const now = Date.now();
    
        if (now - this.lastStateChangeTime >= this.minStateDuration) {
            let newState;
            if (avgStress < this.thresholds.HAPPY.max) newState = "HAPPY";
            else if (avgStress < this.thresholds.NEUTRAL.max) newState = "NEUTRAL";
            else if (avgStress < this.thresholds.SAD.max) newState = "SAD";
            else newState = "ANGRY";
    
            // Only lock out future changes if the state actually changed
            if (newState !== this.currentState) {
                this.currentState = newState;
                this.lastStateChangeTime = now;
            }
        }
    
        return avgStress * 100;
    }
}
class StressDirector {
    constructor() {
        this.stressBuffer = [];
        this.bufferSize = 10;
        this.currentState = "NEUTRAL";
        this.lastStateChangeTime = 0;
        // User stays in a state for min 2 seconds before transition back
        this.minStateDuration = 2000; 
        // To change state
        this.stateChangeBuffer = 0.07;
        
        // Define our base thresholds
        this.thresholds = {
            HAPPY: { max: 0.15 },
            NEUTRAL: { min: 0.10, max: 0.35 },
            SAD: { min: 0.30, max: 0.65 },
            ANGRY: { min: 0.60, max: 1.0 }
        };
    }

    update(rawStress, currentEmotion) {
        this.stressBuffer.push(rawStress);
        if (this.stressBuffer.length > this.bufferSize) this.stressBuffer.shift();
        
        // wait for the buffer to actually fill up first
        if (this.stressBuffer.length < this.bufferSize) return this.currentState;

        const avgStress = this.stressBuffer.reduce((a, b) => a + b) / this.stressBuffer.length;
        const now = Date.now();
        
        if (now - this.lastStateChangeTime < this.minStateDuration) return this.currentState;

        let nextState = this.currentState;

        if (this.currentState === "HAPPY") {
            if (avgStress > (this.thresholds.HAPPY.max + this.stateChangeBuffer) && currentEmotion === "neutral") {
                nextState = "NEUTRAL";
            }
        }
        else if (this.currentState === "NEUTRAL") {
            if (avgStress > (this.thresholds.NEUTRAL.max + this.stateChangeBuffer) && currentEmotion === "sad") {
                nextState = "SAD";
            } 
            else if (avgStress < (this.thresholds.NEUTRAL.min - this.stateChangeBuffer) && currentEmotion === "happy") {
                nextState = "HAPPY";
            }
        } 
        else if (this.currentState === "SAD") {
            // allowing both angry and disgust here based on the notes
            if (avgStress > (this.thresholds.SAD.max + this.stateChangeBuffer) && (currentEmotion === "angry" || currentEmotion === "disgust")) {
                nextState = "ANGRY";
            } 
            else if (avgStress < (this.thresholds.SAD.min - this.stateChangeBuffer) && currentEmotion === "neutral") {
                nextState = "NEUTRAL";
            }
        }
        else if (this.currentState === "ANGRY") {
            if (avgStress < (this.thresholds.ANGRY.min - this.stateChangeBuffer) && currentEmotion === "sad") {
                nextState = "SAD";
            }
            // emergency drop to neutral if stress completely tanks
            else if (avgStress < (this.thresholds.NEUTRAL.max - this.stateChangeBuffer) && currentEmotion === "neutral") {
                nextState = "NEUTRAL";
            }
        }

        if (nextState !== this.currentState) {
            this.currentState = nextState;
            this.lastStateChangeTime = now;
            this.triggerEnvironmentChange(nextState, avgStress);
        }

        return this.currentState;
    }

    triggerEnvironmentChange(state, intensity) {
        console.log(`Transitioning to ${state} at ${Math.round(intensity * 100)}% stress.`);
        // TODO: call three.js stuff here (shaders, swap meshes, etc)
    }
}
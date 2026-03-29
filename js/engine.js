class OpenWorldEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        this.keys = { right: false, left: false, up: false, dash: false, attack: false };
        this.cameraX = 0;
        this.baseGroundY = 480; 
        
        this.chunkSize = 1200; 
        this.worldMap = new Map(); 
        this.activeEntities = []; 
        
        this.player = { 
            x: 320, y: 200, width: 24, height: 36, 
            vx: 0, vy: 0, 
            speed: 1.75,         
            jump: -7.07,     
            grounded: false, 
            facing: 1, 
            isDashing: false, dashTimer: 0, dashSpeed: 4.0, 
            dashCooldown: 0, hasAirDashed: false, 
            isAttacking: false, attackTimer: 0 
        };

        this.palettes = {
            HAPPY:   { bg: [135, 206, 235], ground: [144, 238, 144], platform: [255, 215, 0],  enemy: [255, 105, 180], player: [255, 255, 255], water: [0, 191, 255], attack: [255, 255, 255] },
            NEUTRAL: { bg: [176, 196, 222], ground: [139, 69,  19],  platform: [34,  139, 34], enemy: [220, 20,  60],  player: [0,   0,   255], water: [70, 130, 180], attack: [200, 200, 200] },
            SAD:     { bg: [47,  79,  79],  ground: [25,  25,  112], platform: [112, 128, 144],enemy: [75,  0,   130], player: [173, 216, 230], water: [25, 25, 112],  attack: [100, 100, 150] },
            ANGRY:   { bg: [40,  0,   0],   ground: [70,  0,   0],   platform: [139, 0,   0],  enemy: [255, 140, 0],   player: [255, 0,   0],   water: [255, 69, 0],   attack: [255, 255, 0] }
        };

        this.currentTheme = this.palettes.HAPPY;
        this.targetStress = 0;   
        this.visualStress = 0;   
        this.smoothingFactor = 0.015; 

        this.setupInputs();
    }

    setTargetStress(rawPercentage) { this.targetStress = Math.max(0, Math.min(100, rawPercentage)) / 100; }

    updateVisuals() {
        this.visualStress += (this.targetStress - this.visualStress) * this.smoothingFactor;
        let stress = this.visualStress; let t = 0;
        
        if (stress < 0.22) { t = stress / 0.22; this.currentTheme = this.blendPalettes(this.palettes.HAPPY, this.palettes.NEUTRAL, t); } 
        else if (stress < 0.47) { t = (stress - 0.22) / 0.25; this.currentTheme = this.blendPalettes(this.palettes.NEUTRAL, this.palettes.SAD, t); } 
        else if (stress < 0.80) { t = (stress - 0.47) / 0.33; this.currentTheme = this.blendPalettes(this.palettes.SAD, this.palettes.ANGRY, t); } 
        else { this.currentTheme = this.blendPalettes(this.palettes.ANGRY, this.palettes.ANGRY, 1); }

        document.getElementById('rawLabel').innerText = `Raw Sensor: ${Math.round(this.targetStress * 100)}%`;
        document.getElementById('visualLabel').innerText = `Screen Lerp: ${Math.round(this.visualStress * 100)}%`;
    }

    lerp(start, end, t) { return Math.round(start + (end - start) * t); }
    lerpRGB(c1, c2, t) { return `rgb(${this.lerp(c1[0], c2[0], t)}, ${this.lerp(c1[1], c2[1], t)}, ${this.lerp(c1[2], c2[2], t)})`; }

    blendPalettes(p1, p2, t) {
        return {
            bg: this.lerpRGB(p1.bg, p2.bg, t), ground: this.lerpRGB(p1.ground, p2.ground, t),
            platform: this.lerpRGB(p1.platform, p2.platform, t), enemy: this.lerpRGB(p1.enemy, p2.enemy, t),
            player: this.lerpRGB(p1.player, p2.player, t), water: this.lerpRGB(p1.water, p2.water, t), attack: this.lerpRGB(p1.attack, p2.attack, t)
        };
    }

    setupInputs() {
        window.addEventListener('keydown', (e) => {
            if (e.code === 'ArrowRight') this.keys.right = true;
            if (e.code === 'ArrowLeft') this.keys.left = true;
            if (e.code === 'ArrowUp') this.keys.up = true;
            if (e.code === 'KeyZ') this.keys.dash = true;
            if (e.code === 'KeyX') this.keys.attack = true;
        });
        window.addEventListener('keyup', (e) => {
            if (e.code === 'ArrowRight') this.keys.right = false;
            if (e.code === 'ArrowLeft') this.keys.left = false;
            if (e.code === 'ArrowUp') this.keys.up = false;
            if (e.code === 'KeyZ') this.keys.dash = false;
            if (e.code === 'KeyX') this.keys.attack = false;
        });
    }

    // --- OVERLAP & CHUNK GENERATION ---
    generateChunk(chunkIndex) {
        let chunkData = [];
        let currentX = chunkIndex * this.chunkSize;
        let endX = currentX + this.chunkSize;
        
        let lastY = this.baseGroundY; 

        // Helper to prevent overlapping platforms from spawning
        const isOverlapping = (x, y, w, h) => {
            let buffer = 20; 
            // Check against this chunk AND surrounding chunks in active memory to prevent seam overlaps
            let allEntitiesToCheck = chunkData.concat(this.activeEntities);
            for (let e of allEntitiesToCheck) {
                if (e.type === 'platform') {
                    if (x < e.x + e.width + buffer && x + w > e.x - buffer &&
                        y < e.y + e.height + buffer && y + h > e.y - buffer) {
                        return true;
                    }
                }
            }
            return false;
        };

        while (currentX < endX) {
            let isWaterPit = Math.random() < 0.35; 
            let sectionWidth = isWaterPit ? Math.random() * 150 + 150 : Math.random() * 200 + 200;

            if (!isWaterPit) {
                chunkData.push({ type: 'ground', x: currentX, y: this.baseGroundY, width: sectionWidth, height: 100 });
                lastY = this.baseGroundY; 
            }

            let cursorX = currentX + 30;
            
            while (cursorX < currentX + sectionWidth - 80) {
                let pW = Math.random() * 50 + 50;
                let minY = Math.max(lastY - 85, this.baseGroundY - 220); 
                let maxY = Math.min(lastY + 85, this.baseGroundY - 40);  
                
                if (isWaterPit) maxY = Math.min(maxY, this.baseGroundY - 80);

                let pH = minY + Math.random() * (maxY - minY);
                
                // Only place platform if it doesn't overlap!
                if (!isOverlapping(cursorX, pH, pW, 15)) {
                    chunkData.push({ type: 'platform', x: cursorX, y: pH, width: pW, height: 15 });
                    
                    if (Math.random() < 0.5) {
                        let isStatic = Math.random() < 0.5;
                        chunkData.push({ 
                            type: 'enemy_ground', x: cursorX + pW/2 - 12, y: pH - 24, width: 24, height: 24, 
                            vx: isStatic ? 0 : 0.5, minX: cursorX, maxX: cursorX + pW, dead: false, isStatic: isStatic
                        });
                    }
                    lastY = pH;
                }
                
                cursorX += pW + (Math.random() * 40 + 40); 
            }

            if (isWaterPit && Math.random() < 0.6) {
                chunkData.push({ 
                    type: 'enemy_flying', x: currentX + sectionWidth/2, y: this.baseGroundY - 100, width: 24, height: 24, 
                    startY: this.baseGroundY - 100, hoverTime: Math.random() * 100, dead: false 
                });
            }

            currentX += sectionWidth;
        }
        return chunkData;
    }

    updateChunks() {
        let playerChunkIndex = Math.floor(this.player.x / this.chunkSize);
        let chunksToLoad = [playerChunkIndex - 1, playerChunkIndex, playerChunkIndex + 1];
        this.activeEntities = [];

        for (let index of chunksToLoad) {
            if (!this.worldMap.has(index)) this.worldMap.set(index, this.generateChunk(index));
            this.activeEntities.push(...this.worldMap.get(index));
        }
    }

    checkIntersection(r1, r2) {
        return !(r2.x >= r1.x + r1.width || r2.x + r2.width <= r1.x || r2.y >= r1.y + r1.height || r2.y + r2.height <= r1.y);
    }

    updatePhysics() {
        // 1. Calculate X velocity
        if (this.keys.right) { this.player.vx = this.player.speed; this.player.facing = 1; }
        else if (this.keys.left) { this.player.vx = -this.player.speed; this.player.facing = -1; }
        else this.player.vx = 0;

        if (this.player.dashCooldown > 0) this.player.dashCooldown--;

        if (this.keys.dash && this.player.dashCooldown === 0 && !this.player.isDashing) {
            if (this.player.grounded || (!this.player.grounded && !this.player.hasAirDashed)) {
                this.player.isDashing = true;
                this.player.dashTimer = 18; 
                this.player.dashCooldown = 60; 
                this.player.vy = 0; 
                if (!this.player.grounded) this.player.hasAirDashed = true;
            }
        }

        if (this.player.isDashing) {
            this.player.vx = this.player.dashSpeed * this.player.facing;
            this.player.dashTimer--;
            if (this.player.dashTimer <= 0) this.player.isDashing = false;
        }

        // 2. Apply X Movement & Resolve Wall Collisions (Ground Only)
        this.player.x += this.player.vx;
        for (let entity of this.activeEntities) {
            if (entity.type === 'ground') {
                if (this.checkIntersection(this.player, entity)) {
                    // Pushed into the left wall of a ground block
                    if (this.player.vx > 0) { 
                        this.player.x = entity.x - this.player.width;
                    } 
                    // Pushed into the right wall of a ground block
                    else if (this.player.vx < 0) {
                        this.player.x = entity.x + entity.width;
                    }
                    this.player.vx = 0; // Stop horizontal momentum
                }
            }
        }

        // 3. Calculate Y velocity
        if (!this.player.isDashing) {
            this.player.vy += 0.2; // Gravity
        }

        if (this.keys.up && this.player.grounded) {
            this.player.vy = this.player.jump;
            this.player.grounded = false;
        }

        // 4. Apply Y Movement & Resolve Floor Collisions
        this.player.y += this.player.vy;
        this.player.grounded = false;

        for (let entity of this.activeEntities) {
            if (entity.type === 'ground' || entity.type === 'platform') {
                // Landing on top of ground or platform
                if (this.player.vy >= 0 && 
                    this.player.x + this.player.width > entity.x && 
                    this.player.x < entity.x + entity.width && 
                    // Ensure the player was above the entity in the previous frame
                    this.player.y + this.player.height - this.player.vy <= entity.y + 2 && 
                    this.player.y + this.player.height >= entity.y) {
                    
                    this.player.grounded = true;
                    this.player.hasAirDashed = false; 
                    this.player.vy = 0;
                    this.player.y = entity.y - this.player.height;
                }
            }
        }

        this.cameraX = this.player.x - (this.canvas.width / 2);

        // --- WATER LOGIC ---
        let waterSurface = this.baseGroundY + 20;
        
        if (this.player.y > waterSurface) {
            if (this.visualStress < 0.80) {
                this.player.vy *= 0.8; 
                
                if (this.keys.up) {
                    if (this.player.y < waterSurface + 40) {
                        this.player.vy = this.player.jump; 
                    } else {
                        this.player.vy = -3.5; 
                    }
                }
                this.player.hasAirDashed = false; 
            } else {
                this.player.vy = -10; // Lava bounce
                this.player.hasAirDashed = false; 
            }
        }

        // --- SWORD SLICE COMBAT ---
        if (this.keys.attack && this.player.attackTimer <= 0) {
            this.player.attackTimer = 25; 
        }
        if (this.player.attackTimer > 0) this.player.attackTimer--;

        let attackHitbox = null;
        if (this.player.attackTimer > 15) { 
            // Wide sweeping wedge hitbox
            attackHitbox = {
                x: this.player.facing === 1 ? this.player.x + this.player.width/2 : this.player.x + this.player.width/2 - 45,
                y: this.player.y - 15,
                width: 45, height: 50
            };
        }

        // Enemy Interactions
        for (let entity of this.activeEntities) {
            if ((entity.type === 'enemy_ground' || entity.type === 'enemy_flying') && !entity.dead) {
                if (entity.type === 'enemy_ground') {
                    entity.x += entity.vx;
                    if (entity.x < entity.minX || entity.x + entity.width > entity.maxX) entity.vx *= -1;
                } else if (entity.type === 'enemy_flying') {
                    let prevY = entity.y;
                    entity.hoverTime += 0.015; 
                    entity.y = entity.startY + Math.sin(entity.hoverTime) * 15; 

                    for (let p of this.activeEntities) {
                        if ((p.type === 'platform' || p.type === 'ground') && this.checkIntersection(entity, p)) {
                            entity.y = prevY; 
                            if (entity.y < p.y) entity.startY -= 0.5;
                            else entity.startY += 0.5;
                            break;
                        }
                    }
                }

                // Check slice kill
                if (attackHitbox && this.checkIntersection(attackHitbox, entity)) {
                    entity.dead = true; 
                    this.player.vy = -3; 
                    this.player.hasAirDashed = false; 
                } 
                // Check player damage
                else if (this.checkIntersection(this.player, entity)) {
                    this.player.vy = -4; 
                    this.player.vx = -4 * this.player.facing; 
                }
            }
        }
    }

    draw() {
        this.ctx.fillStyle = this.currentTheme.bg;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.save();
        this.ctx.translate(-this.cameraX, 0);

        this.ctx.fillStyle = this.currentTheme.water;
        this.ctx.fillRect(this.cameraX - 100, this.baseGroundY + 20, this.canvas.width + 200, this.canvas.height);

        for (let entity of this.activeEntities) {
            if (entity.type === 'ground' || entity.type === 'platform') {
                this.ctx.fillStyle = entity.type === 'ground' ? this.currentTheme.ground : this.currentTheme.platform;
                this.ctx.fillRect(entity.x, entity.y, entity.width, entity.height);
            } else if ((entity.type === 'enemy_ground' || entity.type === 'enemy_flying') && !entity.dead) {
                this.ctx.fillStyle = this.currentTheme.enemy;
                this.ctx.fillRect(entity.x, entity.y, entity.width, entity.height);
                
                if (entity.type === 'enemy_ground' && entity.isStatic) {
                    this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
                    this.ctx.fillRect(entity.x + 8, entity.y + 8, 8, 8);
                }

                if (entity.type === 'enemy_flying') {
                    this.ctx.fillStyle = 'rgba(255,255,255,0.5)';
                    this.ctx.fillRect(entity.x - 5, entity.y + 5, 34, 10);
                }
            }
        }

        // Draw Player
        if (this.player.dashCooldown > 0 && Math.floor(Date.now() / 100) % 2 === 0) {
            this.ctx.fillStyle = 'rgba(255,255,255,0.5)';
        } else {
            this.ctx.fillStyle = this.currentTheme.player;
        }
        this.ctx.fillRect(this.player.x, this.player.y, this.player.width, this.player.height);

        // --- DRAW WEDGE SLICE ---
        if (this.player.attackTimer > 15) {
            let progress = (25 - this.player.attackTimer) / 10; // 0.0 to 1.0
            
            this.ctx.fillStyle = this.currentTheme.attack;
            this.ctx.beginPath();
            
            let cx = this.player.x + this.player.width / 2;
            let cy = this.player.y + this.player.height / 2;
            let radius = 45;
            
            // Start directly above the player
            let startAngle = -Math.PI / 2; 
            // End directly in front of the player
            let endAngle = this.player.facing === 1 ? 0 : -Math.PI; 
            
            this.ctx.moveTo(cx, cy);
            // Draw a growing pie slice based on animation progress
            this.ctx.arc(cx, cy, radius, startAngle, startAngle + (endAngle - startAngle) * progress, this.player.facing === -1);
            this.ctx.fill();
        }

        this.ctx.restore();
    }

    loop() {
        this.updateChunks(); 
        this.updatePhysics();
        this.updateVisuals(); 
        this.draw();
        requestAnimationFrame(() => this.loop());
    }

    start() { this.loop(); }
}

// // Mock Biometric Data
// let currentSimulatedStress = 10;
// setInterval(() => {
//     currentSimulatedStress += (Math.random() * 10 - 5); 
//     if (Math.random() < 0.1) currentSimulatedStress += (Math.random() * 80 - 40); 
//     currentSimulatedStress = Math.max(0, Math.min(100, currentSimulatedStress));
//     game.setTargetStress(currentSimulatedStress);
// }, 300); 
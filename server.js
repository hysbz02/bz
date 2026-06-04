const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// ==================== CONSTANTS ====================

const TICK_RATE = 20; // server ticks per second
const TICK_INTERVAL = 1000 / TICK_RATE;

const SHIP_SIZE = 30; // radius

const SHIP_TYPES = [
  { name: 'Scout',      attack: 3, hp: 80,  speed: 6.0, bulletSpeed: 8,  ultimateSpeed: 6,  bulletPower: 10, ultimatePower: 30, healRate: 0.5 },
  { name: 'Fighter',    attack: 5, hp: 100, speed: 4.0, bulletSpeed: 7,  ultimateSpeed: 5,  bulletPower: 15, ultimatePower: 40, healRate: 0.8 },
  { name: 'Tank',       attack: 4, hp: 180, speed: 2.5, bulletSpeed: 5,  ultimateSpeed: 4,  bulletPower: 12, ultimatePower: 35, healRate: 1.0 },
  { name: 'Sniper',     attack: 7, hp: 70,  speed: 3.0, bulletSpeed: 12, ultimateSpeed: 10, bulletPower: 25, ultimatePower: 60, healRate: 0.3 },
  { name: 'Assassin',   attack: 8, hp: 60,  speed: 5.5, bulletSpeed: 9,  ultimateSpeed: 7,  bulletPower: 20, ultimatePower: 50, healRate: 0.4 },
  { name: 'Healer',     attack: 2, hp: 120, speed: 3.5, bulletSpeed: 6,  ultimateSpeed: 5,  bulletPower: 8,  ultimatePower: 20, healRate: 3.0 },
  { name: 'Destroyer',  attack: 6, hp: 140, speed: 2.0, bulletSpeed: 4,  ultimateSpeed: 3,  bulletPower: 18, ultimatePower: 70, healRate: 0.6 },
  { name: 'Interceptor',attack: 4, hp: 90,  speed: 7.0, bulletSpeed: 8,  ultimateSpeed: 7,  bulletPower: 12, ultimatePower: 35, healRate: 0.7 },
  { name: 'Bomber',     attack: 5, hp: 110, speed: 3.0, bulletSpeed: 5,  ultimateSpeed: 4,  bulletPower: 14, ultimatePower: 80, healRate: 0.5 },
  { name: 'Sentinel',   attack: 3, hp: 200, speed: 2.0, bulletSpeed: 5,  ultimateSpeed: 4,  bulletPower: 10, ultimatePower: 45, healRate: 1.5 },
];

const MAP_CONFIGS = {
  'training_ground':   { name: '训练场',   size: 'large',       obstacleDensity: 0.025, aiPerMinute: 3 },
  'chaos_starfield':   { name: '混乱星域', size: 'large',       obstacleDensity: 0.055, aiPerMinute: 5 },
  'small_area':        { name: '小地区',   size: 'small',       obstacleDensity: 0,     aiPerMinute: 3 },
  'stone_mountain':    { name: '石山',     size: 'medium',      obstacleDensity: 0.085, aiPerMinute: 3 },
  'sky':               { name: '天空',     size: 'super_large', obstacleDensity: 0,     aiPerMinute: 3 },
  'hell':              { name: '地狱',     size: 'large',       obstacleDensity: 0.155, aiPerMinute: 3 },
};

const MAP_SIZES = {
  'small':        { min: 20, max: 30 },   // 20-30x ship size
  'medium':       { min: 50, max: 60 },   // 50-60x ship size
  'large':        { min: 100, max: 120 }, // 100-120x ship size
  'super_large':  { min: 150, max: 160 }, // 150-160x ship size
};

const COLORS = [
  '#FF4444', '#44FF44', '#4444FF', '#FFFF44', '#FF44FF',
  '#44FFFF', '#FF8800', '#8800FF', '#00FF88', '#FF0088',
  '#0088FF', '#88FF00', '#FF4488', '#88FF88', '#8888FF',
];

const AI_NAMES = [
  'Blaze', 'Nova', 'Vortex', 'Shadow', 'Storm', 'Phantom', 'Titan', 'Raven',
  'Comet', 'Drake', 'Blitz', 'Cipher', 'Omega', 'Razor', 'Venom', 'Atlas',
  'Spectre', 'Havoc', 'Zero', 'Onyx', 'Fury', 'Echo', 'Rogue', 'Apex',
];

const BULLET_SPEED_BASE = 10;
const ULTIMATE_SPEED_BASE = 6;
const BULLET_RADIUS = 4;
const ULTIMATE_RADIUS = 10;
const PLAYER_SHOOT_COOLDOWN = 300; // ms
const PLAYER_ULTIMATE_COOLDOWN = 3000; // ms
const AI_SHOOT_COOLDOWN = 800;
const AI_ULTIMATE_COOLDOWN = 5000;
const WIN_KILLS = 10;

// ==================== HELPERS ====================

function randomInRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRoomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 10; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function randomAI() {
  const typeIdx = Math.floor(Math.random() * SHIP_TYPES.length);
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const name = AI_NAMES[Math.floor(Math.random() * AI_NAMES.length)] + '_' + Math.floor(Math.random() * 100);
  return { name, shipType: SHIP_TYPES[typeIdx], shipTypeIdx: typeIdx, color };
}

function distance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function getMapSize(sizeKey) {
  const range = MAP_SIZES[sizeKey];
  const multiplier = randomInRange(range.min, range.max);
  return multiplier * SHIP_SIZE * 2; // diameter
}

// ==================== GAME ROOM ====================

class GameRoom {
  constructor(id, mapKey) {
    this.id = id;
    this.mapKey = mapKey;
    this.mapConfig = MAP_CONFIGS[mapKey];
    this.mapSize = getMapSize(this.mapConfig.size);
    this.halfMap = this.mapSize / 2;
    this.players = {};       // socketId -> player
    this.aiShips = [];
    this.bullets = [];
    this.obstacles = [];
    this.gameStarted = false;
    this.gameEnded = false;
    this.winner = null;
    this.tickTimer = null;
    this.aiSpawnTimer = null;
    this.aiIdCounter = 0;
    this.bulletIdCounter = 0;
    this.pendingAnnouncements = [];

    this._generateObstacles();
  }

  _generateObstacles() {
    this.obstacles = [];
    const density = this.mapConfig.obstacleDensity;
    if (density === 0) return;

    const totalArea = this.mapSize * this.mapSize;
    const targetObstacleArea = totalArea * density;
    let placedArea = 0;

    const maxAttempts = 2000;
    let attempts = 0;

    while (placedArea < targetObstacleArea && attempts < maxAttempts) {
      attempts++;
      const w = randomInRange(40, 120);
      const h = randomInRange(40, 120);
      const x = Math.random() * (this.mapSize - w);
      const y = Math.random() * (this.mapSize - h);

      // don't place too close to center (spawn area)
      const cx = x + w / 2, cy = y + h / 2;
      if (Math.abs(cx - this.halfMap) < 200 && Math.abs(cy - this.halfMap) < 200) continue;

      // check overlap
      let overlap = false;
      for (const obs of this.obstacles) {
        if (x < obs.x + obs.w + 20 && x + w + 20 > obs.x &&
            y < obs.y + obs.h + 20 && y + h + 20 > obs.y) {
          overlap = true;
          break;
        }
      }
      if (overlap) continue;

      this.obstacles.push({ x, y, w, h });
      placedArea += w * h;
    }
  }

  getPlayerCount() {
    return Object.keys(this.players).length;
  }

  addPlayer(socketId, data) {
    const shipType = SHIP_TYPES[data.shipTypeIdx];
    const spawnPos = this._getRandomSpawn();
    const player = {
      id: socketId,
      name: data.playerName,
      shipType: shipType,
      shipTypeIdx: data.shipTypeIdx,
      color: data.color,
      x: spawnPos.x,
      y: spawnPos.y,
      angle: Math.random() * Math.PI * 2,
      hp: shipType.hp,
      maxHp: shipType.hp,
      kills: 0,
      alive: true,
      // input state
      keys: { up: false, down: false, left: false, right: false },
      mouseAngle: 0,
      shooting: false,
      ultimating: false,
      // cooldowns
      shootCooldown: 0,
      ultimateCooldown: 0,
      // velocity
      vx: 0,
      vy: 0,
      // respawn
      respawnTimer: 0,
      // heal tick accumulator
      healAccum: 0,
    };
    this.players[socketId] = player;
    return player;
  }

  removePlayer(socketId) {
    delete this.players[socketId];
    // if no players left, mark for cleanup
    if (this.getPlayerCount() === 0) {
      this.stopGame();
    }
  }

  _getRandomSpawn() {
    const margin = 100;
    for (let i = 0; i < 50; i++) {
      const x = margin + Math.random() * (this.mapSize - margin * 2);
      const y = margin + Math.random() * (this.mapSize - margin * 2);
      // check not inside obstacle
      let blocked = false;
      for (const obs of this.obstacles) {
        if (x > obs.x - SHIP_SIZE && x < obs.x + obs.w + SHIP_SIZE &&
            y > obs.y - SHIP_SIZE && y < obs.y + obs.h + SHIP_SIZE) {
          blocked = true;
          break;
        }
      }
      if (!blocked) return { x, y };
    }
    return { x: this.halfMap, y: this.halfMap };
  }

  startGame() {
    if (this.gameStarted) return;
    this.gameStarted = true;
    this.gameEnded = false;
    this.winner = null;

    // game loop
    this.tickTimer = setInterval(() => this._tick(), TICK_INTERVAL);

    // AI spawn timer
    const aiInterval = Math.floor(60000 / this.mapConfig.aiPerMinute);
    this.aiSpawnTimer = setInterval(() => this._spawnAI(), aiInterval);

    // Spawn initial AI
    for (let i = 0; i < 3; i++) this._spawnAI();

    console.log(`[${this.id}] Game started on map ${this.mapConfig.name}`);
  }

  stopGame() {
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
    if (this.aiSpawnTimer) { clearInterval(this.aiSpawnTimer); this.aiSpawnTimer = null; }
    this.gameStarted = false;
    this.gameEnded = true;
    console.log(`[${this.id}] Game stopped`);
  }

  _spawnAI() {
    const aiData = randomAI();
    const spawnPos = this._getRandomSpawn();
    const ai = {
      id: `ai_${this.aiIdCounter++}`,
      name: aiData.name,
      shipType: aiData.shipType,
      shipTypeIdx: aiData.shipTypeIdx,
      color: aiData.color,
      x: spawnPos.x,
      y: spawnPos.y,
      angle: Math.random() * Math.PI * 2,
      hp: aiData.shipType.hp,
      maxHp: aiData.shipType.hp,
      kills: 0,
      alive: true,
      targetId: null,
      shootCooldown: 500 + Math.random() * 500,
      ultimateCooldown: 2000 + Math.random() * 3000,
      vx: 0,
      vy: 0,
      aiMoveTimer: 0,
      aiMoveAngle: Math.random() * Math.PI * 2,
      isAI: true,
    };
    this.aiShips.push(ai);
  }

  _tick() {
    if (this.gameEnded) return;

    const dt = TICK_INTERVAL / 1000; // delta time in seconds

    // Update human players
    for (const pid in this.players) {
      const p = this.players[pid];
      if (!p.alive) {
        p.respawnTimer -= TICK_INTERVAL;
        if (p.respawnTimer <= 0) {
          this._respawnPlayer(p);
        }
        continue;
      }

      // movement
      const speed = p.shipType.speed * 60; // pixels per second
      let moveX = 0, moveY = 0;
      if (p.keys.up || p.keys.w) moveY -= 1;
      if (p.keys.down || p.keys.s) moveY += 1;
      if (p.keys.left || p.keys.a) moveX -= 1;
      if (p.keys.right || p.keys.d) moveX += 1;

      if (moveX !== 0 || moveY !== 0) {
        const len = Math.sqrt(moveX * moveX + moveY * moveY);
        moveX /= len;
        moveY /= len;
        p.vx = moveX * speed;
        p.vy = moveY * speed;
      } else {
        p.vx *= 0.9;
        p.vy *= 0.9;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle = p.mouseAngle;

      // bounds
      p.x = Math.max(SHIP_SIZE, Math.min(this.mapSize - SHIP_SIZE, p.x));
      p.y = Math.max(SHIP_SIZE, Math.min(this.mapSize - SHIP_SIZE, p.y));

      // obstacle collision
      for (const obs of this.obstacles) {
        if (this._circleRectCollision(p.x, p.y, SHIP_SIZE, obs)) {
          // push out
          const cx = Math.max(obs.x, Math.min(p.x, obs.x + obs.w));
          const cy = Math.max(obs.y, Math.min(p.y, obs.y + obs.h));
          const dx = p.x - cx, dy = p.y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < SHIP_SIZE && dist > 0) {
            p.x = cx + (dx / dist) * SHIP_SIZE;
            p.y = cy + (dy / dist) * SHIP_SIZE;
          }
          p.vx = 0;
          p.vy = 0;
        }
      }

      // shooting
      p.shootCooldown -= TICK_INTERVAL;
      p.ultimateCooldown -= TICK_INTERVAL;

      if (p.shooting && p.shootCooldown <= 0) {
        this._playerShoot(p);
        p.shootCooldown = PLAYER_SHOOT_COOLDOWN;
      }
      if (p.ultimating && p.ultimateCooldown <= 0) {
        this._playerUltimate(p);
        p.ultimateCooldown = PLAYER_ULTIMATE_COOLDOWN;
      }

      // healing
      p.healAccum += p.shipType.healRate * dt;
      if (p.healAccum >= 1) {
        const healAmount = Math.floor(p.healAccum);
        p.hp = Math.min(p.maxHp, p.hp + healAmount);
        p.healAccum -= healAmount;
      }
    }

    // Update AI ships
    for (const ai of this.aiShips) {
      if (!ai.alive) continue;

      // Find nearest target
      let nearest = null, nearestDist = Infinity;
      for (const pid in this.players) {
        const p = this.players[pid];
        if (!p.alive) continue;
        const d = distance(ai, p);
        if (d < nearestDist) { nearestDist = d; nearest = p; }
      }
      ai.targetId = nearest ? nearest.id : null;

      // AI movement
      ai.aiMoveTimer -= TICK_INTERVAL;
      if (ai.aiMoveTimer <= 0) {
        if (nearest && nearestDist < 600) {
          // move toward target with some randomness
          const dx = nearest.x - ai.x;
          const dy = nearest.y - ai.y;
          ai.aiMoveAngle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.5;
        } else if (nearest) {
          ai.aiMoveAngle = Math.atan2(nearest.y - ai.y, nearest.x - ai.x);
        } else {
          ai.aiMoveAngle += (Math.random() - 0.5) * 1.5;
        }
        ai.aiMoveTimer = 500 + Math.random() * 1000;
      }

      const aiSpeed = ai.shipType.speed * 50;
      ai.vx = Math.cos(ai.aiMoveAngle) * aiSpeed;
      ai.vy = Math.sin(ai.aiMoveAngle) * aiSpeed;
      ai.x += ai.vx * dt;
      ai.y += ai.vy * dt;
      ai.angle = ai.aiMoveAngle;

      ai.x = Math.max(SHIP_SIZE, Math.min(this.mapSize - SHIP_SIZE, ai.x));
      ai.y = Math.max(SHIP_SIZE, Math.min(this.mapSize - SHIP_SIZE, ai.y));

      // obstacle collision for AI
      for (const obs of this.obstacles) {
        if (this._circleRectCollision(ai.x, ai.y, SHIP_SIZE, obs)) {
          const cx = Math.max(obs.x, Math.min(ai.x, obs.x + obs.w));
          const cy = Math.max(obs.y, Math.min(ai.y, obs.y + obs.h));
          const dx = ai.x - cx, dy = ai.y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < SHIP_SIZE && dist > 0) {
            ai.x = cx + (dx / dist) * SHIP_SIZE;
            ai.y = cy + (dy / dist) * SHIP_SIZE;
          }
          ai.aiMoveTimer = 0; // change direction
        }
      }

      // AI shooting
      ai.shootCooldown -= TICK_INTERVAL;
      ai.ultimateCooldown -= TICK_INTERVAL;

      if (nearest && nearestDist < 500) {
        ai.angle = Math.atan2(nearest.y - ai.y, nearest.x - ai.x);
        if (ai.shootCooldown <= 0) {
          this._aiShoot(ai);
          ai.shootCooldown = AI_SHOOT_COOLDOWN + Math.random() * 400;
        }
        if (ai.ultimateCooldown <= 0 && nearestDist < 300) {
          this._aiUltimate(ai);
          ai.ultimateCooldown = AI_ULTIMATE_COOLDOWN + Math.random() * 2000;
        }
      }
    }

    // Update bullets with sub-steps to prevent tunneling through obstacles
    for (const bullet of this.bullets) {
      const bulletR = bullet.isUltimate ? ULTIMATE_RADIUS : BULLET_RADIUS;
      const speed = Math.sqrt(bullet.vx * bullet.vx + bullet.vy * bullet.vy);
      const steps = Math.max(1, Math.ceil(speed * dt / (bulletR * 1.5))); // sub-steps so bullet doesn't skip over obstacles
      const stepDt = dt / steps;

      for (let s = 0; s < steps; s++) {
        bullet.x += bullet.vx * stepDt;
        bullet.y += bullet.vy * stepDt;

        // out of bounds
        if (bullet.x < -50 || bullet.x > this.mapSize + 50 ||
            bullet.y < -50 || bullet.y > this.mapSize + 50) {
          bullet.dead = true;
          break;
        }

        // obstacle collision using circle-rect test
        let hitObs = false;
        for (const obs of this.obstacles) {
          if (this._circleRectCollision(bullet.x, bullet.y, bulletR, obs)) {
            bullet.dead = true;
            hitObs = true;
            break;
          }
        }
        if (hitObs) break;
      }
    }

    // Check bullet collisions with players
    for (const bullet of this.bullets) {
      if (bullet.dead) continue;

      // Bullet vs human players
      for (const pid in this.players) {
        const p = this.players[pid];
        if (!p.alive) continue;
        if (bullet.ownerId === pid) continue; // can't hit self
        if (bullet.isAI && p.id === bullet.ownerId) continue;

        const d = distance(bullet, p);
        const hitRadius = bullet.isUltimate ? ULTIMATE_RADIUS + SHIP_SIZE : BULLET_RADIUS + SHIP_SIZE;
        if (d < hitRadius) {
          p.hp -= bullet.damage;
          bullet.dead = true;

          if (p.hp <= 0) {
            this._onPlayerDeath(p, bullet.ownerId);
          }
          break;
        }
      }

      // Bullet vs AI ships (only player bullets hit AI)
      if (!bullet.dead && !bullet.isAI) {
        for (const ai of this.aiShips) {
          if (!ai.alive) continue;
          const d = distance(bullet, ai);
          const hitRadius = bullet.isUltimate ? ULTIMATE_RADIUS + SHIP_SIZE : BULLET_RADIUS + SHIP_SIZE;
          if (d < hitRadius) {
            ai.hp -= bullet.damage;
            bullet.dead = true;

            if (ai.hp <= 0) {
              this._onAIDeath(ai, bullet.ownerId);
            }
            break;
          }
        }
      }
    }

    // AI bullets vs human players
    for (const bullet of this.bullets) {
      if (bullet.dead) continue;
      if (!bullet.isAI) continue;

      for (const pid in this.players) {
        const p = this.players[pid];
        if (!p.alive) continue;
        const d = distance(bullet, p);
        const hitRadius = bullet.isUltimate ? ULTIMATE_RADIUS + SHIP_SIZE : BULLET_RADIUS + SHIP_SIZE;
        if (d < hitRadius) {
          p.hp -= bullet.damage;
          bullet.dead = true;

          if (p.hp <= 0) {
            this._onPlayerDeath(p, bullet.ownerId);
          }
          break;
        }
      }
    }

    // Cleanup dead bullets
    this.bullets = this.bullets.filter(b => !b.dead);
  }

  _playerShoot(p) {
    const dmg = Math.floor(p.shipType.bulletPower * (1 + p.shipType.attack / 10));
    const bulletSpeed = BULLET_SPEED_BASE + p.shipType.bulletSpeed * 1.5;
    this.bullets.push({
      id: this.bulletIdCounter++,
      x: p.x + Math.cos(p.angle) * SHIP_SIZE,
      y: p.y + Math.sin(p.angle) * SHIP_SIZE,
      vx: Math.cos(p.angle) * bulletSpeed * 35,
      vy: Math.sin(p.angle) * bulletSpeed * 35,
      damage: dmg,
      ownerId: p.id,
      isUltimate: false,
      isAI: false,
      color: p.color,
      dead: false,
    });
  }

  _playerUltimate(p) {
    const dmg = Math.floor(p.shipType.ultimatePower * (1 + p.shipType.attack / 10));
    const bulletSpeed = ULTIMATE_SPEED_BASE + p.shipType.ultimateSpeed * 1.5;
    this.bullets.push({
      id: this.bulletIdCounter++,
      x: p.x + Math.cos(p.angle) * SHIP_SIZE,
      y: p.y + Math.sin(p.angle) * SHIP_SIZE,
      vx: Math.cos(p.angle) * bulletSpeed * 25,
      vy: Math.sin(p.angle) * bulletSpeed * 25,
      damage: dmg,
      ownerId: p.id,
      isUltimate: true,
      isAI: false,
      color: p.color,
      dead: false,
    });
  }

  _aiShoot(ai) {
    const dmg = Math.floor(ai.shipType.bulletPower * (1 + ai.shipType.attack / 15));
    const bulletSpeed = BULLET_SPEED_BASE + ai.shipType.bulletSpeed;
    this.bullets.push({
      id: this.bulletIdCounter++,
      x: ai.x + Math.cos(ai.angle) * SHIP_SIZE,
      y: ai.y + Math.sin(ai.angle) * SHIP_SIZE,
      vx: Math.cos(ai.angle) * bulletSpeed * 35,
      vy: Math.sin(ai.angle) * bulletSpeed * 35,
      damage: dmg,
      ownerId: ai.id,
      isUltimate: false,
      isAI: true,
      color: ai.color,
      dead: false,
    });
  }

  _aiUltimate(ai) {
    const dmg = Math.floor(ai.shipType.ultimatePower * (1 + ai.shipType.attack / 15));
    const bulletSpeed = ULTIMATE_SPEED_BASE + ai.shipType.ultimateSpeed;
    this.bullets.push({
      id: this.bulletIdCounter++,
      x: ai.x + Math.cos(ai.angle) * SHIP_SIZE,
      y: ai.y + Math.sin(ai.angle) * SHIP_SIZE,
      vx: Math.cos(ai.angle) * bulletSpeed * 25,
      vy: Math.sin(ai.angle) * bulletSpeed * 25,
      damage: dmg,
      ownerId: ai.id,
      isUltimate: true,
      isAI: true,
      color: ai.color,
      dead: false,
    });
  }

  _onPlayerDeath(victim, killerId) {
    victim.alive = false;
    victim.respawnTimer = 3000; // 3 second respawn
    victim.hp = 0;

    // Find killer
    let killer = this.players[killerId];
    let killerName = null;
    if (!killer) {
      // might be AI
      killer = this.aiShips.find(a => a.id === killerId);
      if (killer) killerName = killer.name;
    } else {
      killerName = killer.name;
    }

    if (killer && killer !== victim) {
      const killValue = (killer.isAI) ? 0 : 1;
      if (killValue > 0) {
        killer.kills += 1;
      }

      // Announce kill
      if (killerName) {
        this._broadcast(`${killerName} 击杀了 ${victim.name}！`);
      }

      // Check win condition
      if (killer.kills >= WIN_KILLS) {
        this._onGameEnd(killer);
      }
    } else {
      this._broadcast(`${victim.name} 阵亡了`);
    }
  }

  _onAIDeath(ai, killerId) {
    ai.alive = false;

    // Remove AI from array
    this.aiShips = this.aiShips.filter(a => a.id !== ai.id);

    const killer = this.players[killerId];
    if (killer) {
      killer.kills += 0.5;
      this._broadcast(`${killer.name} 摧毁了 AI ${ai.name} (+0.5)`);

      if (killer.kills >= WIN_KILLS) {
        this._onGameEnd(killer);
      }
    }
  }

  _onGameEnd(winner) {
    this.gameEnded = true;
    this.winner = winner;
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
    if (this.aiSpawnTimer) { clearInterval(this.aiSpawnTimer); this.aiSpawnTimer = null; }
    console.log(`[${this.id}] Game over! Winner: ${winner.name}`);
  }

  _respawnPlayer(p) {
    const spawn = this._getRandomSpawn();
    p.x = spawn.x;
    p.y = spawn.y;
    p.hp = p.shipType.hp;
    p.alive = true;
    p.respawnTimer = 0;
    p.vx = 0;
    p.vy = 0;
    p.shootCooldown = 500;
    p.ultimateCooldown = 1000;
  }

  _broadcast(message) {
    this.pendingAnnouncements.push({ message, type: 'kill' });
  }

  _circleRectCollision(cx, cy, r, rect) {
    const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
    const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return (dx * dx + dy * dy) < (r * r);
  }

  getState() {
    const players = {};
    for (const pid in this.players) {
      const p = this.players[pid];
      players[pid] = {
        id: p.id,
        name: p.name,
        shipTypeIdx: p.shipTypeIdx,
        color: p.color,
        x: p.x,
        y: p.y,
        angle: p.angle,
        hp: p.hp,
        maxHp: p.maxHp,
        kills: p.kills,
        alive: p.alive,
        respawnTimer: p.respawnTimer,
      };
    }

    const aiShips = this.aiShips.filter(a => a.alive).map(a => ({
      id: a.id,
      name: a.name,
      shipTypeIdx: a.shipTypeIdx,
      color: a.color,
      x: a.x,
      y: a.y,
      angle: a.angle,
      hp: a.hp,
      maxHp: a.maxHp,
      kills: a.kills,
    }));

    return {
      players,
      aiShips,
      bullets: this.bullets.filter(b => !b.dead),
      obstacles: this.obstacles,
      mapSize: this.mapSize,
      mapKey: this.mapKey,
      gameEnded: this.gameEnded,
      winner: this.winner ? { id: this.winner.id, name: this.winner.name } : null,
    };
  }
}

// ==================== SERVER ====================

const rooms = {}; // roomId -> GameRoom

// Cleanup interval - remove empty/ended rooms
setInterval(() => {
  for (const rid in rooms) {
    const room = rooms[rid];
    if (room.gameEnded || room.getPlayerCount() === 0) {
      room.stopGame();
      delete rooms[rid];
      console.log(`[${rid}] Room cleaned up`);
    }
  }
}, 5000);

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  let currentRoom = null;

  socket.on('get_rooms', () => {
    const roomList = [];
    for (const rid in rooms) {
      const room = rooms[rid];
      if (!room.gameEnded) {
        roomList.push({
          id: room.id,
          mapName: room.mapConfig.name,
          mapKey: room.mapKey,
          playerCount: room.getPlayerCount(),
          gameStarted: room.gameStarted,
        });
      }
    }
    socket.emit('room_list', roomList);
  });

  socket.on('create_room', (data) => {
    try {
      if (!data.mapKey || !MAP_CONFIGS[data.mapKey]) {
        socket.emit('error_msg', { message: '请选择有效的地图' });
        return;
      }
      if (data.shipTypeIdx === undefined || data.shipTypeIdx === null || !SHIP_TYPES[data.shipTypeIdx]) {
        socket.emit('error_msg', { message: '请选择有效的飞船' });
        return;
      }
      if (!data.playerName) {
        socket.emit('error_msg', { message: '请输入名字' });
        return;
      }
      const roomId = generateRoomId();
      const room = new GameRoom(roomId, data.mapKey);
      rooms[roomId] = room;
      const player = room.addPlayer(socket.id, data);
      currentRoom = room;
      socket.join(roomId);
      room.startGame();
      socket.emit('room_joined', { roomId, playerId: socket.id, state: room.getState() });
      io.to(roomId).emit('announcement', { message: `${player.name} 创建了房间！`, type: 'info' });
      console.log(`Room ${roomId} created by ${player.name} on map ${room.mapConfig.name}`);
    } catch (err) {
      console.error('Error creating room:', err);
      socket.emit('error_msg', { message: '创建房间失败: ' + err.message });
    }
  });

  socket.on('join_room', (data) => {
    try {
      const room = rooms[data.roomId];
      if (!room || room.gameEnded) {
        socket.emit('error_msg', { message: '房间不存在或已结束' });
        return;
      }
      if (room.getPlayerCount() >= 20) {
        socket.emit('error_msg', { message: '房间已满（最多20人）' });
        return;
      }
      if (data.shipTypeIdx === undefined || data.shipTypeIdx === null || !SHIP_TYPES[data.shipTypeIdx]) {
        socket.emit('error_msg', { message: '请选择有效的飞船' });
        return;
      }
      if (!data.playerName) {
        socket.emit('error_msg', { message: '请输入名字' });
        return;
      }
      const player = room.addPlayer(socket.id, data);
      currentRoom = room;
      socket.join(data.roomId);
      socket.emit('room_joined', { roomId: data.roomId, playerId: socket.id, state: room.getState() });
      io.to(data.roomId).emit('announcement', { message: `${player.name} 加入了房间！`, type: 'info' });
    } catch (err) {
      console.error('Error joining room:', err);
      socket.emit('error_msg', { message: '加入房间失败: ' + err.message });
    }
  });

  socket.on('player_input', (input) => {
    if (!currentRoom) return;
    const player = currentRoom.players[socket.id];
    if (!player) return;
    player.keys = input.keys || {};
    player.mouseAngle = input.mouseAngle || 0;
    player.shooting = input.shooting || false;
    player.ultimating = input.ultimating || false;
  });

  socket.on('leave_room', () => {
    if (currentRoom) {
      const player = currentRoom.players[socket.id];
      currentRoom.removePlayer(socket.id);
      socket.leave(currentRoom.id);
      if (player) {
        io.to(currentRoom.id).emit('announcement', { message: `${player.name} 离开了房间`, type: 'info' });
      }
      currentRoom = null;
    }
    socket.emit('left_room');
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    if (currentRoom) {
      const player = currentRoom.players[socket.id];
      currentRoom.removePlayer(socket.id);
      socket.leave(currentRoom.id);
      if (player && currentRoom.getPlayerCount() > 0) {
        io.to(currentRoom.id).emit('announcement', { message: `${player.name} 断开了连接`, type: 'info' });
      }
      currentRoom = null;
    }
  });
});

// Broadcast game state to rooms
setInterval(() => {
  for (const rid in rooms) {
    const room = rooms[rid];
    if (room.gameStarted && !room.gameEnded && room.getPlayerCount() > 0) {
      io.to(rid).emit('game_state', room.getState());
      // Send pending announcements
      while (room.pendingAnnouncements.length > 0) {
        const ann = room.pendingAnnouncements.shift();
        io.to(rid).emit('announcement', ann);
      }
    }
    if (room.gameEnded && room.winner && !room._gameOverSent) {
      room._gameOverSent = true;
      io.to(rid).emit('game_over', {
        winner: { id: room.winner.id, name: room.winner.name },
        message: `${room.winner.name} 获得了胜利！（${WIN_KILLS} 击杀）`,
      });
      // Schedule room cleanup
      setTimeout(() => {
        room.stopGame();
        delete rooms[rid];
      }, 15000);
    }
  }
}, TICK_INTERVAL);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Space Battle server running on http://0.0.0.0:${PORT}`);
  console.log(`   Local: http://localhost:${PORT}`);
});

// ==================== ERROR HANDLING ====================
window.onerror = function(msg, url, line, col, err) {
  var bar = document.getElementById('error-bar');
  if (bar) {
    bar.style.display = 'block';
    bar.textContent = 'JS ERROR: ' + msg + ' (line ' + line + ')';
  }
  console.error('Global error:', msg, 'at line', line, err);
  return false;
};

// ==================== CONSOLE LOG HELPER ====================
function log(msg) { console.log('[SpaceBattle] ' + msg); }
function err(msg) { console.error('[SpaceBattle] ' + msg); }

// ==================== GET ELEMENT SAFELY ====================
function getEl(id) {
  var el = document.getElementById(id);
  if (!el) err('Element not found: #' + id);
  return el;
}

// ==================== CONSTANTS ====================
var SHIP_TYPES = [
  { name: 'Scout',      attack: 3, hp: 80,  speed: 6.0, bulletSpeed: 8,  ultimateSpeed: 6,  bulletPower: 10, ultimatePower: 30, healRate: 0.5 },
  { name: 'Fighter',    attack: 5, hp: 100, speed: 4.0, bulletSpeed: 7,  ultimateSpeed: 5,  bulletPower: 15, ultimatePower: 40, healRate: 0.8 },
  { name: 'Tank',       attack: 4, hp: 180, speed: 2.5, bulletSpeed: 5,  ultimateSpeed: 4,  bulletPower: 12, ultimatePower: 35, healRate: 1.0 },
  { name: 'Sniper',     attack: 7, hp: 70,  speed: 3.0, bulletSpeed: 12, ultimateSpeed: 10, bulletPower: 25, ultimatePower: 60, healRate: 0.3 },
  { name: 'Assassin',   attack: 8, hp: 60,  speed: 5.5, bulletSpeed: 9,  ultimateSpeed: 7,  bulletPower: 20, ultimatePower: 50, healRate: 0.4 },
  { name: 'Healer',     attack: 2, hp: 120, speed: 3.5, bulletSpeed: 6,  ultimateSpeed: 5,  bulletPower: 8,  ultimatePower: 20, healRate: 3.0 },
  { name: 'Destroyer',  attack: 6, hp: 140, speed: 2.0, bulletSpeed: 4,  ultimateSpeed: 3,  bulletPower: 18, ultimatePower: 70, healRate: 0.6 },
  { name: 'Interceptor',attack: 4, hp: 90,  speed: 7.0, bulletSpeed: 8,  ultimateSpeed: 7,  bulletPower: 12, ultimatePower: 35, healRate: 0.7 },
  { name: 'Bomber',     attack: 5, hp: 110, speed: 3.0, bulletSpeed: 5,  ultimateSpeed: 4,  bulletPower: 14, ultimatePower: 80, healRate: 0.5 },
  { name: 'Sentinel',   attack: 3, hp: 200, speed: 2.0, bulletSpeed: 5,  ultimateSpeed: 4,  bulletPower: 10, ultimatePower: 45, healRate: 1.5 }
];

var MAP_KEYS = ['training_ground', 'chaos_starfield', 'small_area', 'stone_mountain', 'sky', 'hell'];
var MAP_NAMES = {
  'training_ground': '训练场',
  'chaos_starfield': '混乱星域',
  'small_area': '小地区',
  'stone_mountain': '石山',
  'sky': '天空',
  'hell': '地狱'
};

var COLORS = [
  '#FF4444', '#44FF44', '#4444FF', '#FFFF44', '#FF44FF',
  '#44FFFF', '#FF8800', '#8800FF', '#00FF88', '#FF0088',
  '#0088FF', '#88FF00', '#FF4488', '#88FF88', '#8888FF'
];

// ==================== SOCKET ====================
log('Connecting to server...');
var socket = io();

socket.on('connect', function() {
  log('Socket connected! ID: ' + socket.id);
  var st = getEl('status-text');
  if (st) st.textContent = '已连接到服务器 ✓';
});

socket.on('disconnect', function() {
  err('Socket disconnected!');
  var st = getEl('status-text');
  if (st) st.textContent = '连接断开 ✗';
});

socket.on('connect_error', function(e) {
  err('Connection error: ' + e.message);
  var st = getEl('status-text');
  if (st) st.textContent = '连接失败: ' + e.message;
});

// ==================== STATE ====================
var appState = 'lobby';
var selectedMap = null;
var selectedShipIdx = null;
var selectedColor = null;
var playerName = '';
var joiningRoomId = null;
var isCreating = false;

var myPlayerId = null;
var myRoomId = null;
var prevGameState = null;
var currentGameState = null;
var stateTime = 0;

var mouseX = 0, mouseY = 0;
var mouseDown = false, rightMouseDown = false;
var keys = {};
var stars = [];
var animFrameId = null;
var announceTimeout = null;

// ==================== SCREEN MANAGEMENT ====================

function hideAllSections() {
  var sections = ['section-roomlist', 'section-createmap', 'section-ship', 'section-color', 'section-name'];
  for (var i = 0; i < sections.length; i++) {
    var el = getEl(sections[i]);
    if (el) el.style.display = 'none';
  }
  var lobbyActions = getEl('lobby-actions');
  if (lobbyActions) lobbyActions.style.display = 'none';
}

function showLobbyMain() {
  log('Showing lobby main');
  hideAllSections();
  var lobbyActions = getEl('lobby-actions');
  if (lobbyActions) lobbyActions.style.display = 'flex';
  getEl('lobby-screen').style.display = 'flex';
  getEl('game-screen').style.display = 'none';
  appState = 'lobby';
}

// ==================== STAR BG ====================
for (var si = 0; si < 200; si++) {
  stars.push({
    x: Math.random() * 4000 - 2000,
    y: Math.random() * 4000 - 2000,
    r: Math.random() * 1.5 + 0.5,
    brightness: Math.random() * 0.5 + 0.5
  });
}

// ==================== CREATE ROOM FLOW ====================

function showCreateMap() {
  log('showCreateMap called');
  hideAllSections();
  getEl('section-createmap').style.display = 'block';
  appState = 'create_map';

  var mapList = getEl('map-list');
  mapList.innerHTML = '';
  for (var i = 0; i < MAP_KEYS.length; i++) {
    (function(key) {
      var card = document.createElement('div');
      card.className = 'map-card';
      card.innerHTML = '<h3>' + MAP_NAMES[key] + '</h3><div class="map-desc">选择此地图</div>';
      card.onclick = function() {
        log('Map selected: ' + key);
        selectedMap = key;
        showShipSelect();
      };
      mapList.appendChild(card);
    })(MAP_KEYS[i]);
  }
}

function showShipSelect() {
  log('showShipSelect called');
  hideAllSections();
  getEl('section-ship').style.display = 'block';
  appState = 'ship_select';

  var shipList = getEl('ship-list');
  shipList.innerHTML = '';
  for (var i = 0; i < SHIP_TYPES.length; i++) {
    (function(idx) {
      var ship = SHIP_TYPES[idx];
      var card = document.createElement('div');
      card.className = 'ship-card';
      card.innerHTML = '<h3>' + ship.name + '</h3>' +
        '<div class="ship-stats">' +
        '<div class="ship-stat"><span>攻击</span><span>' + '★'.repeat(ship.attack) + '</span></div>' +
        '<div class="ship-stat"><span>血量</span><span>' + ship.hp + '</span></div>' +
        '<div class="ship-stat"><span>速度</span><span>' + '★'.repeat(Math.round(ship.speed)) + '</span></div>' +
        '<div class="ship-stat"><span>子弹威力</span><span>' + ship.bulletPower + '</span></div>' +
        '<div class="ship-stat"><span>大招威力</span><span>' + ship.ultimatePower + '</span></div>' +
        '<div class="ship-stat"><span>回血</span><span>' + ship.healRate + '/s</span></div>' +
        '</div>';
      card.onclick = function() {
        log('Ship selected: ' + ship.name + ' (idx=' + idx + ')');
        selectedShipIdx = idx;
        showColorSelect();
      };
      shipList.appendChild(card);
    })(i);
  }
}

function showColorSelect() {
  log('showColorSelect called');
  hideAllSections();
  getEl('section-color').style.display = 'block';
  appState = 'color_select';

  var colorList = getEl('color-list');
  colorList.innerHTML = '';
  for (var i = 0; i < COLORS.length; i++) {
    (function(color) {
      var item = document.createElement('div');
      item.className = 'color-item';
      item.style.backgroundColor = color;
      item.onclick = function() {
        log('Color selected: ' + color);
        selectedColor = color;
        showNameInput();
      };
      colorList.appendChild(item);
    })(COLORS[i]);
  }
}

function showNameInput() {
  log('showNameInput called');
  hideAllSections();
  getEl('section-name').style.display = 'block';
  appState = 'name_input';
  var input = getEl('player-name');
  if (input) setTimeout(function() { input.focus(); }, 100);
}

function confirmJoin() {
  log('confirmJoin called. isCreating=' + isCreating + ' selectedMap=' + selectedMap + ' selectedShipIdx=' + selectedShipIdx + ' selectedColor=' + selectedColor);
  var nameInput = getEl('player-name');
  playerName = nameInput ? nameInput.value.trim() : '';

  if (!playerName) { alert('请输入名字！'); return; }
  if (selectedShipIdx === null || selectedShipIdx === undefined) { alert('请选择飞船！'); return; }
  if (!selectedColor) { alert('请选择颜色！'); return; }
  if (isCreating && !selectedMap) { alert('请选择地图！'); return; }

  var data = {
    playerName: playerName,
    shipTypeIdx: selectedShipIdx,
    color: selectedColor
  };

  if (isCreating) {
    data.mapKey = selectedMap;
    log('Emitting create_room: ' + JSON.stringify(data));
    socket.emit('create_room', data);
  } else {
    data.roomId = joiningRoomId;
    log('Emitting join_room: ' + JSON.stringify(data));
    socket.emit('join_room', data);
  }
}

// ==================== JOIN ROOM FLOW ====================

function showRoomList() {
  log('showRoomList called');
  hideAllSections();
  getEl('section-roomlist').style.display = 'block';
  appState = 'room_list';
  socket.emit('get_rooms');
}

socket.on('room_list', function(rooms) {
  log('room_list received: ' + (rooms ? rooms.length : 0) + ' rooms');
  var rl = getEl('room-list');
  rl.innerHTML = '';
  if (!rooms || rooms.length === 0) {
    rl.innerHTML = '<div style="color:#888;padding:20px;">暂无可用房间</div>';
    return;
  }
  for (var i = 0; i < rooms.length; i++) {
    (function(room) {
      var item = document.createElement('div');
      item.className = 'room-item';
      item.innerHTML = '<span class="room-name">' + room.id + '</span><span class="room-info">' + (MAP_NAMES[room.mapKey] || room.mapKey) + ' | ' + room.playerCount + ' 人</span>';
      item.onclick = function() {
        log('Joining room: ' + room.id);
        joiningRoomId = room.id;
        selectedMap = room.mapKey;
        showShipSelect();
      };
      rl.appendChild(item);
    })(rooms[i]);
  }
});

// ==================== BUTTON HANDLERS ====================

getEl('btn-create').onclick = function() {
  log('btn-create clicked');
  isCreating = true;
  joiningRoomId = null;
  showCreateMap();
};

getEl('btn-join').onclick = function() {
  log('btn-join clicked');
  isCreating = false;
  showRoomList();
};

getEl('btn-refresh').onclick = function() { socket.emit('get_rooms'); };
getEl('btn-back-lobby').onclick = showLobbyMain;
getEl('btn-back-create').onclick = showLobbyMain;
getEl('btn-back-ship').onclick = function() {
  if (isCreating) showCreateMap(); else showRoomList();
};
getEl('btn-back-color').onclick = showShipSelect;
getEl('btn-back-name').onclick = showColorSelect;
getEl('btn-confirm-join').onclick = confirmJoin;
getEl('btn-back-to-lobby').onclick = function() { socket.emit('leave_room'); };

var pnInput = getEl('player-name');
if (pnInput) {
  pnInput.onkeydown = function(e) { if (e.key === 'Enter') confirmJoin(); };
}

// ==================== SOCKET GAME EVENTS ====================

socket.on('error_msg', function(data) {
  err('Server error: ' + data.message);
  alert(data.message);
});

socket.on('room_joined', function(data) {
  log('room_joined received! roomId=' + data.roomId + ' playerId=' + data.playerId);
  myPlayerId = data.playerId;
  myRoomId = data.roomId;
  currentGameState = data.state;
  prevGameState = null;
  stateTime = performance.now();
  appState = 'game';
  enterGame();
});

socket.on('game_state', function(state) {
  prevGameState = currentGameState;
  currentGameState = state;
  stateTime = performance.now();
});

socket.on('announcement', function(data) {
  showAnnouncement(data.message);
});

socket.on('game_over', function(data) {
  log('game_over: ' + data.message);
  getEl('game-over-overlay').style.display = 'flex';
  getEl('game-over-message').textContent = data.message;
});

socket.on('left_room', function() {
  log('left_room');
  appState = 'lobby';
  myPlayerId = null;
  myRoomId = null;
  currentGameState = null;
  prevGameState = null;
  showLobbyMain();
});

// ==================== GAME ENTER ====================

function enterGame() {
  log('Entering game screen');
  getEl('lobby-screen').style.display = 'none';
  getEl('game-screen').style.display = 'flex';
  getEl('game-over-overlay').style.display = 'none';
  getEl('respawn-overlay').style.display = 'none';
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  if (animFrameId) cancelAnimationFrame(animFrameId);
  animFrameId = requestAnimationFrame(gameLoop);
}

function resizeCanvas() {
  var c = getEl('game-canvas');
  if (c) {
    c.width = window.innerWidth;
    c.height = window.innerHeight;
  }
}

// ==================== INPUT ====================

document.addEventListener('keydown', function(e) { keys[e.key] = true; });
document.addEventListener('keyup', function(e) { keys[e.key] = false; });

var gc = getEl('game-canvas');
if (gc) {
  gc.addEventListener('mousemove', function(e) { mouseX = e.clientX; mouseY = e.clientY; });
  gc.addEventListener('mousedown', function(e) {
    if (e.button === 0) mouseDown = true;
    if (e.button === 2) rightMouseDown = true;
  });
  gc.addEventListener('mouseup', function(e) {
    if (e.button === 0) mouseDown = false;
    if (e.button === 2) rightMouseDown = false;
  });
  gc.addEventListener('contextmenu', function(e) { e.preventDefault(); });
}

// ==================== RENDER ====================

function safeNum(v, fallback) { return (typeof v === 'number' && isFinite(v)) ? v : (fallback || 0); }

function lerp(a, b, t) {
  a = safeNum(a, 0); b = safeNum(b, 0); t = safeNum(t, 0);
  if (t < 0) t = 0; if (t > 1) t = 1;
  return a + (b - a) * t;
}

function getInterpolatedState() {
  if (!currentGameState) return null;
  if (!prevGameState) return currentGameState;

  var elapsed = performance.now() - stateTime;
  var t = Math.min(Math.max(elapsed, 0) / 50, 1);
  var state = {
    players: {},
    aiShips: [],
    bullets: [],
    obstacles: currentGameState.obstacles || [],
    mapSize: safeNum(currentGameState.mapSize, 4000),
    mapKey: currentGameState.mapKey
  };

  var cpKeys = Object.keys(currentGameState.players || {});
  for (var i = 0; i < cpKeys.length; i++) {
    var pid = cpKeys[i];
    var cp = currentGameState.players[pid];
    var pp = (prevGameState.players || {})[pid];
    if (pp) {
      state.players[pid] = {
        x: lerp(pp.x, cp.x, t),
        y: lerp(pp.y, cp.y, t),
        angle: safeNum(cp.angle, 0),
        name: cp.name,
        color: cp.color || '#ff0000',
        hp: safeNum(cp.hp, 100),
        maxHp: safeNum(cp.maxHp, 100),
        kills: safeNum(cp.kills, 0),
        alive: cp.alive,
        shipTypeIdx: cp.shipTypeIdx,
        respawnTimer: safeNum(cp.respawnTimer, 0)
      };
    } else {
      state.players[pid] = {
        x: safeNum(cp.x, 0), y: safeNum(cp.y, 0),
        angle: safeNum(cp.angle, 0), name: cp.name,
        color: cp.color || '#ff0000',
        hp: safeNum(cp.hp, 100), maxHp: safeNum(cp.maxHp, 100),
        kills: safeNum(cp.kills, 0), alive: cp.alive,
        shipTypeIdx: cp.shipTypeIdx, respawnTimer: safeNum(cp.respawnTimer, 0)
      };
    }
  }

  var caAIs = currentGameState.aiShips || [];
  var paAIs = (prevGameState && prevGameState.aiShips) || [];
  for (var j = 0; j < caAIs.length; j++) {
    var ca = caAIs[j];
    var pa = paAIs[j];
    if (pa) {
      state.aiShips.push({
        x: lerp(pa.x, ca.x, t), y: lerp(pa.y, ca.y, t),
        angle: safeNum(ca.angle, 0), name: ca.name, color: ca.color || '#ff0000',
        hp: safeNum(ca.hp, 100), maxHp: safeNum(ca.maxHp, 100), shipTypeIdx: ca.shipTypeIdx
      });
    } else {
      state.aiShips.push({
        x: safeNum(ca.x, 0), y: safeNum(ca.y, 0),
        angle: safeNum(ca.angle, 0), name: ca.name, color: ca.color || '#ff0000',
        hp: safeNum(ca.hp, 100), maxHp: safeNum(ca.maxHp, 100), shipTypeIdx: ca.shipTypeIdx
      });
    }
  }

  // Bullets - match by ID (not index) for safe interpolation
  var caBullets = currentGameState.bullets || [];
  var paBullets = (prevGameState && prevGameState.bullets) || [];
  // Build prev bullet map by ID
  var paMap = {};
  for (var k = 0; k < paBullets.length; k++) {
    paMap[paBullets[k].id] = paBullets[k];
  }
  for (var k = 0; k < caBullets.length; k++) {
    var cb = caBullets[k];
    var pb = paMap[cb.id];
    if (pb) {
      state.bullets.push({
        x: lerp(pb.x, cb.x, t), y: lerp(pb.y, cb.y, t),
        vx: cb.vx, vy: cb.vy,
        damage: cb.damage, ownerId: cb.ownerId,
        isUltimate: cb.isUltimate, isAI: cb.isAI,
        color: cb.color || '#ffff44',
        id: cb.id
      });
    } else {
      state.bullets.push(cb);
    }
  }

  return state;
}

function getCamera(state) {
  if (!state) return { x: 0, y: 0 };
  var me = (state.players || {})[myPlayerId];
  var gw = window.innerWidth || 800;
  var gh = window.innerHeight || 600;
  if (!me || !me.alive) {
    var ms = safeNum(state.mapSize, 4000);
    return { x: ms / 2 - gw / 2, y: ms / 2 - gh / 2 };
  }
  return { x: safeNum(me.x, 0) - gw / 2, y: safeNum(me.y, 0) - gh / 2 };
}

function worldToScreen(wx, wy, cam) {
  return { x: safeNum(wx, 0) - safeNum(cam.x, 0), y: safeNum(wy, 0) - safeNum(cam.y, 0) };
}

function drawShip(ctx, x, y, angle, color, name, hp, maxHp, isAI) {
  ctx.globalAlpha = 1;
  var cx = safeNum(x, -100);
  var cy = safeNum(y, -100);
  var c = color || '#ff0000';

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(safeNum(angle, 0));

  // === Ship design: triangle nose + rectangular body ===
  // Rectangle body (aft section)
  var bw = 12, bh = 16;  // body half-width, half-height
  ctx.fillStyle = c;
  ctx.fillRect(-14, -bh, bw * 1.2, bh * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(-14, -bh, bw * 1.2, bh * 2);

  // Triangle nose (pointing right/forward)
  var noseLen = 16;
  ctx.beginPath();
  ctx.moveTo(noseLen, 0);           // tip
  ctx.lineTo(0, -bh * 0.9);          // top of nose meeting body
  ctx.lineTo(0, bh * 0.9);          // bottom of nose meeting body
  ctx.closePath();

  var gradNose = ctx.createLinearGradient(0, 0, noseLen, 0);
  gradNose.addColorStop(0, c);
  gradNose.addColorStop(1, '#ffffff');
  ctx.fillStyle = gradNose;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Engine glow (at the back)
  ctx.beginPath();
  ctx.arc(-14, -bh * 0.5, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#ffaa00';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-14, bh * 0.5, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#ffaa00';
  ctx.fill();

  // Cockpit window on the body
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(-6, -5, 8, 10);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(-6, -5, 8, 10);

  ctx.restore();

  // Name tag (screen-space, above ship)
  ctx.fillStyle = isAI ? '#ffaa88' : '#ffffff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(name, cx, cy - 28);

  // HP bar (below ship)
  var barW = 40, barH = 4, barY = cy + 22;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(cx - barW / 2, barY, barW, barH);
  var ratio = Math.max(0, hp / maxHp);
  ctx.fillStyle = ratio > 0.5 ? '#44ff44' : ratio > 0.25 ? '#ffaa00' : '#ff4444';
  ctx.fillRect(cx - barW / 2, barY, barW * ratio, barH);
}

function drawBullet(ctx, bullet, isUltimate) {
  var bx = safeNum(bullet.x, -100);
  var by = safeNum(bullet.y, -100);
  var color = bullet.color || (bullet.isAI ? '#ff6644' : '#ffff44');

  if (isUltimate) {
    // Large glowing ultimate projectile
    var r = 22;
    // Outer glow (big)
    var grad = ctx.createRadialGradient(bx, by, r * 0.3, bx, by, r * 2.5);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.15, color);
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(bx, by, r * 2.5, 0, Math.PI * 2); ctx.fill();
    // Main body
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
    // Inner bright core
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(bx, by, r * 0.5, 0, Math.PI * 2); ctx.fill();
    // Extra spark
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(bx, by, r * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  } else {
    // Normal bullet - colored circle, bigger & brighter
    var br = 8;  // 8px radius = 16px diameter, up from 5px
    // Outer glow
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    // Bright white center core
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(bx, by, br * 0.45, 0, Math.PI * 2); ctx.fill();
  }
}

// ==================== GAME LOOP ====================

function gameLoop() {
  if (appState !== 'game') return;
  animFrameId = requestAnimationFrame(gameLoop);

  var state = getInterpolatedState();
  if (!state) return;

  var canvas = getEl('game-canvas');
  var minimap = getEl('minimap-canvas');
  if (!canvas || !minimap) return;
  var ctx = canvas.getContext('2d');
  var mctx = minimap.getContext('2d');
  if (!ctx || !mctx) return;

  var cam = getCamera(state);
  var gw = canvas.width, gh = canvas.height;

  // Clear
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, gw, gh);

  // Stars
  ctx.fillStyle = '#ffffff';
  for (var si = 0; si < stars.length; si++) {
    var star = stars[si];
    var sx = ((star.x - cam.x * 0.3) % (gw + 200) + gw + 200) % (gw + 200) - 100;
    var sy = ((star.y - cam.y * 0.3) % (gh + 200) + gh + 200) % (gh + 200) - 100;
    ctx.globalAlpha = 0.4 + star.brightness * 0.6;
    ctx.beginPath(); ctx.arc(sx, sy, star.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Map border
  ctx.strokeStyle = 'rgba(100, 150, 255, 0.3)';
  ctx.lineWidth = 3;
  var b = worldToScreen(0, 0, cam);
  ctx.strokeRect(b.x, b.y, state.mapSize, state.mapSize);

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  var gs = 200;
  var gxStart = Math.floor(cam.x / gs) * gs;
  var gyStart = Math.floor(cam.y / gs) * gs;
  for (var gx = gxStart; gx < cam.x + gw + gs; gx += gs) {
    var s = worldToScreen(gx, 0, cam);
    ctx.beginPath(); ctx.moveTo(s.x, 0); ctx.lineTo(s.x, gh); ctx.stroke();
  }
  for (var gy = gyStart; gy < cam.y + gh + gs; gy += gs) {
    var s2 = worldToScreen(0, gy, cam);
    ctx.beginPath(); ctx.moveTo(0, s2.y); ctx.lineTo(gw, s2.y); ctx.stroke();
  }

  // Obstacles (asteroid rocks)
  var obstacles = state.obstacles || [];
  for (var oi = 0; oi < obstacles.length; oi++) {
    var obs = obstacles[oi];
    var os = worldToScreen(obs.x, obs.y, cam);
    if (os.x + obs.w < -50 || os.x > gw + 50 || os.y + obs.h < -50 || os.y > gh + 50) continue;
    ctx.fillStyle = '#2a2a3a';
    ctx.strokeStyle = 'rgba(150,150,180,0.4)';
    ctx.lineWidth = 1.5;
    ctx.fillRect(os.x + 2, os.y + 2, obs.w - 4, obs.h - 4);
    ctx.strokeRect(os.x, os.y, obs.w, obs.h);
    // Highlight edge
    ctx.strokeStyle = 'rgba(200,200,255,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(os.x + 1, os.y + 1, obs.w - 2, obs.h - 2);
  }

  // AI ships
  var aiShips = state.aiShips || [];
  for (var ai = 0; ai < aiShips.length; ai++) {
    var a = aiShips[ai];
    var as = worldToScreen(a.x, a.y, cam);
    if (as.x < -50 || as.x > gw + 50 || as.y < -50 || as.y > gh + 50) continue;
    drawShip(ctx, as.x, as.y, a.angle, a.color, a.name, a.hp, a.maxHp, true);
  }

  // Players
  var pids = Object.keys(state.players || {});
  for (var pi = 0; pi < pids.length; pi++) {
    var p = state.players[pids[pi]];
    if (!p.alive) continue;
    var ps = worldToScreen(p.x, p.y, cam);
    drawShip(ctx, ps.x, ps.y, p.angle, p.color, p.name, p.hp, p.maxHp, false);
  }

  // Bullets
  var bullets = state.bullets || [];
  for (var bi = 0; bi < bullets.length; bi++) {
    var bullet = bullets[bi];
    var bs = worldToScreen(bullet.x, bullet.y, cam);
    if (bs.x < -50 || bs.x > gw + 50 || bs.y < -50 || bs.y > gh + 50) continue;
    drawBullet(ctx, { x: bs.x, y: bs.y, isAI: bullet.isAI, color: bullet.color }, bullet.isUltimate);
  }

  // Crosshair
  var me = (state.players || {})[myPlayerId];
  if (me && me.alive) {
    var ms = worldToScreen(me.x, me.y, cam);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 8]);
    ctx.beginPath(); ctx.moveTo(ms.x, ms.y); ctx.lineTo(mouseX, mouseY); ctx.stroke();
    ctx.setLineDash([]);
    var cr = 12;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(mouseX, mouseY, cr, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mouseX - cr - 4, mouseY); ctx.lineTo(mouseX + cr + 4, mouseY);
    ctx.moveTo(mouseX, mouseY - cr - 4); ctx.lineTo(mouseX, mouseY + cr + 4);
    ctx.stroke();
  }

  // HUD
  if (me) {
    var hpRatio = Math.max(0, me.hp / me.maxHp);
    getEl('hp-bar-fill').style.width = (hpRatio * 100) + '%';
    getEl('hp-text').textContent = Math.max(0, Math.ceil(me.hp)) + '/' + me.maxHp;
    getEl('kill-count').textContent = '击杀: ' + me.kills;
    getEl('room-info').textContent = (myRoomId || '') + ' | ' + (MAP_NAMES[state.mapKey] || state.mapKey);
  }

  // Minimap
  var mw = 180, mh = 180;
  var scale = mw / state.mapSize;
  mctx.clearRect(0, 0, mw, mh);
  mctx.fillStyle = 'rgba(0,0,0,0.6)';
  mctx.fillRect(0, 0, mw, mh);
  mctx.strokeStyle = 'rgba(255,255,255,0.3)';
  mctx.lineWidth = 1;
  mctx.strokeRect(0, 0, mw, mh);

  for (var oi2 = 0; oi2 < obstacles.length; oi2++) {
    var o = obstacles[oi2];
    mctx.fillStyle = 'rgba(100,100,120,0.6)';
    mctx.fillRect(o.x * scale, o.y * scale, o.w * scale, o.h * scale);
  }
  for (var ai2 = 0; ai2 < aiShips.length; ai2++) {
    var a2 = aiShips[ai2];
    mctx.fillStyle = '#ff4444';
    mctx.beginPath(); mctx.arc(a2.x * scale, a2.y * scale, 2.5, 0, Math.PI * 2); mctx.fill();
  }
  for (var pi2 = 0; pi2 < pids.length; pi2++) {
    var p2 = state.players[pids[pi2]];
    if (!p2.alive) continue;
    mctx.fillStyle = pids[pi2] === myPlayerId ? '#00ff00' : p2.color;
    mctx.beginPath(); mctx.arc(p2.x * scale, p2.y * scale, 3, 0, Math.PI * 2); mctx.fill();
    mctx.strokeStyle = '#fff';
    mctx.beginPath();
    mctx.moveTo(p2.x * scale, p2.y * scale);
    mctx.lineTo((p2.x + Math.cos(p2.angle) * 40) * scale, (p2.y + Math.sin(p2.angle) * 40) * scale);
    mctx.stroke();
  }

  // Respawn overlay
  if (me && !me.alive) {
    getEl('respawn-overlay').style.display = 'flex';
    getEl('respawn-timer').textContent = '重生中... ' + Math.ceil((me.respawnTimer || 3000) / 1000);
  } else {
    getEl('respawn-overlay').style.display = 'none';
  }

  // Send input
  if (me && me.alive) {
    var msc = worldToScreen(me.x, me.y, cam);
    var mx = mouseX - msc.x;
    var my = mouseY - msc.y;
    var mouseAngle = Math.atan2(my, mx);
    socket.emit('player_input', {
      keys: {
        up: !!(keys['w'] || keys['W'] || keys['ArrowUp']),
        down: !!(keys['s'] || keys['S'] || keys['ArrowDown']),
        left: !!(keys['a'] || keys['A'] || keys['ArrowLeft']),
        right: !!(keys['d'] || keys['D'] || keys['ArrowRight'])
      },
      mouseAngle: mouseAngle,
      shooting: !!(mouseDown || keys['h'] || keys['H']),
      ultimating: !!(rightMouseDown || keys['j'] || keys['J'])
    });
  }
}

function showAnnouncement(msg) {
  var el = getEl('announcement-text');
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = '1';
  if (announceTimeout) clearTimeout(announceTimeout);
  announceTimeout = setTimeout(function() { el.style.opacity = '0'; }, 4000);
}

// ==================== INIT ====================
log('Initializing...');
showLobbyMain();
log('Client ready!');

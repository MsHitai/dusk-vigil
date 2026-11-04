// Screens, input, rendering and menus. The run itself is simulated in game.js.
(function () {
  'use strict';
  const { MAPS, MAP_ORDER, CHARS, CHAR_ORDER, WEAPONS, WEAPON_ORDER, PASSIVES, PASSIVE_ORDER, SHOP, RUN_SECONDS } = DV_DATA;
  const { Game, weaponMax, levelText } = DV;
  const $ = (id) => document.getElementById(id);

  Sprites.init();

  // ------------------------------------------------------------ save data
  const defaults = {
    gold: 0, shop: {}, unlocked: {}, discovered: {}, best: {}, wins: {}, hardWins: {}, hardUnlocked: false,
    runs: 0, totalKills: 0, char: 'knight', hard: false, nums: true, seenHelp: false,
    map: 'forest', mapUnlocked: {}, bestMap: {}, winsMap: {},
  };
  let save = defaults;
  try { save = Object.assign({}, defaults, JSON.parse(localStorage.getItem('dv_save') || '{}')); } catch (e) { /* fresh */ }
  const persist = () => { try { localStorage.setItem('dv_save', JSON.stringify(save)); } catch (e) { /* ignore */ } };
  const isUnlocked = (id) => !CHARS[id].unlock || save.unlocked[id];
  const mapUnlocked = (id) => !MAPS[id].unlock || save.mapUnlocked[id];

  // ------------------------------------------------------------ helpers
  const fmtTime = (s) => { s = Math.max(0, Math.floor(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  const icon = (name, scale) => Sprites.portrait(name, scale || 2);
  const itemName = (id) => (WEAPONS[id] || PASSIVES[id]).name;
  const itemIcon = (id) => (WEAPONS[id] || PASSIVES[id]).icon;
  function fill(el, html, canvases) {
    el.innerHTML = html;
    if (canvases) el.querySelectorAll('[data-icon]').forEach((slot) => slot.replaceWith(icon(slot.dataset.icon, +slot.dataset.s || 2)));
  }
  let toastTimer = null;
  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  // -------------------------------------------------------------- screens
  let screen = 'title';
  function show(name) {
    screen = name;
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
    if (name === 'title') { stage = 'forest'; Sound.music('title'); syncTitle(); }
  }
  document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { Sound.sfx('click'); show('title'); }));

  // ---------------------------------------------------------------- modal
  function openModal(html) {
    fill($('modal-box'), html, true);
    $('modal').classList.remove('hidden');
    $('modal-box').scrollTop = 0;
  }
  function closeModal() { $('modal').classList.add('hidden'); }
  const modalOpen = () => !$('modal').classList.contains('hidden');

  // ------------------------------------------------------------- canvas
  const cv = $('world');
  const g = cv.getContext('2d');
  let W = 0, H = 0, S = 3, dpr = 1;
  function resize() {
    dpr = Math.min(3, window.devicePixelRatio || 1);
    W = Math.round(cv.clientWidth * dpr);
    H = Math.round(cv.clientHeight * dpr);
    cv.width = W; cv.height = H;
    // Integer pixel scale so the art stays crisp; about 270 world pixels across a phone.
    S = Math.max(1, Math.round(Math.min(W / 270, H / 400)));
    if (game) { game.viewW = W / S; game.viewH = H / S; }
  }
  window.addEventListener('resize', resize);

  // Ground tiles, one per stage, generated once (256px, seamless enough with the speckle noise).
  const TILE = 256;
  function speckle(x, rng, dots) {
    for (const [col, n] of dots) { x.fillStyle = col; for (let i = 0; i < n; i++) x.fillRect(Math.floor(rng() * TILE), Math.floor(rng() * TILE), 1 + (rng() < 0.3 ? 1 : 0), 1); }
  }
  const GROUNDS = {
    // Dark forest floor with grass tufts, dirt and little flowers.
    forest(x, rng) {
      x.fillStyle = '#222e1e'; x.fillRect(0, 0, TILE, TILE);
      speckle(x, rng, [['#28361f', 3600], ['#1c2618', 2800], ['#30402a', 900], ['#182016', 800]]);
      for (let i = 0; i < 7; i++) {
        const cx = rng() * TILE, cy = rng() * TILE, r = 5 + rng() * 14;
        for (let k = 0; k < r * 12; k++) {
          const a = rng() * 6.28, d = Math.sqrt(rng()) * r;
          x.fillStyle = rng() < 0.5 ? '#2a2420' : '#241e1a';
          x.fillRect(Math.floor((cx + Math.cos(a) * d) % TILE), Math.floor((cy + Math.sin(a) * d * 0.6) % TILE), 1, 1);
        }
      }
      for (let i = 0; i < 110; i++) {
        const gx = Math.floor(rng() * TILE), gy = Math.floor(rng() * TILE);
        x.fillStyle = '#34482c'; x.fillRect(gx, gy, 1, 2); x.fillRect(gx + 2, gy, 1, 2);
        x.fillStyle = '#2c3e26'; x.fillRect(gx + 1, gy + 1, 1, 2);
      }
      for (let i = 0; i < 30; i++) { x.fillStyle = ['#c03040', '#d8d0e8', '#8a6ac8'][i % 3]; x.fillRect(Math.floor(rng() * TILE), Math.floor(rng() * TILE), 1, 1); }
    },
    // Worn flagstones in a brick bond, with cracks, moss and puddles.
    crypt(x, rng) {
      x.fillStyle = '#121019'; x.fillRect(0, 0, TILE, TILE);
      const shades = ['#2a2834', '#26242f', '#2e2c38', '#232130', '#29262f'];
      for (let row = 0; row < TILE / 16; row++) {
        const off = row % 2 ? 8 : 0;
        for (let col = -1; col < TILE / 16; col++) {
          const sx = col * 16 + off, sy = row * 16;
          x.fillStyle = shades[Math.floor(rng() * shades.length)];
          x.fillRect(sx + 1, sy + 1, 15, 15);
          x.fillStyle = 'rgba(255,255,255,0.04)'; x.fillRect(sx + 1, sy + 1, 15, 1);
          if (rng() < 0.15) { // crack
            x.fillStyle = '#16141c';
            let cx = sx + 3 + rng() * 10, cy = sy + 2;
            for (let k = 0; k < 10; k++) { x.fillRect(Math.floor(cx), Math.floor(cy), 1, 1); cx += rng() * 2 - 1; cy += 1.2; }
          }
        }
      }
      speckle(x, rng, [['#34323f', 900], ['#1a1822', 900], ['#2a3a34', 160]]);
      for (let i = 0; i < 4; i++) { // puddles
        const cx = rng() * TILE, cy = rng() * TILE, rx = 6 + rng() * 10;
        x.fillStyle = 'rgba(40,60,90,0.35)'; x.beginPath(); x.ellipse(cx, cy, rx, rx * 0.45, 0, 0, 6.29); x.fill();
        x.fillStyle = 'rgba(160,190,230,0.15)'; x.fillRect(Math.floor(cx - rx / 2), Math.floor(cy - 1), Math.floor(rx / 2), 1);
      }
    },
    // Black basalt split by glowing lava cracks and stray embers.
    depths(x, rng) {
      x.fillStyle = '#1c1312'; x.fillRect(0, 0, TILE, TILE);
      speckle(x, rng, [['#241816', 3200], ['#140d0c', 2600], ['#2e1e1a', 800], ['#3a2420', 200]]);
      for (let i = 0; i < 9; i++) {
        let cx = rng() * TILE, cy = rng() * TILE, a = rng() * 6.28;
        const len = 20 + rng() * 50;
        for (let k = 0; k < len; k++) {
          const px = ((Math.floor(cx) % TILE) + TILE) % TILE, py = ((Math.floor(cy) % TILE) + TILE) % TILE;
          x.fillStyle = 'rgba(160,40,10,0.35)'; x.fillRect(px - 1, py - 1, 3, 3);
          x.fillStyle = k % 7 === 0 ? '#ffd060' : '#ff6a20'; x.fillRect(px, py, 1, 1);
          cx += Math.cos(a); cy += Math.sin(a); a += (rng() - 0.5) * 0.8;
        }
      }
      speckle(x, rng, [['#ff8a30', 40], ['#ffd060', 14]]);
    },
    // Dark marble checker with a red carpet runner and gold trim.
    castle(x, rng) {
      for (let r = 0; r < TILE / 16; r++) {
        for (let c = 0; c < TILE / 16; c++) {
          x.fillStyle = (r + c) % 2 ? '#262030' : '#1e1928';
          x.fillRect(c * 16, r * 16, 16, 16);
          x.fillStyle = 'rgba(255,255,255,0.03)'; x.fillRect(c * 16, r * 16, 16, 1);
          if (rng() < 0.3) { // marble vein
            x.fillStyle = 'rgba(200,180,230,0.07)';
            let vx = c * 16 + rng() * 16, vy = r * 16;
            for (let k = 0; k < 16; k++) { x.fillRect(Math.floor(vx), Math.floor(vy), 1, 1); vx += rng() - 0.5; vy += 1; }
          }
        }
      }
      speckle(x, rng, [['#2c2438', 500], ['#16121e', 500]]);
      x.fillStyle = '#4a1420'; x.fillRect(104, 0, 48, TILE);
      x.fillStyle = '#5a1a26';
      for (let y = 0; y < TILE; y += 4) x.fillRect(108, y, 40, 2);
      x.fillStyle = '#b88a18'; x.fillRect(104, 0, 2, TILE); x.fillRect(150, 0, 2, TILE);
      x.fillStyle = '#7a5810'; x.fillRect(107, 0, 1, TILE); x.fillRect(148, 0, 1, TILE);
    },
  };
  const groundCache = {};
  function groundFor(map) {
    if (!groundCache[map]) {
      const c = document.createElement('canvas');
      c.width = TILE; c.height = TILE;
      GROUNDS[map](c.getContext('2d'), DV.makeRng(1234));
      groundCache[map] = c;
    }
    return groundCache[map];
  }

  // Decor per stage: sprite, chance per 96px cell, whether it is tall (drawn over monsters),
  // whether it glows, and an optional tint [colour, amount] to sit the shooter props into the night.
  const DECOR_SETS = {
    forest: [['tree', 0.16, true], ['deadtree', 0.08, true], ['grave', 0.1], ['bush', 0.21]],
    crypt: [['p_pillar', 0.1, true, false, ['#2a2040', 0.35]], ['p_column', 0.05, true, false, ['#2a2040', 0.45]], ['p_urn', 0.08, false, false, ['#2a2040', 0.3]],
      ['grave', 0.08], ['bones', 0.12], ['p_debris', 0.1, false, false, ['#2a2040', 0.3]], ['p_barrel', 0.04, false, false, ['#2a2040', 0.4]],
      ['p_lamp', 0.03, true, true, ['#2a2040', 0.3]]],
    depths: [['p_rock', 0.1, true, false, ['#3a1410', 0.55]], ['p_boulder', 0.12, false, false, ['#3a1410', 0.5]], ['p_crystal', 0.07, true, true, ['#ff4020', 0.55]],
      ['p_drum_fire', 0.05, false, true], ['deadtree', 0.06, true], ['bones', 0.08], ['p_debris', 0.08, false, false, ['#3a1410', 0.5]]],
    castle: [['p_column', 0.12, true, false, ['#3a2a50', 0.3]], ['p_pedestal', 0.07, false, false, ['#3a2a50', 0.3]], ['p_urn', 0.09, false, false, ['#3a2a50', 0.2]],
      ['p_lamp', 0.06, true, true, ['#3a2a50', 0.2]], ['p_crate', 0.04, false, false, ['#3a2a50', 0.35]], ['p_debris', 0.06, false, false, ['#3a2a50', 0.35]]],
  };
  let stage = 'forest';

  // Soft round glows, pre-rendered once.
  function glow(r, inner, outer) {
    const c = document.createElement('canvas');
    c.width = c.height = r * 2;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, inner); gr.addColorStop(0.4, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, r * 2, r * 2);
    return c;
  }
  const GLOW = {
    bolt: glow(8, '#ffffff', 'rgba(79,211,255,0.8)'),
    torrent: glow(8, '#ffffff', 'rgba(208,122,255,0.85)'),
    ebullet: glow(7, '#ffd0e0', 'rgba(200,40,80,0.9)'),
    ember: glow(7, '#fff0b0', 'rgba(255,110,20,0.9)'),
    fire: glow(32, 'rgba(255,230,120,0.75)', 'rgba(255,100,20,0.45)'),
    hell: glow(32, 'rgba(255,200,255,0.75)', 'rgba(150,40,220,0.5)'),
    light: glow(32, 'rgba(255,220,120,0.35)', 'rgba(255,140,40,0.12)'),
    shadow: (() => { const c = document.createElement('canvas'); c.width = 16; c.height = 6; const x = c.getContext('2d'); x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.ellipse(8, 3, 7, 2.5, 0, 0, 6.29); x.fill(); return c; })(),
  };

  function hash(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function drawGround(cx, cy, vw, vh) {
    const tile = groundFor(stage);
    const x0 = Math.floor((cx - vw / 2) / TILE) * TILE, y0 = Math.floor((cy - vh / 2) / TILE) * TILE;
    for (let x = x0; x < cx + vw / 2; x += TILE) for (let y = y0; y < cy + vh / 2; y += TILE) g.drawImage(tile, x, y);
  }
  // Decorations live on a 96px grid, picked by a hash so they stay put as you walk.
  const DECOR = 96;
  function drawDecor(cx, cy, vw, vh, under, t) {
    const set = DECOR_SETS[stage];
    const x0 = Math.floor((cx - vw / 2 - 48) / DECOR), x1 = Math.floor((cx + vw / 2 + 32) / DECOR);
    const y0 = Math.floor((cy - vh / 2 - 48) / DECOR), y1 = Math.floor((cy + vh / 2 + 48) / DECOR);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        let h = hash(gx, gy), d = null;
        for (const item of set) { if (h < item[1]) { d = item; break; } h -= item[1]; }
        if (!d) continue;
        const [name, , tall, lit, tn] = d;
        if (!!tall === under) continue;
        const spr = tn ? Sprites.tinted(name, tn[0], tn[1]) : Sprites.get(name);
        if (!spr) continue;
        const px = gx * DECOR + Math.floor(hash(gy, gx) * 60) + 10, py = gy * DECOR + Math.floor(hash(gx + 7, gy) * 60) + 10;
        if (tall) g.drawImage(GLOW.shadow, px - 4, py + spr.height - 4, spr.width + 8, 8);
        if (lit) {
          g.globalAlpha = 0.5 + Math.sin((t || 0) * 7 + gx * 3) * 0.12;
          g.drawImage(GLOW.light, px + spr.width / 2 - 28, py - 10, 56, 56);
          g.globalAlpha = 1;
        }
        g.drawImage(spr, px, py);
      }
    }
  }

  // ------------------------------------------------------------ input
  const keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    if (e.key === 'Escape' || e.key === 'p') { if (screen === 'game') togglePause(); }
    if (screen === 'game' && game && /^[1-4]$/.test(e.key) && game.state === 'levelup' && modalOpen()) pickChoice(+e.key - 1);
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  // Floating joystick: touch anywhere and drag.
  const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0, active: false };
  cv.addEventListener('pointerdown', (e) => {
    Sound.init();
    if (screen !== 'game' || stick.id !== null) return;
    stick.id = e.pointerId; stick.active = true;
    stick.ox = stick.x = e.clientX; stick.oy = stick.y = e.clientY;
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', (e) => { if (e.pointerId === stick.id) { stick.x = e.clientX; stick.y = e.clientY; } });
  const endStick = (e) => { if (e.pointerId === stick.id) { stick.id = null; stick.active = false; } };
  cv.addEventListener('pointerup', endStick);
  cv.addEventListener('pointercancel', endStick);

  function readInput() {
    let x = 0, y = 0;
    if (keys.a || keys.arrowleft) x -= 1;
    if (keys.d || keys.arrowright) x += 1;
    if (keys.w || keys.arrowup) y -= 1;
    if (keys.s || keys.arrowdown) y += 1;
    if (stick.active) {
      const dx = stick.x - stick.ox, dy = stick.y - stick.oy, d = Math.hypot(dx, dy), R = 38;
      if (d > 4) { x = dx / Math.max(d, R); y = dy / Math.max(d, R); }
      // Drag the base along when the finger goes far, so you never run out of stick.
      if (d > R * 1.6) { stick.ox = stick.x - dx / d * R * 1.6; stick.oy = stick.y - dy / d * R * 1.6; }
    }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  // ------------------------------------------------------------ run state
  let game = null;
  let paused = false;
  let particles = [];
  let nums = [];
  let flashT = 0;
  let shake = 0;
  let iconSig = '';
  let lastTimer = -1;
  let bannerTimer = null;

  let musicSeed = 1;
  // The stage's own tune: hand-written for the forest, composed fresh each run for the others.
  const stageMusic = (boss) => Sound.music(boss ? MAPS[stage].boss : MAPS[stage].music, musicSeed + (boss ? 1 : 0));

  function startRun(charId) {
    Sound.init();
    if (!mapUnlocked(save.map)) save.map = 'forest';
    stage = save.map;
    musicSeed = (Math.random() * 1e9) | 0;
    game = new Game({ char: charId, map: stage, shop: save.shop, hard: save.hard && save.hardUnlocked, seed: (Math.random() * 1e9) | 0 });
    resize();
    particles = []; nums = []; iconSig = ''; lastTimer = -1; paused = false;
    $('bossbar').classList.add('hidden');
    $('timer').classList.remove('final');
    save.char = charId; persist();
    show('game');
    stageMusic(false);
    banner(MAPS[stage].name);
    if (!save.seenHelp) { save.seenHelp = true; persist(); showHelp(true); }
  }

  function banner(text, boss) {
    const b = $('banner');
    b.textContent = text;
    b.className = 'show' + (boss ? ' boss' : '');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { b.className = ''; }, 2600);
  }

  function handleEvents() {
    const p = game.player;
    for (const ev of game.out) {
      switch (ev.t) {
        case 'sfx': Sound.sfx(ev.n); break;
        case 'num':
          Sound.sfx('hit');
          if (save.nums && nums.length < 80) nums.push({ x: ev.x + (Math.random() - 0.5) * 6, y: ev.y, v: ev.v, t: 0 });
          break;
        case 'kill': {
          const n = ev.boss ? 40 : ev.prop ? 10 : 5;
          const cols = ev.prop ? ['#ffe060', '#ff9a30', '#8a8496'] : ['#e0d8e8', '#a01828', '#5a1a26', '#ffffff'];
          for (let i = 0; i < n && particles.length < 400; i++) {
            const a = Math.random() * 6.28, sp = 20 + Math.random() * (ev.boss ? 120 : 50);
            particles.push({ x: ev.x, y: ev.y - 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, t: 0, life: 0.35 + Math.random() * 0.3, c: cols[i % cols.length] });
          }
          if (ev.boss) shake = 0.5;
          break;
        }
        case 'boss':
          banner(ev.final ? ev.name + ' awakens' : ev.name + ' approaches', true);
          Sound.sfx('boss');
          stageMusic(true);
          if (ev.final) $('timer').classList.add('final');
          break;
        case 'warn': banner(ev.text); Sound.sfx('warn'); break;
        case 'evo': save.discovered[ev.id] = true; persist(); break;
        case 'flash': flashT = 0.35; shake = 0.25; break;
        case 'heal': for (let i = 0; i < 8; i++) particles.push({ x: p.x + (Math.random() - 0.5) * 12, y: p.y, vx: 0, vy: -30 - Math.random() * 20, t: 0, life: 0.6, c: '#7ee07e' }); break;
        case 'end': setTimeout(() => endRun(ev.won), ev.won ? 1200 : 900); break;
      }
    }
    game.out.length = 0;
    if (game.boss === null && $('bossbar').classList.contains('hidden') === false) {
      $('bossbar').classList.add('hidden');
      if (game.state === 'play') stageMusic(false);
    }
  }

  // ------------------------------------------------------------ HUD
  function updateHud() {
    $('xp-fill').style.width = (game.xpFrac() * 100).toFixed(1) + '%';
    $('lvl').textContent = 'LV ' + game.level;
    const sec = Math.floor(game.time);
    if (sec !== lastTimer) {
      lastTimer = sec;
      $('timer').textContent = fmtTime(game.time);
      $('kills').textContent = game.kills;
      $('gold').textContent = Math.floor(game.gold);
    }
    const sig = game.weapons.map((w) => w.id + w.lvl).join() + '|' + game.passives.map((p) => p.id + p.lvl).join();
    if (sig !== iconSig) {
      iconSig = sig;
      const ws = $('slot-w'), ps = $('slot-p');
      ws.innerHTML = ''; ps.innerHTML = '';
      for (const w of game.weapons) { const c = icon(WEAPONS[w.id].icon, 2); if (WEAPONS[w.id].evolved) c.classList.add('evo'); ws.appendChild(c); }
      for (const p of game.passives) ps.appendChild(icon(PASSIVES[p.id].icon, 2));
    }
    if (game.boss) {
      $('bossbar').classList.remove('hidden');
      $('boss-name').textContent = game.boss.name;
      $('boss-fill').style.width = Math.max(0, game.boss.hp / game.boss.maxHp * 100).toFixed(1) + '%';
    }
  }

  // ------------------------------------------------------------ menus in a run
  function synergyLine(c) {
    if (c.type === 'weapon') {
      const d = WEAPONS[c.id];
      if (!d.evo || !save.discovered[d.evo]) return '';
      const has = game.ownedPassive(d.with);
      return `<div class="syn">✦ ${has ? 'Pairs with your' : 'Evolves with'} ${PASSIVES[d.with].name} → ${WEAPONS[d.evo].name}</div>`;
    }
    if (c.type === 'passive') {
      const lines = [];
      for (const id of WEAPON_ORDER) {
        const d = WEAPONS[id];
        if (d.with !== c.id || !save.discovered[d.evo]) continue;
        if (game.ownedWeapon(id)) lines.push(`✦ Evolves your ${d.name} → ${WEAPONS[d.evo].name}`);
      }
      if (lines.length) return '<div class="syn">' + lines.join('<br>') + '</div>';
      const known = WEAPON_ORDER.filter((id) => WEAPONS[id].with === c.id && save.discovered[WEAPONS[id].evo]);
      if (known.length) return `<div class="syn" style="opacity:.7">✦ Evolves ${WEAPONS[known[0]].name}</div>`;
    }
    return '';
  }

  function showLevelUp() {
    const cards = game.choices.map((c, i) => {
      if (c.type === 'gold') return `<div class="card" data-pick="${i}"><span data-icon="i_bag" data-s="3"></span><div class="txt"><b>Gold</b>+${c.v} gold</div></div>`;
      if (c.type === 'food') return `<div class="card" data-pick="${i}"><span data-icon="i_food" data-s="3"></span><div class="txt"><b>Roast</b>Heal ${c.v} HP</div></div>`;
      const d = c.type === 'weapon' ? WEAPONS[c.id] : PASSIVES[c.id];
      const syn = synergyLine(c);
      const lv = c.lvl === 1 ? '<span class="lv new">NEW</span>' : `<span class="lv">LV ${c.lvl}</span>`;
      return `<div class="card${syn && syn.indexOf('opacity') < 0 ? ' synergy' : ''}" data-pick="${i}"><span data-icon="${d.icon}" data-s="3"></span>
        <div class="txt"><b>${d.name}${lv}</b>${c.text}${syn}</div></div>`;
    }).join('');
    openModal(`<h2>Level up!</h2><div class="cards">${cards}</div>
      <div class="row">
        <button class="btn small" data-act="reroll" ${game.rerolls > 0 ? '' : 'disabled'}>Reroll (${game.rerolls})</button>
        <button class="btn small" data-act="skip">Skip</button>
      </div>`);
  }
  function pickChoice(i) {
    if (!game || game.state !== 'levelup' || !game.choices[i]) return;
    Sound.sfx('select');
    game.choose(i);
    afterMenu();
  }

  function showChest() {
    const ch = game.chest;
    const evo = ch.items.some((it) => it.type === 'evo');
    const fresh = ch.items.map((it) => it.type === 'evo' && !save.discovered[it.id]);
    openModal(`<h2>${ch.kind === 'boss' ? 'Treasure' : 'Chest'}</h2>
      <div class="chest-stage" id="cstage"><div class="rays"></div><span data-icon="chest" data-s="5"></span></div>
      <div class="loot" id="loot"></div>
      <div class="row"><button class="btn hidden" data-act="chest-ok" id="chest-ok">Take it</button></div>`);
    let i = 0;
    const loot = $('loot');
    setTimeout(() => {
      if (!$('cstage')) return;
      $('cstage').classList.add('open');
      Sound.sfx(evo ? 'evo' : 'chest');
      const step = () => {
        if (!$('loot')) return;
        if (i >= ch.items.length) {
          const gd = document.createElement('div');
          gd.className = 'it';
          gd.innerHTML = `<span class="coin"></span><div><b>+${ch.gold} gold</b></div>`;
          loot.appendChild(gd);
          $('chest-ok').classList.remove('hidden');
          return;
        }
        const it = ch.items[i++];
        const el = document.createElement('div');
        if (it.type === 'evo') {
          el.className = 'it evo';
          fill(el, `<span data-icon="${WEAPONS[it.id].icon}" data-s="3"></span><div><b>${WEAPONS[it.id].name}</b><small>${WEAPONS[it.from].name} evolved!${fresh[i - 1] ? ' New recipe discovered.' : ''}</small></div>`, true);
        } else if (it.type === 'gold') {
          el.className = 'it';
          fill(el, `<span data-icon="i_bag" data-s="3"></span><div><b>+${it.v} gold</b></div>`, true);
        } else {
          el.className = 'it';
          fill(el, `<span data-icon="${itemIcon(it.id)}" data-s="3"></span><div><b>${itemName(it.id)}</b><small>Level ${it.lvl}</small></div>`, true);
        }
        loot.appendChild(el);
        Sound.sfx('coin');
        setTimeout(step, 380);
      };
      setTimeout(step, 450);
    }, 650);
  }

  // After a level-up or chest closes, the game may have queued the next one.
  function afterMenu() {
    if (game.state === 'levelup') showLevelUp();
    else if (game.state === 'chest') showChest();
    else closeModal();
  }

  function buildList() {
    return game.weapons.map((w) => {
      const d = WEAPONS[w.id];
      let note = '';
      if (d.evolved) note = '<small class="ok">Evolved</small>';
      else if (d.evo && save.discovered[d.evo]) {
        const max = w.lvl >= weaponMax(w.id), has = game.ownedPassive(d.with);
        note = `<small class="${max && has ? 'ok' : ''}">+ ${PASSIVES[d.with].name} ${has ? '✓' : '✗'} · max level ${max ? '✓' : '✗'} → open a chest</small>`;
      } else note = `<small>Level ${w.lvl}/${weaponMax(w.id)}</small>`;
      return `<div class="bw"><span data-icon="${d.icon}" data-s="2"></span><div class="n">${d.name}${note}</div><div class="d">${Math.round(game.dmgBy[w.id] || 0)}</div></div>`;
    }).join('');
  }

  function togglePause() {
    if (!game || game.state === 'dead' || game.state === 'won') return;
    if (paused) { resume(); return; }
    if (modalOpen()) return;
    paused = true;
    const st = game.stats;
    openModal(`<h2>Paused</h2>
      <div class="statgrid">
        <div><b>${fmtTime(game.time)}</b>time</div><div><b>${game.kills}</b>kills</div>
        <div><b>${Math.round(game.player.hp)}/${Math.round(st.maxHp)}</b>health</div><div><b>${Math.round(st.might * 100)}%</b>damage</div>
      </div>
      <div class="build">${buildList()}</div>
      <div class="row">
        <button class="btn big" data-act="resume">Resume</button>
      </div>
      <div class="row">
        <button class="btn small toggle ${Sound.musicOn ? '' : 'off'}" data-act="music">Music</button>
        <button class="btn small toggle ${Sound.sfxOn ? '' : 'off'}" data-act="sfx">Sound</button>
        <button class="btn small" data-act="quit">Give up</button>
      </div>`);
  }
  function resume() {
    paused = false;
    closeModal();
    last = performance.now();
  }

  function endRun(won) {
    if (!game || screen !== 'game') return;
    const s = game.summary();
    const unlocks = [];
    save.runs++;
    save.totalKills += s.kills;
    save.gold += s.gold;
    save.best[s.char] = Math.max(save.best[s.char] || 0, Math.floor(s.time));
    save.bestMap[s.map] = Math.max(save.bestMap[s.map] || 0, Math.floor(s.time));
    for (const id of MAP_ORDER) {
      const u = MAPS[id].unlock;
      if (u && !save.mapUnlocked[id] && u.map === s.map && s.time >= u.time) { save.mapUnlocked[id] = true; unlocks.push(`New stage: ${MAPS[id].name}!`); }
    }
    if (won) {
      save.winsMap[s.map] = (save.winsMap[s.map] || 0) + 1;
      save.wins[s.char] = (save.wins[s.char] || 0) + 1;
      if (s.hard) save.hardWins[s.char] = (save.hardWins[s.char] || 0) + 1;
      if (!save.hardUnlocked) { save.hardUnlocked = true; unlocks.push('Hard mode unlocked: tougher night, 50% more gold.'); }
    }
    for (const id of CHAR_ORDER) {
      const u = CHARS[id].unlock;
      if (u && !save.unlocked[id] && s.flags[u.key]) { save.unlocked[id] = true; unlocks.push(`New hero: the ${CHARS[id].name}!`); }
    }
    for (const id of game.evolvedNow) save.discovered[id] = true;
    persist();
    Sound.stopMusic();
    Sound.sfx(won ? 'victory' : 'death');
    const rows = s.weapons.slice().sort((a, b) => b.dmg - a.dmg).map((w) =>
      `<div class="bw"><span data-icon="${WEAPONS[w.id].icon}" data-s="2"></span><div class="n">${WEAPONS[w.id].name}<small>Level ${w.lvl}</small></div><div class="d">${w.dmg.toLocaleString()}</div></div>`).join('');
    openModal(`<h2 class="${won ? '' : 'bad'}">${won ? 'Dawn breaks!' : 'You fell'}</h2>
      <p>${MAPS[s.map].name}. ${won ? 'Its master is no more: you survived the night.' : 'The night claims another. Spend your gold and try again.'}</p>
      <div class="statgrid">
        <div><b>${fmtTime(s.time)}</b>survived</div><div><b>${s.level}</b>level</div>
        <div><b>${s.kills.toLocaleString()}</b>kills</div><div><b>+${s.gold}</b>gold</div>
      </div>
      ${unlocks.map((u) => `<div class="unlock">${u}</div>`).join('')}
      <div class="build">${rows}</div>
      <div class="row">
        <button class="btn big" data-act="again">Again</button>
        <button class="btn" data-act="menu">Menu</button>
      </div>`);
  }

  function showHelp(fromRun) {
    if (fromRun) paused = true;
    openModal(`<h2>How to play</h2>
      <ul class="howto">
        <li><b>Move</b> by dragging anywhere on the screen (or WASD). That's the only control: weapons fire by themselves.</li>
        <li>Pick up <b>gems</b> to level up and choose new weapons, passives, or upgrades. You hold up to 6 of each.</li>
        <li><b>Elites</b> and <b>bosses</b> drop chests. A chest upgrades your gear, and can <b>evolve</b> a weapon.</li>
        <li><b>Evolution:</b> a weapon at max level + its matching passive + a chest. Recipes you discover are shown on level-up cards from then on.</li>
        <li>Break <b>braziers</b> for food, gold, magnets and holy bells.</li>
        <li>Survive <b>15 minutes</b>, then defeat the Hollow King to win. Gold buys permanent power-ups between runs.</li>
      </ul>
      <div class="row"><button class="btn" data-act="${fromRun ? 'resume' : 'close'}">Got it</button></div>`);
  }

  $('modal-box').addEventListener('click', (e) => {
    const card = e.target.closest('[data-pick]');
    if (card) { pickChoice(+card.dataset.pick); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act !== 'chest-ok') Sound.sfx('click');
    if (act === 'close') closeModal();
    else if (act === 'resume') resume();
    else if (act === 'reroll') { if (game.reroll()) showLevelUp(); }
    else if (act === 'skip') { game.skip(); afterMenu(); }
    else if (act === 'chest-ok') { Sound.sfx('select'); game.closeChest(); afterMenu(); }
    else if (act === 'music') { Sound.setMusic(!Sound.musicOn); b.classList.toggle('off', !Sound.musicOn); }
    else if (act === 'sfx') { Sound.setSfx(!Sound.sfxOn); b.classList.toggle('off', !Sound.sfxOn); }
    else if (act === 'quit') { paused = false; closeModal(); game.state = 'dead'; endRun(false); }
    else if (act === 'again') { closeModal(); startRun(save.char); }
    else if (act === 'menu') { closeModal(); game = null; show('title'); }
    else if (act === 'buy') buy(b.dataset.id);
  });

  // ------------------------------------------------------------ title
  function syncTitle() {
    $('title-gold').textContent = save.gold ? '· ' + save.gold + 'g' : '';
    $('btn-music-t').classList.toggle('off', !Sound.musicOn);
    $('btn-sfx-t').classList.toggle('off', !Sound.sfxOn);
    $('btn-nums-t').classList.toggle('off', !save.nums);
  }
  $('btn-play').addEventListener('click', () => { Sound.init(); Sound.sfx('click'); renderSelect(); show('select'); });
  $('btn-shop').addEventListener('click', () => { Sound.init(); Sound.sfx('click'); renderShop(); show('shop'); });
  $('btn-collection').addEventListener('click', () => { Sound.init(); Sound.sfx('click'); renderCollection(); show('collection'); });
  $('btn-howto').addEventListener('click', () => { Sound.init(); Sound.sfx('click'); showHelp(false); });
  $('btn-music-t').addEventListener('click', () => { Sound.init(); Sound.setMusic(!Sound.musicOn); if (Sound.musicOn) Sound.music('title'); syncTitle(); });
  $('btn-sfx-t').addEventListener('click', () => { Sound.init(); Sound.setSfx(!Sound.sfxOn); Sound.sfx('click'); syncTitle(); });
  $('btn-nums-t').addEventListener('click', () => { save.nums = !save.nums; persist(); syncTitle(); toast(save.nums ? 'Damage numbers on' : 'Damage numbers off'); });
  document.addEventListener('pointerdown', () => { Sound.init(); if (screen === 'title') Sound.music('title'); }, { once: true });

  // ------------------------------------------------------------ hero select
  let selChar = save.char;
  function renderSelect() {
    if (!isUnlocked(selChar)) selChar = 'knight';
    const list = $('hero-list');
    list.innerHTML = '';
    for (const id of CHAR_ORDER) {
      const c = CHARS[id];
      const el = document.createElement('div');
      el.className = 'hero-card' + (id === selChar ? ' sel' : '') + (isUnlocked(id) ? '' : ' locked');
      el.appendChild(icon(c.sprite, 4));
      el.insertAdjacentHTML('beforeend', `<span class="nm">${isUnlocked(id) ? c.name : '???'}</span>${save.wins[id] ? '<span class="badge">★' + save.wins[id] + '</span>' : ''}`);
      el.addEventListener('click', () => { Sound.sfx('click'); selChar = id; renderSelect(); });
      list.appendChild(el);
    }
    const c = CHARS[selChar];
    const w = WEAPONS[c.weapon];
    fill($('hero-detail'), isUnlocked(selChar)
      ? `<h4>${c.name}</h4>
        <div class="wpn"><span data-icon="${w.icon}" data-s="2"></span><div><b>${w.name}</b><br><span class="dim">${w.desc}</span></div></div>
        <div class="bonus">${c.note}</div>
        <div class="best">Best: ${save.best[selChar] ? fmtTime(save.best[selChar]) : '-'} · Wins: ${save.wins[selChar] || 0}</div>`
      : `<h4>Locked</h4><div class="lock">${c.unlock.text} to unlock this hero.</div>`, true);
    const ml = $('map-list');
    ml.innerHTML = '';
    if (!mapUnlocked(save.map)) save.map = 'forest';
    for (const id of MAP_ORDER) {
      const m = MAPS[id], open = mapUnlocked(id);
      const el = document.createElement('button');
      el.className = 'chip stage' + (id === save.map ? ' sel' : '') + (open ? '' : ' locked');
      el.innerHTML = open
        ? `${m.name}${save.winsMap[id] ? ' ★' + save.winsMap[id] : ''}<small>${m.desc}</small><small class="best">Best ${save.bestMap[id] ? fmtTime(save.bestMap[id]) : '-'} · gold ×${m.gold}</small>`
        : `???<small>${m.unlock.text}</small>`;
      if (open) el.addEventListener('click', () => { Sound.sfx('click'); save.map = id; persist(); renderSelect(); });
      ml.appendChild(el);
    }
    $('btn-start').disabled = !isUnlocked(selChar);
    $('hard-row').classList.toggle('hidden', !save.hardUnlocked);
    $('btn-hard').className = 'chip' + (save.hard ? ' sel' : '');
    $('btn-hard').innerHTML = `Hard mode: ${save.hard ? 'On' : 'Off'}<small>Tougher, faster enemies. +50% gold.</small>`;
  }
  $('btn-hard').addEventListener('click', () => { save.hard = !save.hard; persist(); Sound.sfx('click'); renderSelect(); });
  $('btn-start').addEventListener('click', () => { if (isUnlocked(selChar)) { Sound.sfx('select'); startRun(selChar); } });

  // ------------------------------------------------------------ shop
  const shopCost = (s) => s.base * ((save.shop[s.id] || 0) + 1);
  function renderShop() {
    $('shop-gold').textContent = save.gold;
    const list = $('shop-list');
    list.innerHTML = '';
    for (const s of SHOP) {
      const lvl = save.shop[s.id] || 0, maxed = lvl >= s.max, cost = shopCost(s);
      const el = document.createElement('div');
      el.className = 'shop-item';
      fill(el, `<span data-icon="${s.icon}" data-s="2"></span>
        <div class="d"><b>${s.name}</b>${s.desc}<div class="pips">${Array.from({ length: s.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div></div>
        <button class="btn" ${maxed || save.gold < cost ? 'disabled' : ''}>${maxed ? 'Max' : '<span class="coin"></span>' + cost}</button>`, true);
      el.querySelector('button').addEventListener('click', () => buy(s.id));
      list.appendChild(el);
    }
  }
  function buy(id) {
    const s = SHOP.find((x) => x.id === id);
    const lvl = save.shop[id] || 0, cost = shopCost(s);
    if (lvl >= s.max || save.gold < cost) { Sound.sfx('warn'); return; }
    save.gold -= cost;
    save.shop[id] = lvl + 1;
    persist();
    Sound.sfx('coin');
    renderShop();
  }
  $('btn-refund').addEventListener('click', () => {
    let back = 0;
    for (const s of SHOP) for (let l = 0; l < (save.shop[s.id] || 0); l++) back += s.base * (l + 1);
    if (!back) { toast('Nothing to refund'); return; }
    save.gold += back; save.shop = {}; persist();
    Sound.sfx('coin'); toast('Refunded ' + back + ' gold'); renderShop();
  });

  // ------------------------------------------------------------ collection
  function renderCollection() {
    const found = WEAPON_ORDER.filter((id) => save.discovered[WEAPONS[id].evo]).length;
    let stages = '<h3>Stages</h3>';
    for (const id of MAP_ORDER) {
      const m = MAPS[id];
      stages += `<div class="recipe${mapUnlocked(id) ? '' : ' unknown'}"><span class="nm">${mapUnlocked(id) ? m.name : '???'}<br><span class="dim">${mapUnlocked(id) ? 'Best ' + (save.bestMap[id] ? fmtTime(save.bestMap[id]) : '-') + ' · wins ' + (save.winsMap[id] || 0) : m.unlock.text}</span></span></div>`;
    }
    let html = `<div class="statgrid">
      <div><b>${save.runs}</b>runs</div><div><b>${save.totalKills.toLocaleString()}</b>kills</div>
      <div><b>${Object.values(save.wins).reduce((a, b) => a + b, 0)}</b>victories</div><div><b>${found}/${WEAPON_ORDER.length}</b>evolutions</div>
    </div><h3>Evolutions</h3>`;
    for (const id of WEAPON_ORDER) {
      const d = WEAPONS[id], e = WEAPONS[d.evo], known = save.discovered[d.evo];
      html += known
        ? `<div class="recipe"><span data-icon="${d.icon}" data-s="2"></span><span class="op">+</span><span data-icon="${PASSIVES[d.with].icon}" data-s="2"></span><span class="op">=</span><span data-icon="${e.icon}" data-s="2"></span><span class="nm">${e.name}<br><span class="dim">${d.name} + ${PASSIVES[d.with].name}</span></span></div>`
        : `<div class="recipe unknown"><span data-icon="${d.icon}" data-s="2"></span><span class="op">+</span><span class="q">?</span><span class="op">=</span><span class="q">?</span><span class="nm">???<br><span class="dim">${d.name} + an unknown passive</span></span></div>`;
    }
    html += stages;
    html += '<h3>Weapons</h3><div class="grid-icons">' + WEAPON_ORDER.map((id) => `<div class="ic"><span data-icon="${WEAPONS[id].icon}" data-s="2"></span><br>${WEAPONS[id].name}</div>`).join('') + '</div>';
    html += '<h3>Passives</h3><div class="grid-icons">' + PASSIVE_ORDER.map((id) => `<div class="ic"><span data-icon="${PASSIVES[id].icon}" data-s="2"></span><br>${PASSIVES[id].name}</div>`).join('') + '</div>';
    fill($('collection'), html, true);
  }

  // ------------------------------------------------------------ rendering
  function spr(name, x, y, flip, scale, flash) {
    const s = Sprites.get(name);
    if (!s) return;
    const w = s.width * (scale || 1), h = s.height * (scale || 1);
    const dx = Math.round(x - w / 2), dy = Math.round(y - h);
    const img = flash ? s.flash : s;
    if (flip) {
      g.save(); g.translate(dx + w, dy); g.scale(-1, 1); g.drawImage(img, 0, 0, w, h); g.restore();
    } else g.drawImage(img, dx, dy, w, h);
  }
  function rotSpr(name, x, y, ang, scale) {
    const s = Sprites.get(name);
    g.save(); g.translate(x, y); g.rotate(ang);
    const sc = scale || 1;
    g.drawImage(s, -s.width * sc / 2, -s.height * sc / 2, s.width * sc, s.height * sc);
    g.restore();
  }

  function render(dt) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    if (!game) { renderTitleBg(dt); return; }
    const p = game.player;
    const vw = W / S, vh = H / S;
    let sx = 0, sy = 0;
    if (shake > 0) { sx = (Math.random() - 0.5) * 6 * shake; sy = (Math.random() - 0.5) * 6 * shake; }
    const ox = Math.round(W / 2 - (p.x + sx) * S), oy = Math.round(H / 2 - (p.y + sy) * S);
    g.setTransform(S, 0, 0, S, ox, oy);
    g.imageSmoothingEnabled = false;
    drawGround(p.x, p.y, vw, vh);
    drawDecor(p.x, p.y, vw, vh, false, performance.now() / 1000);
    const t = performance.now() / 1000;

    // Holy aura under everything.
    for (const w of game.weapons) {
      if (w.id !== 'aura' && w.id !== 'sanctuary') continue;
      const R = 34 * w.s.area, evo = w.id === 'sanctuary';
      g.globalAlpha = 0.16 + Math.sin(t * 4) * 0.04;
      g.fillStyle = evo ? '#fff4c0' : '#f2d04a';
      g.beginPath(); g.arc(p.x, p.y, R, 0, 6.29); g.fill();
      g.globalAlpha = 0.5; g.strokeStyle = evo ? '#ffffff' : '#f2d04a'; g.lineWidth = 1;
      g.beginPath(); g.arc(p.x, p.y, R - 0.5, 0, 6.29); g.stroke();
      g.globalAlpha = 1;
    }
    // Fire pools.
    for (const pl of game.pools) {
      const a = Math.min(1, pl.life * 2, (pl.max - pl.life) * 6 + 0.3);
      g.globalAlpha = a * (0.85 + Math.sin(t * 20 + pl.x) * 0.15);
      const R = pl.r * 1.25;
      g.drawImage(pl.evo ? GLOW.hell : GLOW.fire, pl.x - R, pl.y - R * 0.7, R * 2, R * 1.4);
      g.globalAlpha = 1;
      g.fillStyle = pl.evo ? '#e8a0ff' : '#ffe060';
      for (let i = 0; i < 5; i++) {
        const fx = pl.x + Math.sin(t * 7 + i * 2.1 + pl.y) * pl.r * 0.7, fy = pl.y + Math.cos(t * 5 + i * 1.7) * pl.r * 0.35 - ((t * 30 + i * 7) % 8);
        g.fillRect(Math.round(fx), Math.round(fy), 1, 2);
      }
    }
    // Pickups.
    for (const k of game.pickups) {
      const bob = k.fly ? 0 : Math.sin(t * 4 + k.x) * 1;
      let name;
      if (k.kind === 'gem') name = k.big ? 'i_gem3' : k.v < 3 ? 'i_gem1' : k.v < 10 ? 'i_gem2' : 'i_gem3';
      else if (k.kind === 'coin') name = k.v >= 10 ? 'i_bag' : 'i_coin';
      else if (k.kind === 'food') name = 'i_food';
      else if (k.kind === 'magnet') name = 'i_magnet';
      else if (k.kind === 'bell') name = 'i_bell';
      else if (k.kind === 'chest') name = 'chest';
      if (k.kind === 'chest') {
        g.globalAlpha = 0.5 + Math.sin(t * 5) * 0.2;
        g.drawImage(GLOW.light, k.x - 24, k.y - 30, 48, 48);
        g.globalAlpha = 1;
      }
      spr(name, k.x, k.y + 4 + bob, false, k.big ? 1.5 : 1);
    }
    // Enemies, sorted by depth.
    const list = game.enemies.slice().sort((a, b) => a.y - b.y);
    for (const e of list) {
      const sc = e.scale;
      if (e.prop) {
        g.globalAlpha = 0.55 + Math.sin(t * 9 + e.x) * 0.15;
        g.drawImage(GLOW.light, e.x - 22, e.y - 30, 44, 44);
        g.globalAlpha = 1;
        spr('brazier', e.x, e.y + 4);
        continue;
      }
      g.drawImage(GLOW.shadow, Math.round(e.x - 8 * sc), Math.round(e.y + 2 * sc - 3), 16 * sc, 6 * sc);
      const fly = e.sprite === 'bat' || e.sprite === 'wraith';
      const bob = fly ? Math.sin(e.wob) * 2 : Math.abs(Math.sin(e.wob * 0.8)) * -1;
      const flip = e.vx < 0;
      if (e.elite || e.boss) {
        g.globalAlpha = 0.35 + Math.sin(t * 6) * 0.1;
        g.drawImage(e.boss ? GLOW.ebullet : GLOW.torrent, e.x - 12 * sc, e.y - 18 * sc, 24 * sc, 24 * sc);
        g.globalAlpha = 1;
      }
      if (e.ai && e.ai.wind > 0 && Math.floor(t * 20) % 2) { spr(e.sprite, e.x, e.y + 3 * sc + bob, flip, sc, true); continue; }
      spr(e.sprite, e.x, e.y + 3 * sc + bob, flip, sc);
      if (e.flash > 0) { g.globalAlpha = Math.min(1, e.flash * 10); spr(e.sprite, e.x, e.y + 3 * sc + bob, flip, sc, true); g.globalAlpha = 1; }
    }
    // Player.
    const hero = CHARS[game.charId].sprite;
    const walk = p.moving ? Math.abs(Math.sin(t * 12)) * -1.5 : 0;
    g.drawImage(GLOW.shadow, Math.round(p.x - 8), Math.round(p.y - 1), 16, 6);
    if (!(p.inv > 0 && Math.floor(t * 15) % 2)) {
      spr(hero, p.x, p.y + 3 + walk, p.faceX < 0);
      if (p.hurtT > 0) { g.globalAlpha = 0.7; spr(hero, p.x, p.y + 3 + walk, p.faceX < 0, 1, true); g.globalAlpha = 1; }
    }
    // HP bar under the hero.
    const hpf = Math.max(0, p.hp / game.stats.maxHp);
    g.fillStyle = '#06040a'; g.fillRect(Math.round(p.x - 9), Math.round(p.y + 5), 18, 3);
    g.fillStyle = hpf > 0.3 ? '#e0404a' : (Math.floor(t * 6) % 2 ? '#ff8080' : '#e0404a');
    g.fillRect(Math.round(p.x - 8), Math.round(p.y + 6), Math.round(16 * hpf), 1);

    // Orbiting skulls.
    for (const o of game.orbs) { g.globalAlpha = o.fade; spr(o.evo ? 'e_bones' : 'w_bones', o.x, o.y + 6, false, 0.8); }
    g.globalAlpha = 1;
    // Projectiles.
    for (const b of game.projectiles) {
      if (b.kind === 'arrow') {
        const a = Math.atan2(b.vy, b.vx);
        g.save(); g.translate(b.x, b.y); g.rotate(a);
        g.fillStyle = b.evo ? '#9ad0ff' : '#c8b088'; g.fillRect(-7, -0.5, 10, 1);
        g.fillStyle = b.evo ? '#ffffff' : '#d8dce4'; g.fillRect(3, -1.5, 2, 3); g.fillRect(5, -0.5, 1, 1);
        g.fillStyle = b.evo ? '#4fd3ff' : '#d04040'; g.fillRect(-8, -1.5, 2, 1); g.fillRect(-8, 0.5, 2, 1);
        g.restore();
      } else if (b.kind === 'bolt') {
        const s = b.evo ? 1.3 : 1;
        g.drawImage(b.evo ? GLOW.torrent : GLOW.bolt, b.x - 8 * s, b.y - 8 * s, 16 * s, 16 * s);
      } else if (b.kind === 'ebullet') {
        g.drawImage(b.fire ? GLOW.ember : GLOW.ebullet, b.x - 6, b.y - 6, 12, 12);
      } else if (b.kind === 'dagger') {
        rotSpr(b.evo ? 'e_dagger' : 'w_dagger', b.x, b.y, Math.atan2(b.vy, b.vx) + Math.PI / 4, 0.75);
      } else if (b.kind === 'axe') {
        rotSpr(b.evo ? 'e_axe' : 'w_axe', b.x, b.y, b.rot, b.evo ? 1 : 0.9);
      } else if (b.kind === 'flask') {
        g.drawImage(GLOW.shadow, b.tx - 6, b.ty - 2, 12, 4);
        rotSpr(b.evo ? 'e_flask' : 'w_flask', b.x, b.y, b.rot, 0.8);
      }
    }
    // Effects.
    for (const f of game.fx) {
      const k = f.life / f.max;
      if (f.kind === 'slash') {
        g.globalAlpha = Math.min(1, k * 1.6);
        const prog = 1 - k;
        g.strokeStyle = f.evo ? '#ff4060' : '#ffffff';
        g.lineWidth = 2.5 * (f.h / 26) * (0.5 + k);
        g.beginPath();
        const a0 = f.dir > 0 ? -1.2 : Math.PI + 1.2, sweep = (f.dir > 0 ? 2.4 : -2.4) * Math.min(1, prog * 2.5);
        g.ellipse(f.x - f.dir * f.w * 0.3, f.y, f.w * 0.62, f.h * 0.75, 0, a0, a0 + sweep, f.dir < 0);
        g.stroke();
        g.strokeStyle = f.evo ? '#a01828' : '#9ad0ff'; g.lineWidth = 1;
        g.beginPath();
        g.ellipse(f.x - f.dir * f.w * 0.3, f.y, f.w * 0.5, f.h * 0.6, 0, a0, a0 + sweep, f.dir < 0);
        g.stroke();
        g.globalAlpha = 1;
      } else if (f.kind === 'bolt') {
        g.globalAlpha = k;
        g.strokeStyle = f.evo ? '#c8e8ff' : '#fff4a0';
        g.lineWidth = 2;
        g.beginPath();
        let x = f.from ? f.from.x : f.x + (Math.random() - 0.5) * 20, y = f.from ? f.from.y : f.y - vh;
        g.moveTo(x, y);
        const steps = 7;
        for (let i = 1; i <= steps; i++) {
          const tx = x + (f.x - x) * (i / steps) + (i < steps ? (Math.random() - 0.5) * 12 : 0);
          const ty = y + (f.y - y) * (i / steps);
          g.lineTo(tx, ty);
        }
        g.stroke();
        g.drawImage(GLOW.light, f.x - f.r * 1.5, f.y - f.r * 1.5, f.r * 3, f.r * 3);
        g.globalAlpha = 1;
      } else if (f.kind === 'puff') {
        g.globalAlpha = k;
        g.fillStyle = '#a01828';
        for (let i = 0; i < 8; i++) { const a = i * 0.785; g.fillRect(f.x + Math.cos(a) * (1 - k) * 20, f.y - 8 + Math.sin(a) * (1 - k) * 20, 2, 2); }
        g.globalAlpha = 1;
      }
    }
    // Particles.
    for (const q of particles) {
      g.globalAlpha = Math.max(0, 1 - q.t / q.life);
      g.fillStyle = q.c;
      g.fillRect(Math.round(q.x), Math.round(q.y), 1, 1);
    }
    g.globalAlpha = 1;
    drawDecor(p.x, p.y, vw, vh, true, performance.now() / 1000);

    // Damage numbers in screen space (crisp text).
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (nums.length) {
      const fs = Math.max(12, Math.round(S * 6));
      g.font = `700 ${fs}px ${getComputedStyle(document.body).fontFamily}`;
      g.textAlign = 'center';
      g.lineWidth = Math.max(2, S * 0.8);
      g.strokeStyle = '#000';
      for (const n of nums) {
        const x = (n.x - p.x - sx) * S + W / 2, y = (n.y - n.t * 22 - p.y - sy) * S + H / 2;
        g.globalAlpha = Math.min(1, (0.55 - n.t) * 5);
        g.strokeText(n.v, x, y); g.fillStyle = '#fff'; g.fillText(n.v, x, y);
      }
      g.globalAlpha = 1;
    }
    // Darkness around the edges.
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.65);
    vg.addColorStop(0, 'rgba(8,4,16,0)'); vg.addColorStop(1, game.finalPhase ? 'rgba(40,0,10,0.75)' : MAPS[stage].dark ? 'rgba(4,2,10,0.88)' : 'rgba(8,4,16,0.7)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    if (flashT > 0) { g.globalAlpha = flashT * 2; g.fillStyle = '#fff8e0'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
    // Off-screen markers for chests and the boss.
    const mark = (x, y, col) => {
      const dx = x - p.x, dy = y - p.y;
      if (Math.abs(dx) < vw / 2 - 10 && Math.abs(dy) < vh / 2 - 10) return;
      const k = Math.min((vw / 2 - 14) / Math.abs(dx || 1e-6), (vh / 2 - 40) / Math.abs(dy || 1e-6));
      const mx = W / 2 + dx * k * S, my = H / 2 + dy * k * S, a = Math.atan2(dy, dx);
      g.save(); g.translate(mx, my); g.rotate(a);
      g.fillStyle = col; g.beginPath(); g.moveTo(6 * dpr, 0); g.lineTo(-5 * dpr, -5 * dpr); g.lineTo(-5 * dpr, 5 * dpr); g.fill();
      g.restore();
    };
    for (const k of game.pickups) if (k.kind === 'chest') mark(k.x, k.y, '#f2c838');
    if (game.boss) mark(game.boss.x, game.boss.y, '#ff4050');
    // Joystick.
    if (stick.active) {
      const bx = stick.ox * dpr, by = stick.oy * dpr, R = 38 * dpr;
      g.globalAlpha = 0.25; g.strokeStyle = '#fff'; g.lineWidth = 2 * dpr;
      g.beginPath(); g.arc(bx, by, R, 0, 6.29); g.stroke();
      const dx = stick.x - stick.ox, dy = stick.y - stick.oy, d = Math.hypot(dx, dy), m = Math.min(d, 38);
      g.globalAlpha = 0.35; g.fillStyle = '#fff';
      g.beginPath(); g.arc(bx + (d ? dx / d * m : 0) * dpr, by + (d ? dy / d * m : 0) * dpr, 14 * dpr, 0, 6.29); g.fill();
      g.globalAlpha = 1;
    }
  }

  // Title backdrop: the forest scrolling past with a few monsters drifting by.
  const titleMobs = [];
  let titleT = 0;
  function renderTitleBg(dt) {
    titleT += dt;
    const cx = titleT * 14, cy = titleT * 6;
    const vw = W / S, vh = H / S;
    g.setTransform(S, 0, 0, S, Math.round(W / 2 - cx * S), Math.round(H / 2 - cy * S));
    g.imageSmoothingEnabled = false;
    drawGround(cx, cy, vw, vh);
    drawDecor(cx, cy, vw, vh, false, titleT);
    if (titleMobs.length < 14 && Math.random() < dt * 3) {
      const types = ['bat', 'skeleton', 'zombie', 'wraith', 'rat', 'slime'];
      titleMobs.push({ s: types[Math.floor(Math.random() * types.length)], x: cx - vw / 2 - 20, y: cy + (Math.random() - 0.5) * vh, v: 20 + Math.random() * 25, w: Math.random() * 6 });
    }
    for (let i = titleMobs.length - 1; i >= 0; i--) {
      const m = titleMobs[i];
      m.x += m.v * dt; m.w += dt * 8;
      if (m.x > cx + vw / 2 + 30) { titleMobs.splice(i, 1); continue; }
      spr(m.s, m.x, m.y + Math.sin(m.w) * 1.5, false);
    }
    drawDecor(cx, cy, vw, vh, true, titleT);
    g.setTransform(1, 0, 0, 1, 0, 0);
    const vg = g.createRadialGradient(W / 2, H * 0.4, Math.min(W, H) * 0.1, W / 2, H / 2, Math.max(W, H) * 0.7);
    vg.addColorStop(0, 'rgba(8,4,16,0.35)'); vg.addColorStop(1, 'rgba(8,4,16,0.9)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }

  // ------------------------------------------------------------ loop
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (game && screen === 'game') {
      if (!paused && game.state === 'play' && !modalOpen()) {
        const inp = readInput();
        game.input.x = inp.x; game.input.y = inp.y;
        game.update(dt);
        if (game.state === 'levelup' || game.state === 'chest') { stick.active = false; stick.id = null; afterMenu(); }
      }
      handleEvents();
      if (!paused && !modalOpen()) {
        for (const q of particles) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 60 * dt; }
        particles = particles.filter((q) => q.t < q.life);
        for (const n of nums) n.t += dt;
        nums = nums.filter((n) => n.t < 0.55);
        if (flashT > 0) flashT -= dt;
        if (shake > 0) shake -= dt;
      }
      updateHud();
    }
    render(dt);
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------ android hooks
  window.onAndroidBack = () => {
    if (screen === 'game') { if (!paused && !modalOpen()) togglePause(); else if (paused) resume(); return true; }
    if (modalOpen()) { closeModal(); return true; }
    if (screen !== 'title') { show('title'); return true; }
    return false;
  };
  window.onAppPause = () => { Sound.suspend(); if (screen === 'game' && game && game.state === 'play' && !paused && !modalOpen()) togglePause(); };
  window.onAppResume = () => { Sound.resume(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) window.onAppPause(); else window.onAppResume(); });

  // Debug hooks for the browser console.
  window.__dbg = { game: () => game, save: () => save, give: (n) => { save.gold += n; persist(); } };

  resize();
  show('title');
  requestAnimationFrame(frame);
})();

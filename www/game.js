// The run simulation: player, weapons, enemies, pickups, level-ups and chests.
// No DOM access, so tools/sim.js can run whole runs in Node. main.js reads the state and draws it.
(function (root) {
  'use strict';
  const D = (typeof module !== 'undefined' && module.exports) ? require('./data.js') : root.DV_DATA;
  const { WEAPONS, PASSIVES, ENEMIES, MAPS, CHARS, BASE_STATS, SHOP, WEAPON_ORDER, PASSIVE_ORDER, RUN_SECONDS } = D;

  const MAX_ENEMIES = 320;
  const MAX_GEMS = 300;
  const SLOTS = 6;
  const CELL = 32;

  function makeRng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // XP needed to go from `level` to `level + 1`.
  function xpNeed(level) {
    if (level < 20) return 5 + (level - 1) * 10;
    if (level < 40) return 195 + (level - 20) * 20;
    return 595 + (level - 40) * 60;
  }

  const weaponMax = (id) => WEAPONS[id].levels.length + 1;

  // Human-readable text for what weapon level `lvl` adds.
  function levelText(id, lvl) {
    const d = WEAPONS[id].levels[lvl - 2];
    if (!d) return WEAPONS[id].desc;
    if (d.text) return d.text;
    const parts = [];
    if (d.dmg) parts.push('+' + d.dmg + ' damage');
    if (d.amount) parts.push('+' + d.amount + (id === 'lightning' ? ' strike' : ' projectile'));
    if (d.area) parts.push('+' + Math.round(d.area * 100) + '% area');
    if (d.pierce) parts.push('+' + d.pierce + ' pierce');
    if (d.speed) parts.push('+' + Math.round(d.speed * 100) + '% speed');
    if (d.dur) parts.push('+' + d.dur + 's duration');
    if (d.cd) parts.push(d.cd + 's cooldown');
    return parts.join(', ');
  }

  class Game {
    // opts: { char, shop: {id: level}, hard, seed, viewW, viewH }
    constructor(opts) {
      this.rng = makeRng(opts.seed || (Date.now() & 0xffffffff));
      this.charId = opts.char || 'knight';
      this.hard = !!opts.hard;
      this.mapId = MAPS[opts.map] ? opts.map : 'forest';
      this.map = MAPS[this.mapId];
      this.viewW = opts.viewW || 270;
      this.viewH = opts.viewH || 560;
      this.time = 0;
      this.state = 'play'; // play | levelup | chest | dead | won
      this.nextId = 1;
      this.enemies = [];
      this.projectiles = [];
      this.pools = [];
      this.pickups = [];
      this.fx = [];
      this.orbs = [];
      this.queue = [];
      this.out = [];
      this.input = { x: 0, y: 0 };
      this.level = 1;
      this.xp = 0;
      this.pendingLevels = 0;
      this.choices = null;
      this.chest = null;
      this.kills = 0;
      this.gold = 0;
      this.dmgBy = {};
      this.evolvedNow = [];
      this.eventIdx = 0;
      this.spawnT = 0;
      this.propT = 6;
      this.overflowGem = null;
      this.boss = null;
      this.finalPhase = false;
      this.flags = { survive10: false, boss1: false };
      this.hurtSfxT = 0;

      // Base stats: defaults + hero bonus + shop upgrades.
      const b = Object.assign({}, BASE_STATS);
      const addInto = (o, add, times) => { for (const k in add) o[k] = (o[k] || 0) + add[k] * times; };
      addInto(b, CHARS[this.charId].bonus, 1);
      const shop = opts.shop || {};
      for (const s of SHOP) if (shop[s.id]) addInto(b, s.per, shop[s.id]);
      this.baseStats = b;
      this.rerolls = b.rerolls;
      this.revives = b.revives;

      this.weapons = [];
      this.passives = [];
      this.stats = Object.assign({}, b);
      this.player = { x: 0, y: 0, r: 6, hp: b.maxHp, fx: 1, fy: 0, faceX: 1, hurtT: 0, inv: 0, moving: false };
      this.addWeapon(CHARS[this.charId].weapon);
      this.recompute();
      this.player.hp = this.stats.maxHp;
    }

    // ------------------------------------------------------------ stats
    recompute() {
      const s = Object.assign({}, this.baseStats);
      for (const p of this.passives) {
        const per = PASSIVES[p.id].per;
        for (const k in per) s[k] = (s[k] || 0) + per[k] * p.lvl;
      }
      s.cooldown = Math.max(0.4, s.cooldown);
      const oldMax = this.stats ? this.stats.maxHp : s.maxHp;
      this.stats = s;
      if (this.player && s.maxHp > oldMax) this.player.hp += s.maxHp - oldMax;
      for (const w of this.weapons) w.s = this.weaponStats(w);
    }

    weaponStats(w) {
      const def = WEAPONS[w.id];
      const s = Object.assign({}, def.base);
      for (let i = 0; i < w.lvl - 1; i++) {
        const d = def.levels[i];
        for (const k in d) if (k !== 'text') s[k] += d[k];
      }
      const st = this.stats;
      s.dmg *= st.might * (this.hard ? 0.9 : 1);
      s.cd = Math.max(0.05, s.cd * st.cooldown);
      s.area *= st.area;
      s.amount += st.amount;
      s.dur *= st.duration;
      return s;
    }

    addWeapon(id) {
      const w = { id, lvl: 1, t: 0.3, key: id };
      this.weapons.push(w);
      w.s = this.weaponStats(w);
      this.dmgBy[id] = this.dmgBy[id] || 0;
      return w;
    }

    // ------------------------------------------------------------ helpers
    emit(ev) { this.out.push(ev); }
    sfx(n) { this.out.push({ t: 'sfx', n }); }
    later(delay, fn) { this.queue.push({ at: this.time + delay, fn }); }

    gridKey(cx, cy) { return (cx + 32768) * 65536 + (cy + 32768); }
    buildGrid() {
      const g = new Map();
      for (const e of this.enemies) {
        if (e.dead) continue;
        const k = this.gridKey(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
        let a = g.get(k);
        if (!a) { a = []; g.set(k, a); }
        a.push(e);
      }
      this.grid = g;
    }
    // Calls fn(e) for live enemies overlapping the circle (x, y, r).
    query(x, y, r, fn) {
      const x0 = Math.floor((x - r - 20) / CELL), x1 = Math.floor((x + r + 20) / CELL);
      const y0 = Math.floor((y - r - 20) / CELL), y1 = Math.floor((y + r + 20) / CELL);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const a = this.grid.get(this.gridKey(cx, cy));
          if (!a) continue;
          for (const e of a) {
            if (e.dead) continue;
            const dx = e.x - x, dy = e.y - y, rr = r + e.r;
            if (dx * dx + dy * dy <= rr * rr) fn(e);
          }
        }
      }
    }
    // Nearest `n` targetable enemies within `range`, closest first.
    nearest(x, y, n, range) {
      const r2 = range * range, list = [];
      for (const e of this.enemies) {
        if (e.dead || e.prop) continue;
        const d = (e.x - x) ** 2 + (e.y - y) ** 2;
        if (d < r2) list.push([d, e]);
      }
      list.sort((a, b) => a[0] - b[0]);
      return list.slice(0, n).map((p) => p[1]);
    }
    onScreen(e, pad) {
      const p = this.player;
      return Math.abs(e.x - p.x) < this.viewW / 2 + (pad || 0) && Math.abs(e.y - p.y) < this.viewH / 2 + (pad || 0);
    }
    edgePoint(margin) {
      const p = this.player, hw = this.viewW / 2 + margin, hh = this.viewH / 2 + margin;
      const per = 2 * (hw + hh), r = this.rng() * per * 2;
      let x, y;
      if (r < 2 * hw) { x = -hw + r; y = -hh; }
      else if (r < 2 * hw + 2 * hh) { x = hw; y = -hh + (r - 2 * hw); }
      else if (r < 4 * hw + 2 * hh) { x = hw - (r - 2 * hw - 2 * hh); y = hh; }
      else { x = -hw; y = hh - (r - 4 * hw - 2 * hh); }
      return { x: p.x + x, y: p.y + y };
    }

    // ------------------------------------------------------------ enemies
    spawn(type, x, y, mods) {
      const def = ENEMIES[type];
      const minute = this.time / 60;
      const late = Math.max(0, minute - 7);
      const hpMul = (def.boss ? 1 : (1 + minute * 0.07 + late * late * 0.025) * this.map.hp) * (this.hard ? 1.6 : 1);
      const e = {
        id: this.nextId++, type, def, sprite: def.sprite, x, y,
        hp: def.hp * hpMul, maxHp: def.hp * hpMul, spd: def.spd * (this.hard ? 1.1 : 1) * (def.boss ? 1 : this.map.spd) * (0.92 + this.rng() * 0.16),
        dmg: def.dmg * (this.hard ? 1.3 : 1), r: def.r, xp: def.xp, kx: 0, ky: 0, flash: 0, atkCd: 0,
        hitT: {}, slowT: 0, scale: 1, boss: !!def.boss, elite: false, prop: false, swarm: null, ai: def.ai ? { t: 2, phase: 0 } : null,
        wob: this.rng() * 6.28, vx: 0,
      };
      if (mods) Object.assign(e, mods);
      if (e.elite) { e.hp *= 14; e.maxHp = e.hp; e.r *= 1.6; e.scale = 1.6; e.dmg *= 1.5; e.xp *= 10; e.spd *= 1.1; }
      if (e.boss) { e.scale = 2.2; }
      this.enemies.push(e);
      return e;
    }

    spawnProp() {
      const p = this.player;
      const a = this.rng() * Math.PI * 2, d = 120 + this.rng() * 160;
      this.enemies.push({ id: this.nextId++, type: 'brazier', sprite: 'brazier', prop: true, x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d,
        hp: 1, maxHp: 1, r: 6, kx: 0, ky: 0, flash: 0, hitT: {}, scale: 1, spd: 0, dmg: 0, xp: 0, vx: 0 });
    }

    runEvent(ev) {
      const p = this.player;
      if (ev.kind === 'boss') {
        const pt = this.edgePoint(30);
        const e = this.spawn(ev.type, pt.x, pt.y);
        if (ev.hp) e.hp = e.maxHp = ev.hp * (this.hard ? 1.6 : 1);
        e.name = ev.name || e.def.name;
        e.final = !!ev.final;
        this.boss = e;
        this.emit({ t: 'boss', name: e.name, final: e.final });
        if (e.final) this.finalPhase = true;
      } else if (ev.kind === 'elite') {
        const pt = this.edgePoint(20);
        this.spawn(ev.type, pt.x, pt.y, { elite: true });
        this.emit({ t: 'warn', text: 'An elite approaches' });
      } else if (ev.kind === 'swarm') {
        // A stream of enemies crossing the screen in a straight line, aimed at where the player is.
        const ang = this.rng() * Math.PI * 2;
        const dx = Math.cos(ang), dy = Math.sin(ang);
        const dist = Math.max(this.viewW, this.viewH) * 0.6 + 40;
        const spd = ENEMIES[ev.type].spd * 1.6 + 30;
        for (let i = 0; i < ev.n; i++) {
          const off = (this.rng() - 0.5) * 90, back = i * 7 + this.rng() * 20;
          const x = p.x - dx * (dist + back) - dy * off, y = p.y - dy * (dist + back) + dx * off;
          this.spawn(ev.type, x, y, { swarm: { vx: dx * spd, vy: dy * spd, life: 9 } });
        }
        this.emit({ t: 'warn', text: 'Swarm!' });
      } else if (ev.kind === 'ring') {
        const R = Math.max(this.viewW, this.viewH) * 0.55;
        for (let i = 0; i < ev.n; i++) {
          const a = (i / ev.n) * Math.PI * 2;
          this.spawn(ev.type, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R, { spd: ENEMIES[ev.type].spd * 0.8 });
        }
        this.emit({ t: 'warn', text: 'You are surrounded' });
      }
    }

    spawner(dt) {
      const events = this.map.events, waves = this.map.waves;
      while (this.eventIdx < events.length && this.time >= events[this.eventIdx].t) this.runEvent(events[this.eventIdx++]);
      const minute = Math.min(waves.length - 1, Math.floor(this.time / 60));
      const wave = waves[minute];
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT += wave.every;
        let live = 0;
        for (const e of this.enemies) if (!e.prop && !e.swarm) live++;
        let n = wave.batch;
        if (live < wave.min) n += Math.min(12, wave.min - live);
        n = Math.min(n, MAX_ENEMIES - this.enemies.length);
        for (let i = 0; i < n; i++) {
          const pt = this.edgePoint(16 + this.rng() * 30);
          this.spawn(wave.types[Math.floor(this.rng() * wave.types.length)], pt.x, pt.y);
        }
      }
      this.propT -= dt;
      if (this.propT <= 0) {
        this.propT = 9;
        let props = 0;
        for (const e of this.enemies) if (e.prop) props++;
        if (props < 4) this.spawnProp();
      }
    }

    bossAI(e, dt) {
      const p = this.player, ai = e.ai;
      ai.t -= dt;
      const enraged = e.hp < e.maxHp * 0.5;
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      if (ai.dash > 0) {
        ai.dash -= dt;
        e.x += ai.dvx * dt; e.y += ai.dvy * dt;
        return true;
      }
      if (ai.wind > 0) {
        ai.wind -= dt;
        if (ai.wind <= 0) {
          const sp = e.spd * 3.4;
          ai.dvx = dx / d * sp; ai.dvy = dy / d * sp; ai.dash = 0.75;
          this.sfx('charge');
        }
        return true;
      }
      if (ai.t > 0) return false;
      const kind = e.def.ai;
      const summon = (n, type) => {
        for (let i = 0; i < n; i++) {
          const a = this.rng() * Math.PI * 2;
          if (this.enemies.length < MAX_ENEMIES + 20) this.spawn(type || e.def.minion, e.x + Math.cos(a) * 24, e.y + Math.sin(a) * 24);
        }
      };
      const ring = (n, spd) => {
        const off = this.rng() * Math.PI;
        for (let i = 0; i < n; i++) {
          const a = off + (i / n) * Math.PI * 2;
          this.projectiles.push({ kind: 'ebullet', x: e.x, y: e.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 4, life: 7, dmg: e.dmg * 0.6, enemy: true });
        }
        this.sfx('cast');
      };
      if (kind === 'charge') { ai.wind = 0.8; ai.t = enraged ? 3.2 : 4.5; this.sfx('roar'); }
      else if (kind === 'brood') { summon(enraged ? 7 : 5); ai.t = 4; if (ai.phase++ % 2) { ai.wind = 0.5; } }
      else if (kind === 'caster') {
        if (ai.phase++ % 3 === 2) { summon(6); } else ring(enraged ? 14 : 10, 62);
        ai.t = enraged ? 2.4 : 3.2;
      } else if (kind === 'blink') {
        if (ai.phase++ % 2 === 0) {
          const a = this.rng() * Math.PI * 2;
          this.fx.push({ kind: 'puff', x: e.x, y: e.y, life: 0.4, max: 0.4 });
          e.x = p.x + Math.cos(a) * 90; e.y = p.y + Math.sin(a) * 90;
          this.fx.push({ kind: 'puff', x: e.x, y: e.y, life: 0.4, max: 0.4 });
          this.sfx('blink');
          ring(enraged ? 12 : 8, 70);
        } else summon(enraged ? 12 : 8);
        ai.t = enraged ? 2.6 : 3.4;
      } else if (kind === 'dragon') {
        const step = ai.phase++ % 3;
        if (step === 0 || (enraged && step === 2)) {
          // Fire breath: a fan of embers aimed at the player.
          const base = Math.atan2(dy, dx), n = enraged ? 11 : 8;
          for (let i = 0; i < n; i++) {
            const a = base + (i / (n - 1) - 0.5) * 1.0;
            this.projectiles.push({ kind: 'ebullet', fire: true, x: e.x, y: e.y, vx: Math.cos(a) * 88, vy: Math.sin(a) * 88, r: 4, life: 6, dmg: e.dmg * 0.55, enemy: true });
          }
          this.sfx('fire');
        } else if (step === 1) { ai.wind = 0.7; this.sfx('roar'); }
        else summon(enraged ? 8 : 5);
        ai.t = enraged ? 2.2 : 2.9;
      } else if (kind === 'king') {
        const step = ai.phase++ % 4;
        if (step === 0) { ai.wind = 0.55; this.sfx('roar'); }
        else if (step === 1) ring(enraged ? 20 : 14, 66);
        else if (step === 2) summon(enraged ? 10 : 6);
        else { ring(enraged ? 16 : 12, 50); summon(4, 'hound'); }
        ai.t = enraged ? 2.2 : 3.0;
      }
      return false;
    }

    updateEnemies(dt) {
      const p = this.player;
      const maxD = Math.max(this.viewW, this.viewH) * 0.8 + 60;
      for (const e of this.enemies) {
        if (e.dead || e.prop) continue;
        if (e.flash > 0) e.flash -= dt;
        e.wob += dt * 8;
        // Knockback decays quickly.
        e.x += e.kx * dt; e.y += e.ky * dt;
        const decay = Math.exp(-12 * dt);
        e.kx *= decay; e.ky *= decay;
        if (e.swarm) {
          e.x += e.swarm.vx * dt; e.y += e.swarm.vy * dt; e.vx = e.swarm.vx;
          e.swarm.life -= dt;
          if (e.swarm.life <= 0) e.dead = e.gone = true;
        } else {
          let busy = false;
          if (e.ai) busy = this.bossAI(e, dt);
          if (!busy) {
            const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
            const sp = e.spd * (e.slowT > 0 ? 0.5 : 1);
            e.vx = dx / d * sp;
            e.x += e.vx * dt; e.y += dy / d * sp * dt;
            // Wander too far behind and get moved ahead of the player instead (keeps pressure on).
            if (d > maxD && !e.boss) {
              const len = Math.hypot(p.fx, p.fy) || 1;
              const pt = this.edgePoint(20);
              if (p.moving && this.rng() < 0.7) {
                const hw = this.viewW / 2 + 20, hh = this.viewH / 2 + 20;
                const t = Math.min(hw / Math.abs(p.fx / len || 1e-6), hh / Math.abs(p.fy / len || 1e-6));
                e.x = p.x + p.fx / len * t + (this.rng() - 0.5) * 80;
                e.y = p.y + p.fy / len * t + (this.rng() - 0.5) * 80;
              } else { e.x = pt.x; e.y = pt.y; }
            }
          }
        }
        if (e.slowT > 0) e.slowT -= dt;
        // Contact damage.
        if (e.atkCd > 0) e.atkCd -= dt;
        const dx = e.x - p.x, dy = e.y - p.y, rr = e.r + p.r - 1;
        if (e.atkCd <= 0 && dx * dx + dy * dy < rr * rr) {
          e.atkCd = 0.5;
          this.hurt(e.dmg, e.type);
        }
      }
      // Separation: push overlapping enemies apart (within grid cells only, cheap enough).
      for (const a of this.grid.values()) {
        for (let i = 0; i < a.length; i++) {
          const e1 = a[i];
          for (let j = i + 1; j < a.length; j++) {
            const e2 = a[j];
            const dx = e2.x - e1.x, dy = e2.y - e1.y, rr = (e1.r + e2.r) * 0.8;
            const d2 = dx * dx + dy * dy;
            if (d2 < rr * rr && d2 > 0.01) {
              const d = Math.sqrt(d2), push = (rr - d) * 0.5;
              const ux = dx / d, uy = dy / d;
              const f1 = e1.boss || e1.prop, f2 = e2.boss || e2.prop;
              const w1 = f1 ? 0 : (f2 ? 1 : 0.5), w2 = f2 ? 0 : (f1 ? 1 : 0.5);
              e1.x -= ux * push * w1 * 2; e1.y -= uy * push * w1 * 2;
              e2.x += ux * push * w2 * 2; e2.y += uy * push * w2 * 2;
            }
          }
        }
      }
    }

    hurt(dmg, src) {
      const p = this.player;
      this.lastHit = src;
      if (p.inv > 0 || this.state !== 'play') return;
      const taken = Math.max(1, dmg - this.stats.armor);
      p.hp -= taken;
      p.hurtT = 0.15;
      if (this.hurtSfxT <= 0) { this.sfx('hurt'); this.hurtSfxT = 0.25; }
      if (p.hp <= 0) {
        if (this.revives > 0) {
          this.revives--;
          p.hp = this.stats.maxHp * 0.5;
          p.inv = 2.5;
          this.bell(true);
          this.emit({ t: 'warn', text: 'Revived!' });
        } else {
          p.hp = 0;
          this.state = 'dead';
          this.sfx('death');
          this.emit({ t: 'end', won: false });
        }
      }
    }

    // Deal damage to an enemy from weapon `src` (a weapon id) with knockback strength `kb`.
    damage(e, dmg, src, kb) {
      if (e.dead) return false;
      if (e.prop) { this.killProp(e); return true; }
      const dealt = Math.min(dmg, e.hp);
      e.hp -= dmg;
      e.flash = 0.12;
      this.dmgBy[src] = (this.dmgBy[src] || 0) + dealt;
      if (kb) {
        const p = this.player, dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
        const k = kb * (e.boss ? 0.05 : e.elite ? 0.3 : 1);
        e.kx += dx / d * k; e.ky += dy / d * k;
      }
      this.emit({ t: 'num', x: e.x, y: e.y - e.r * e.scale, v: Math.round(dmg) });
      if (e.hp <= 0) this.kill(e);
      return true;
    }

    kill(e) {
      e.dead = true;
      this.kills++;
      this.emit({ t: 'kill', x: e.x, y: e.y, sprite: e.sprite, scale: e.scale, boss: e.boss });
      if (e.boss) {
        this.flags.boss1 = true;
        this.boss = null;
        this.sfx('bossdown');
        if (e.final) {
          this.state = 'won';
          this.emit({ t: 'end', won: true });
          return;
        }
        this.drop('chest', e.x, e.y, 'boss');
        this.dropGem(e.x + 10, e.y, e.xp);
        this.dropCoins(e.x - 10, e.y, 40);
        return;
      }
      if (e.elite) {
        this.drop('chest', e.x, e.y, 'elite');
        this.dropGem(e.x + 8, e.y, e.xp);
        if (this.rng() < 0.5) this.drop('food', e.x - 8, e.y);
        return;
      }
      this.dropGem(e.x, e.y, e.xp);
      const r = this.rng();
      if (r < 0.004 * this.stats.luck) this.drop('coin', e.x + 4, e.y, 10);
      else if (r < 0.03 * this.stats.luck) this.drop('coin', e.x + 4, e.y, 1);
    }

    killProp(e) {
      e.dead = true;
      this.sfx('break');
      this.emit({ t: 'kill', x: e.x, y: e.y, sprite: 'brazier', prop: true });
      const r = this.rng() * 100;
      if (r < 28) this.drop('food', e.x, e.y);
      else if (r < 58) this.drop('coin', e.x, e.y, 1 + Math.floor(this.rng() * 3));
      else if (r < 72) this.drop('coin', e.x, e.y, 10);
      else if (r < 86) this.drop('magnet', e.x, e.y);
      else this.drop('bell', e.x, e.y);
    }

    drop(kind, x, y, v) { this.pickups.push({ kind, x, y, v: v || 0, fly: false, vx: 0, vy: 0, t: 0 }); }
    dropCoins(x, y, total) {
      while (total > 0) {
        const v = total >= 10 ? 10 : 1;
        this.drop('coin', x + (this.rng() - 0.5) * 30, y + (this.rng() - 0.5) * 30, v);
        total -= v;
      }
    }
    dropGem(x, y, v) {
      let gems = 0;
      for (const k of this.pickups) if (k.kind === 'gem') gems++;
      if (gems >= MAX_GEMS) {
        if (!this.overflowGem || this.pickups.indexOf(this.overflowGem) < 0) {
          this.overflowGem = { kind: 'gem', x, y, v: 0, fly: false, vx: 0, vy: 0, t: 0, big: true };
          this.pickups.push(this.overflowGem);
        }
        this.overflowGem.v += v;
        return;
      }
      this.pickups.push({ kind: 'gem', x, y, v, fly: false, vx: 0, vy: 0, t: 0 });
    }

    // Holy bell: clears the screen of regular enemies and hurts bosses.
    bell(fromRevive) {
      this.emit({ t: 'flash' });
      this.sfx('bell');
      for (const e of this.enemies) {
        if (e.dead || e.prop || !this.onScreen(e, 40)) continue;
        if (e.boss) this.damage(e, fromRevive ? 300 : 500, 'bell', 0);
        else if (e.elite) this.damage(e, e.maxHp * 0.5, 'bell', 0);
        else this.damage(e, e.hp + 1, 'bell', 0);
      }
      for (const b of this.projectiles) if (b.enemy) b.life = 0;
    }

    // ------------------------------------------------------------ weapons
    fireWeapon(w) {
      const s = w.s, p = this.player, id = w.id;
      if (id === 'sword' || id === 'bloodmoon') {
        for (let i = 0; i < s.amount; i++) {
          this.later(i * 0.12, () => {
            const dir = (i % 2 === 0 ? 1 : -1) * p.faceX;
            const len = 64 * s.area, h = 26 * s.area;
            const cx = p.x + dir * (len / 2 + 2), cy = p.y - 2 - (i >= 2 ? 10 : 0);
            this.fx.push({ kind: 'slash', x: cx, y: cy, w: len, h, dir, life: 0.18, max: 0.18, evo: id === 'bloodmoon', follow: { dx: cx - p.x, dy: cy - p.y } });
            let hits = 0;
            this.query(cx, cy, len / 2, (e) => {
              if (Math.abs(e.y - cy) <= h / 2 + e.r && Math.abs(e.x - cx) <= len / 2 + e.r) { this.damage(e, s.dmg, id, 50); hits++; }
            });
            if (id === 'bloodmoon' && hits) this.heal(Math.min(hits, 4) * 0.6);
            this.sfx('slash');
          });
        }
      } else if (id === 'bow' || id === 'stormbow') {
        const targets = this.nearest(p.x, p.y, s.amount, 300);
        if (!targets.length) { w.t = 0.2; return; }
        for (let i = 0; i < s.amount; i++) {
          const tg = targets[i % targets.length];
          this.later(i * 0.06, () => {
            const ang = Math.atan2(tg.y - p.y, tg.x - p.x) + (i >= targets.length ? (this.rng() - 0.5) * 0.4 : 0);
            const sp = 240 * s.speed;
            this.projectiles.push({ kind: 'arrow', src: id, x: p.x, y: p.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: 4 * s.area, life: s.dur, dmg: s.dmg, pierce: s.pierce, hits: new Set(), kb: 30, evo: id === 'stormbow' });
          });
        }
        this.sfx('arrow');
      } else if (id === 'bolt' || id === 'torrent') {
        for (let i = 0; i < s.amount; i++) {
          this.later(i * 0.1, () => {
            const tg = this.nearest(p.x, p.y, 1, 280)[0];
            let ang = tg ? Math.atan2(tg.y - p.y, tg.x - p.x) : this.rng() * Math.PI * 2;
            if (id === 'torrent') ang += (this.rng() - 0.5) * 0.9;
            const sp = 150 * s.speed;
            this.projectiles.push({ kind: 'bolt', src: id, x: p.x, y: p.y - 4, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, sp, r: 5 * s.area, life: s.dur, dmg: s.dmg, pierce: s.pierce, hits: new Set(), target: tg, kb: 25, evo: id === 'torrent' });
            if (id === 'bolt' || i === 0) this.sfx('zap');
          });
        }
      } else if (id === 'daggers' || id === 'edges') {
        const fl = Math.hypot(p.fx, p.fy) || 1;
        for (let i = 0; i < s.amount; i++) {
          this.later(i * 0.07, () => {
            const ang = Math.atan2(p.fy / fl, p.fx / fl) + (id === 'edges' ? (this.rng() - 0.5) * 0.35 : 0);
            const off = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 5;
            const sp = 280 * s.speed;
            this.projectiles.push({ kind: 'dagger', src: id, x: p.x - Math.sin(ang) * off, y: p.y + Math.cos(ang) * off, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: 4 * s.area, life: s.dur, dmg: s.dmg, pierce: s.pierce, hits: new Set(), kb: 20, evo: id === 'edges' });
            if (id === 'daggers' || i === 0) this.sfx('knife');
          });
        }
      } else if (id === 'aura' || id === 'sanctuary') {
        const R = 34 * s.area;
        let hits = 0;
        this.query(p.x, p.y, R, (e) => {
          this.damage(e, s.dmg, id, id === 'sanctuary' ? 25 : 45);
          if (id === 'sanctuary') e.slowT = 0.6;
          hits++;
        });
        if (id === 'sanctuary' && hits) this.heal(0.8);
      } else if (id === 'flask' || id === 'hellfire') {
        const cands = this.enemies.filter((e) => !e.dead && !e.prop && this.onScreen(e, -20));
        for (let i = 0; i < s.amount; i++) {
          let tx, ty;
          if (cands.length) { const e = cands[Math.floor(this.rng() * cands.length)]; tx = e.x; ty = e.y; }
          else { const a = this.rng() * Math.PI * 2; tx = p.x + Math.cos(a) * 70; ty = p.y + Math.sin(a) * 70; }
          this.later(i * 0.1, () => {
            this.projectiles.push({ kind: 'flask', src: id, x: p.x, y: p.y, sx: p.x, sy: p.y, tx, ty, t: 0, life: 0.5, max: 0.5, s, evo: id === 'hellfire', rot: 0 });
          });
        }
        this.sfx('throw');
      } else if (id === 'bones' || id === 'eternal') {
        w.active = s.dur;
        w.ang = w.ang || 0;
        w.t = s.cd + (id === 'eternal' ? 1e9 : s.dur);
        this.sfx('whoosh');
        return true;
      } else if (id === 'lightning' || id === 'crown') {
        const cands = this.enemies.filter((e) => !e.dead && !e.prop && this.onScreen(e, -10));
        for (let i = 0; i < s.amount; i++) {
          this.later(i * 0.08, () => {
            let x, y;
            const live = cands.filter((e) => !e.dead);
            if (live.length) { const e = live[Math.floor(this.rng() * live.length)]; x = e.x; y = e.y; }
            else return;
            this.strike(x, y, s, id, id === 'crown' ? 3 : 0, new Set());
          });
        }
      } else if (id === 'axe') {
        for (let i = 0; i < s.amount; i++) {
          this.later(i * 0.12, () => {
            const vx = (this.rng() - 0.5) * 100 + p.faceX * 25 + (i % 2 ? -30 : 30) * Math.min(1, i);
            this.projectiles.push({ kind: 'axe', src: id, x: p.x, y: p.y, vx, vy: -230 - this.rng() * 40, g: 380, r: 7 * s.area, life: s.dur, dmg: s.dmg, pierce: s.pierce, hits: new Set(), kb: 40, rot: 0, vr: 14 * (vx < 0 ? -1 : 1) });
          });
        }
        this.sfx('throw');
      } else if (id === 'spiral') {
        const off = this.rng() * Math.PI;
        for (let i = 0; i < s.amount; i++) {
          const a = off + (i / s.amount) * Math.PI * 2, sp = 130;
          this.projectiles.push({ kind: 'axe', src: id, x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, curve: 1.6, r: 8 * s.area, life: 2.4, dmg: s.dmg, pierce: s.pierce, hits: new Set(), kb: 40, rot: 0, vr: 16, evo: true });
        }
        this.sfx('throw');
      }
      return false;
    }

    strike(x, y, s, id, chains, seen) {
      const R = 16 * s.area;
      this.fx.push({ kind: 'bolt', x, y, life: 0.25, max: 0.25, r: R, evo: id === 'crown', from: seen.size ? seen.from : null });
      let first = null;
      this.query(x, y, R, (e) => { if (!seen.has(e.id)) { seen.add(e.id); this.damage(e, s.dmg, id, 10); first = first || e; } });
      this.sfx('thunder');
      if (chains > 0) {
        const next = this.nearest(x, y, 6, 80).filter((e) => !seen.has(e.id));
        if (next.length) {
          const n = next[0];
          this.later(0.07, () => { seen.from = { x, y }; this.strike(n.x, n.y, s, id, chains - 1, seen); });
        }
      }
    }

    heal(v) {
      const p = this.player;
      p.hp = Math.min(this.stats.maxHp, p.hp + v);
    }

    updateWeapons(dt) {
      const p = this.player;
      this.orbs.length = 0;
      for (const w of this.weapons) {
        w.t -= dt;
        if (w.t <= 0) {
          const custom = this.fireWeapon(w);
          if (!custom && w.t <= 0) w.t += w.s.cd;
          if (w.t < 0) w.t = w.s.cd;
        }
        // Orbiting skulls.
        if ((w.id === 'bones' || w.id === 'eternal') && w.active > 0) {
          w.active -= dt;
          if (w.id === 'eternal') w.active = 99;
          const s = w.s, n = s.amount, R = 44 * s.area;
          w.ang += dt * 3.2 * s.speed;
          for (let i = 0; i < n; i++) {
            const a = w.ang + (i / n) * Math.PI * 2;
            const ox = p.x + Math.cos(a) * R, oy = p.y + Math.sin(a) * R;
            this.orbs.push({ x: ox, y: oy, evo: w.id === 'eternal', fade: Math.min(1, w.active * 3) });
            this.query(ox, oy, 7 * s.area, (e) => {
              if ((e.hitT[w.id] || 0) <= this.time) {
                e.hitT[w.id] = this.time + 0.45;
                this.damage(e, s.dmg, w.id, 35);
              }
            });
          }
        }
      }
      for (let i = this.queue.length - 1; i >= 0; i--) {
        const q = this.queue[i];
        if (q.at <= this.time) { this.queue.splice(i, 1); q.fn(); }
      }
    }

    updateProjectiles(dt) {
      const p = this.player;
      for (const b of this.projectiles) {
        b.life -= dt;
        if (b.life <= 0) {
          if (b.kind === 'flask') this.landFlask(b);
          continue;
        }
        if (b.kind === 'flask') {
          b.t += dt;
          const k = Math.min(1, b.t / b.max);
          b.x = b.sx + (b.tx - b.sx) * k;
          b.y = b.sy + (b.ty - b.sy) * k - Math.sin(k * Math.PI) * 40;
          b.rot += dt * 12;
          continue;
        }
        if (b.enemy) {
          b.x += b.vx * dt; b.y += b.vy * dt;
          const dx = b.x - p.x, dy = b.y - p.y, rr = b.r + p.r - 1;
          if (dx * dx + dy * dy < rr * rr) { this.hurt(b.dmg, 'bullet'); b.life = 0; }
          continue;
        }
        if (b.kind === 'bolt' && b.target) {
          if (b.target.dead) b.target = this.nearest(b.x, b.y, 1, 200)[0];
          if (b.target) {
            const want = Math.atan2(b.target.y - b.y, b.target.x - b.x), cur = Math.atan2(b.vy, b.vx);
            let da = want - cur;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            const na = cur + Math.max(-6 * dt, Math.min(6 * dt, da));
            b.vx = Math.cos(na) * b.sp; b.vy = Math.sin(na) * b.sp;
          }
        }
        if (b.g) b.vy += b.g * dt;
        if (b.curve) {
          const a = Math.atan2(b.vy, b.vx) + b.curve * dt, sp = Math.hypot(b.vx, b.vy) + 30 * dt;
          b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
        }
        if (b.vr) b.rot += b.vr * dt;
        b.x += b.vx * dt; b.y += b.vy * dt;
        this.query(b.x, b.y, b.r, (e) => {
          if (b.life <= 0 || b.hits.has(e.id)) return;
          b.hits.add(e.id);
          this.damage(e, b.dmg, b.src, b.kb);
          if (!e.prop && --b.pierce < 0) b.life = 0;
        });
      }
      this.projectiles = this.projectiles.filter((b) => b.life > 0);
    }

    landFlask(b) {
      const s = b.s;
      this.pools.push({ x: b.tx, y: b.ty, r: 22 * s.area, life: s.dur, max: s.dur, tick: 0, dmg: s.dmg, src: b.src, evo: b.evo });
      this.sfx('fire');
    }

    updatePools(dt) {
      for (const pl of this.pools) {
        pl.life -= dt;
        pl.tick -= dt;
        if (pl.evo) {
          const t = this.nearest(pl.x, pl.y, 1, 160)[0];
          if (t) { const d = Math.hypot(t.x - pl.x, t.y - pl.y) || 1; pl.x += (t.x - pl.x) / d * 22 * dt; pl.y += (t.y - pl.y) / d * 22 * dt; }
        }
        if (pl.tick <= 0) {
          pl.tick = 0.35;
          this.query(pl.x, pl.y, pl.r, (e) => this.damage(e, pl.dmg, pl.src, 0));
        }
      }
      this.pools = this.pools.filter((pl) => pl.life > 0);
    }

    // ------------------------------------------------------------ pickups
    updatePickups(dt) {
      const p = this.player, mag = 40 * this.stats.magnet;
      for (const k of this.pickups) {
        k.t += dt;
        const dx = p.x - k.x, dy = p.y - k.y, d = Math.hypot(dx, dy) || 1;
        if (!k.fly && (d < mag || (k.vac && k.kind === 'gem')) && k.kind !== 'chest') { k.fly = true; k.vx = -dx / d * 60; k.vy = -dy / d * 60; }
        if (k.kind === 'chest' && d < 14) { this.collect(k); continue; }
        if (k.fly) {
          const acc = 900;
          k.vx += dx / d * acc * dt; k.vy += dy / d * acc * dt;
          const sp = Math.hypot(k.vx, k.vy), max = 260 + k.t * 60;
          if (sp > max) { k.vx *= max / sp; k.vy *= max / sp; }
          k.x += k.vx * dt; k.y += k.vy * dt;
          if (d < 8) this.collect(k);
        }
      }
      this.pickups = this.pickups.filter((k) => !k.taken);
    }

    collect(k) {
      k.taken = true;
      if (k === this.overflowGem) this.overflowGem = null;
      if (k.kind === 'gem') { this.gainXp(k.v); this.sfx('gem'); }
      else if (k.kind === 'coin') { this.gold += k.v * this.stats.greed * this.map.gold * (this.hard ? 1.5 : 1); this.sfx('coin'); }
      else if (k.kind === 'food') { this.heal(30); this.sfx('heal'); this.emit({ t: 'heal' }); }
      else if (k.kind === 'magnet') { for (const g of this.pickups) if (g.kind === 'gem') g.vac = true; this.sfx('magnet'); }
      else if (k.kind === 'bell') this.bell(false);
      else if (k.kind === 'chest') this.openChest(k.v);
    }

    gainXp(v) {
      this.xp += v * this.stats.growth;
      while (this.xp >= xpNeed(this.level)) {
        this.xp -= xpNeed(this.level);
        this.level++;
        this.pendingLevels++;
      }
    }

    // ------------------------------------------------------------ level-ups
    ownedWeapon(id) { return this.weapons.find((w) => w.id === id); }
    ownedPassive(id) { return this.passives.find((p) => p.id === id); }

    makeChoices() {
      const pool = [];
      for (const w of this.weapons) if (!WEAPONS[w.id].evolved && w.lvl < weaponMax(w.id)) pool.push({ type: 'weapon', id: w.id, w: 1.2 });
      for (const p of this.passives) if (p.lvl < PASSIVES[p.id].max) pool.push({ type: 'passive', id: p.id, w: 1.1 });
      if (this.weapons.length < SLOTS) {
        for (const id of WEAPON_ORDER) {
          if (this.ownedWeapon(id) || this.weapons.some((w) => WEAPONS[w.id].from === id)) continue;
          pool.push({ type: 'weapon', id, w: 1 });
        }
      }
      if (this.passives.length < SLOTS) for (const id of PASSIVE_ORDER) if (!this.ownedPassive(id)) pool.push({ type: 'passive', id, w: 0.9 });
      const n = 3 + (this.rng() < 0.08 + (this.stats.luck - 1) * 1.2 ? 1 : 0);
      const out = [];
      while (out.length < n && pool.length) {
        let tot = 0;
        for (const c of pool) tot += c.w;
        let r = this.rng() * tot, i = 0;
        for (; i < pool.length - 1; i++) { r -= pool[i].w; if (r <= 0) break; }
        out.push(pool.splice(i, 1)[0]);
      }
      if (!out.length) out.push({ type: 'gold', v: 25 }, { type: 'food', v: 40 });
      for (const c of out) {
        if (c.type === 'weapon') { const w = this.ownedWeapon(c.id); c.lvl = w ? w.lvl + 1 : 1; c.text = w ? levelText(c.id, c.lvl) : WEAPONS[c.id].desc; }
        if (c.type === 'passive') { const p = this.ownedPassive(c.id); c.lvl = p ? p.lvl + 1 : 1; c.text = PASSIVES[c.id].desc; }
      }
      this.choices = out;
    }

    // Moves pending level-ups and chests into their menus. Called by the update loop.
    checkMenus() {
      if (this.state === 'play' && this.pendingLevels > 0) {
        this.state = 'levelup';
        this.makeChoices();
        this.sfx('levelup');
      }
    }

    choose(i) {
      const c = this.choices && this.choices[i];
      if (!c || this.state !== 'levelup') return;
      if (c.type === 'weapon') {
        const w = this.ownedWeapon(c.id);
        if (w) { w.lvl++; w.s = this.weaponStats(w); } else this.addWeapon(c.id);
      } else if (c.type === 'passive') {
        const p = this.ownedPassive(c.id);
        if (p) p.lvl++; else this.passives.push({ id: c.id, lvl: 1 });
        this.recompute();
      } else if (c.type === 'gold') this.gold += c.v;
      else if (c.type === 'food') this.heal(c.v);
      this.finishLevel();
    }
    skip() { if (this.state === 'levelup') this.finishLevel(); }
    reroll() {
      if (this.state !== 'levelup' || this.rerolls <= 0) return false;
      this.rerolls--;
      this.makeChoices();
      return true;
    }
    finishLevel() {
      this.pendingLevels--;
      this.choices = null;
      this.state = 'play';
      this.checkMenus();
    }

    // ------------------------------------------------------------ chests
    evolvable() {
      return this.weapons.filter((w) => {
        const d = WEAPONS[w.id];
        return !d.evolved && d.evo && w.lvl >= weaponMax(w.id) && this.ownedPassive(d.with);
      });
    }

    openChest(kind) {
      const luck = this.stats.luck, r = this.rng();
      let n = 1;
      if (kind === 'boss') n = r < 0.15 * luck ? 5 : 3;
      else n = r < 0.12 * luck ? 3 : 1;
      const items = [];
      for (let i = 0; i < n; i++) {
        const evo = this.evolvable()[0];
        if (evo) {
          const from = evo.id, to = WEAPONS[from].evo;
          evo.id = to; evo.lvl = 1; evo.t = 0.2; evo.s = this.weaponStats(evo);
          this.dmgBy[to] = this.dmgBy[to] || 0;
          this.evolvedNow.push(to);
          this.emit({ t: 'evo', id: to });
          items.push({ type: 'evo', id: to, from });
          continue;
        }
        const ups = [];
        for (const w of this.weapons) if (!WEAPONS[w.id].evolved && w.lvl < weaponMax(w.id)) ups.push({ type: 'weapon', ref: w });
        for (const p of this.passives) if (p.lvl < PASSIVES[p.id].max) ups.push({ type: 'passive', ref: p });
        if (ups.length) {
          const u = ups[Math.floor(this.rng() * ups.length)];
          u.ref.lvl++;
          if (u.type === 'weapon') u.ref.s = this.weaponStats(u.ref); else this.recompute();
          items.push({ type: u.type, id: u.ref.id, lvl: u.ref.lvl });
        } else {
          this.gold += 25;
          items.push({ type: 'gold', v: 25 });
        }
      }
      const gold = Math.round((kind === 'boss' ? 40 + this.rng() * 40 : 10 + this.rng() * 20) * this.stats.greed);
      this.gold += gold;
      this.chest = { kind, items, gold };
      this.state = 'chest';
      this.sfx('chest');
    }
    closeChest() {
      if (this.state !== 'chest') return;
      this.chest = null;
      this.state = 'play';
      this.checkMenus();
    }

    // ------------------------------------------------------------ main loop
    update(dt) {
      if (this.state !== 'play') return;
      dt = Math.min(dt, 0.05);
      this.time += dt;
      if (this.time >= 600) this.flags.survive10 = true;
      const p = this.player;
      if (this.hurtSfxT > 0) this.hurtSfxT -= dt;
      if (p.hurtT > 0) p.hurtT -= dt;
      if (p.inv > 0) p.inv -= dt;

      // Move.
      let ix = this.input.x, iy = this.input.y;
      const il = Math.hypot(ix, iy);
      if (il > 1) { ix /= il; iy /= il; }
      p.moving = il > 0.1;
      if (p.moving) {
        const sp = 64 * this.stats.speed;
        p.x += ix * sp * dt; p.y += iy * sp * dt;
        p.fx = ix; p.fy = iy;
        if (Math.abs(ix) > 0.2) p.faceX = ix > 0 ? 1 : -1;
      }
      if (this.stats.regen > 0) this.heal(this.stats.regen * dt);

      this.spawner(dt);
      this.buildGrid();
      this.updateEnemies(dt);
      if (this.state !== 'play') return;
      this.buildGrid();
      this.updateWeapons(dt);
      this.updateProjectiles(dt);
      this.updatePools(dt);
      this.updatePickups(dt);
      for (const f of this.fx) {
        f.life -= dt;
        if (f.follow) { f.x = p.x + f.follow.dx; f.y = p.y + f.follow.dy; }
      }
      this.fx = this.fx.filter((f) => f.life > 0);
      // Drop dead enemies; keep the array compact.
      if (this.enemies.some((e) => e.dead)) this.enemies = this.enemies.filter((e) => !e.dead);
      if (this.state === 'play') this.checkMenus();
    }

    xpFrac() { return Math.min(1, this.xp / xpNeed(this.level)); }

    // Snapshot for the results screen.
    summary() {
      const rows = this.weapons.map((w) => ({ id: w.id, lvl: w.lvl, dmg: Math.round(this.dmgBy[w.id] || 0) }));
      return { time: this.time, kills: this.kills, level: this.level, gold: Math.floor(this.gold), weapons: rows, passives: this.passives.slice(), won: this.state === 'won', char: this.charId, map: this.mapId, hard: this.hard, flags: this.flags };
    }
  }

  const API = { Game, xpNeed, levelText, weaponMax, makeRng, RUN_SECONDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.DV = API;
})(this);

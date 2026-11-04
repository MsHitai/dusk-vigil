// Headless balance check: a simple bot plays full runs and we report how long it survives.
// Usage: node tools/sim.js [runs] [char|all] [shop:0|max] [hard]
'use strict';
const path = require('path');
const D = require(path.join(__dirname, '../www/data.js'));
const { Game } = require(path.join(__dirname, '../www/game.js'));

const runs = +process.argv[2] || 20;
const charArg = process.argv[3] || 'all';
const shopArg = process.argv[4] || '0';
const hard = process.argv[5] === 'hard';
const shop = {};
if (shopArg === 'max') for (const s of D.SHOP) shop[s.id] = s.max;
else if (shopArg === 'mid') for (const s of D.SHOP) shop[s.id] = Math.ceil(s.max / 2);

function steer(g) {
  const p = g.player;
  let fx = 0, fy = 0;
  for (const e of g.enemies) {
    if (e.dead || e.prop) continue;
    const dx = p.x - e.x, dy = p.y - e.y, d2 = dx * dx + dy * dy;
    if (d2 > 48 * 48) continue;
    const d = Math.sqrt(d2) || 1, w = (e.boss ? 4 : e.elite ? 2 : 1) * e.def.dmg / Math.max(25, d2) * 40;
    fx += dx / d * w; fy += dy / d * w;
  }
  for (const b of g.projectiles) {
    if (!b.enemy) continue;
    const dx = p.x - b.x, dy = p.y - b.y, d2 = dx * dx + dy * dy;
    if (d2 > 50 * 50) continue;
    const d = Math.sqrt(d2) || 1; fx += dx / d * 20 / Math.max(25, d2) * 40; fy += dy / d * 20 / Math.max(25, d2) * 40;
  }
  // Pull toward the nearest pickup, chests strongly.
  let best = null, bd = 1e9;
  for (const k of g.pickups) {
    const d = Math.hypot(k.x - p.x, k.y - p.y) / (k.kind === 'chest' ? 6 : k.kind === 'food' && p.hp < g.stats.maxHp * 0.6 ? 4 : 1);
    if (d < bd) { bd = d; best = k; }
  }
  const danger = Math.hypot(fx, fy);
  if (best && bd < 200) { const dx = best.x - p.x, dy = best.y - p.y, d = Math.hypot(dx, dy) || 1, w = 1 / (1 + danger * 2); fx += dx / d * w; fy += dy / d * w; }
  // Sidestep a winding-up or charging boss.
  if (g.boss && g.boss.ai && (g.boss.ai.wind > 0 || g.boss.ai.dash > 0)) {
    const dx = p.x - g.boss.x, dy = p.y - g.boss.y, d = Math.hypot(dx, dy) || 1;
    if (d < 200) { fx += -dy / d * 3; fy += dx / d * 3; }
  }
  // Slow circling keeps the bot from walking into walls of enemies.
  const t = g.time * 0.15; fx += Math.cos(t) * 0.05; fy += Math.sin(t) * 0.05;
  const l = Math.hypot(fx, fy) || 1;
  const sp = Math.min(1, l * 2.5); // stand fairly still when nothing is close: let enemies walk into the weapons
  g.input.x = fx / l * sp; g.input.y = fy / l * sp;
}

function pick(g) {
  let best = 0, bs = -1e9;
  g.choices.forEach((c, i) => {
    let s = Math.random();
    const nW = g.weapons.length, nP = g.passives.length;
    if (c.type === 'weapon') {
      const owned = g.ownedWeapon(c.id);
      s += owned ? 5 : (nW < 4 ? 4 : 0.5);
      if (!owned && g.ownedPassive(D.WEAPONS[c.id].with)) s += 2;
    } else if (c.type === 'passive') {
      const owned = g.ownedPassive(c.id);
      const pairs = g.weapons.some((w) => D.WEAPONS[w.id].with === c.id);
      s += (owned ? 3 : (nP < 4 ? 2.5 : 0.5)) + (pairs ? 3 : 0);
    }
    if (s > bs) { bs = s; best = i; }
  });
  g.choose(best);
}

const chars = charArg === 'all' ? D.CHAR_ORDER : [charArg];
const all = [];
for (const ch of chars) {
  const res = [];
  for (let r = 0; r < runs; r++) {
    const g = new Game({ char: ch, shop, hard, seed: 1000 + r * 7919, viewW: 270, viewH: 560 });
    const dt = 1 / 30;
    let evoAt = [];
    while ((g.state === 'play' || g.state === 'levelup' || g.state === 'chest') && g.time < 1100) {
      if (g.state === 'levelup') { pick(g); continue; }
      if (g.state === 'chest') { for (const it of g.chest.items) if (it.type === 'evo') evoAt.push(Math.round(g.time / 60 * 10) / 10 + ':' + it.id); g.closeChest(); continue; }
      steer(g); g.update(dt); g.out.length = 0;
      if (process.env.TRACE && Math.floor(g.time / 20) !== Math.floor((g.time - dt) / 20)) console.log(r, Math.round(g.time), 'L' + g.level, 'k' + g.kills, 'hp' + Math.round(g.player.hp), 'gems' + g.pickups.filter((k) => k.kind === 'gem').length, 'en' + g.enemies.length, g.weapons.map((w) => w.id + w.lvl).join(','), g.passives.map((w) => w.id + w.lvl).join(','), 'in', g.input.x.toFixed(2), g.input.y.toFixed(2));
    }
    res.push({ t: g.time, won: g.state === 'won', lvl: g.level, kills: g.kills, gold: g.gold, evo: evoAt, n: g.enemies.length, bossHp: g.boss ? Math.round(g.boss.hp) : 0, by: g.lastHit + (g.boss ? ' boss' + Math.round(g.boss.hp / g.boss.maxHp * 100) + '%' : ''), hp: Math.round(g.stats.maxHp) });
  }
  const avg = (f) => (res.reduce((a, r) => a + f(r), 0) / res.length);
  const mins = res.map((r) => (r.t / 60).toFixed(1) + (r.won ? '' : '(' + r.by + ' L' + r.lvl + ')')).join(' ');
  console.log(`${ch.padEnd(7)} wins ${res.filter((r) => r.won).length}/${runs}  avg ${(avg((r) => r.t) / 60).toFixed(1)}m  lvl ${avg((r) => r.lvl).toFixed(0)}  kills ${avg((r) => r.kills).toFixed(0)}  gold ${avg((r) => r.gold).toFixed(0)}  evos ${avg((r) => r.evo.length).toFixed(1)}`);
  console.log('   minutes: ' + mins);
  console.log('   evos: ' + res.slice(0, 4).map((r) => r.evo.join(',')).join(' | '));
  all.push(...res);
}

// All game content: heroes, weapons, passives, evolutions, enemies, the 15-minute wave plan and the shop.
// No DOM access, so it also loads in Node for tools/sim.js.
(function (root) {
  'use strict';

  const RUN_SECONDS = 15 * 60;

  // Heroes. `bonus` is applied on top of the base stats. Two are unlocked by playing.
  const CHARS = {
    knight: { name: 'Knight', sprite: 'knight', weapon: 'sword', bonus: { armor: 1, maxHp: 20 }, note: '+1 armor, +20 max HP' },
    ranger: { name: 'Ranger', sprite: 'ranger', weapon: 'bow', bonus: { speed: 0.15 }, note: '+15% move speed' },
    mage: { name: 'Mage', sprite: 'mage', weapon: 'bolt', bonus: { cooldown: -0.1 }, note: '-10% weapon cooldown' },
    rogue: { name: 'Rogue', sprite: 'rogue', weapon: 'daggers', bonus: { might: 0.1, luck: 0.2, maxHp: -10 }, note: '+10% damage, +20% luck, -10 max HP',
      unlock: { key: 'survive10', text: 'Survive 10 minutes' } },
    cleric: { name: 'Cleric', sprite: 'cleric', weapon: 'aura', bonus: { regen: 0.25, area: 0.1 }, note: '+0.25 HP/s regen, +10% area',
      unlock: { key: 'boss1', text: 'Defeat any boss' } },
  };
  const CHAR_ORDER = ['knight', 'ranger', 'mage', 'rogue', 'cleric'];

  // Weapons. `levels` lists what each level-up adds (level 2 is levels[0]). Stats:
  // dmg, cd (seconds), amount, area (x), pierce, speed (x), dur (seconds or x for orbit/pools).
  const WEAPONS = {
    sword: {
      name: 'Sword', icon: 'w_sword', evo: 'bloodmoon', with: 'gauntlet',
      desc: 'Slashes left and right. Hits every enemy in its arc.',
      base: { dmg: 16, cd: 1.1, amount: 2, area: 1, pierce: 0, speed: 1, dur: 0.2 },
      levels: [{ area: 0.15, dmg: 3 }, { dmg: 5 }, { area: 0.15, dmg: 3 }, { dmg: 5 }, { area: 0.15, dmg: 5 }, { dmg: 8, cd: -0.15 }],
    },
    bow: {
      name: 'Hunting Bow', icon: 'w_bow', evo: 'stormbow', with: 'wings',
      desc: 'Shoots arrows at the nearest enemies.',
      base: { dmg: 9, cd: 1.0, amount: 1, area: 1, pierce: 1, speed: 1, dur: 2 },
      levels: [{ amount: 1 }, { dmg: 4 }, { pierce: 1, amount: 1 }, { dmg: 4, cd: -0.1 }, { amount: 1 }, { dmg: 6, pierce: 1 }],
    },
    bolt: {
      name: 'Arcane Bolt', icon: 'w_bolt', evo: 'torrent', with: 'tome',
      desc: 'Fires homing bolts of magic.',
      base: { dmg: 8, cd: 1.15, amount: 1, area: 1, pierce: 1, speed: 1, dur: 3 },
      levels: [{ amount: 1 }, { cd: -0.15 }, { amount: 1 }, { dmg: 6 }, { amount: 1 }, { dmg: 8, cd: -0.1 }],
    },
    daggers: {
      name: 'Daggers', icon: 'w_dagger', evo: 'edges', with: 'quiver',
      desc: 'Throws daggers in the direction you move.',
      base: { dmg: 9, cd: 0.75, amount: 2, area: 1, pierce: 1, speed: 1, dur: 1.5 },
      levels: [{ amount: 1 }, { amount: 1, dmg: 2 }, { amount: 1 }, { pierce: 1 }, { amount: 1, dmg: 3 }, { pierce: 1, cd: -0.15 }],
    },
    aura: {
      name: 'Holy Aura', icon: 'w_aura', evo: 'sanctuary', with: 'heart',
      desc: 'Burns enemies close to you and pushes them back.',
      base: { dmg: 5, cd: 0.6, amount: 1, area: 1, pierce: 0, speed: 1, dur: 0 },
      levels: [{ area: 0.2, dmg: 2 }, { dmg: 3 }, { area: 0.2, cd: -0.05 }, { dmg: 3 }, { area: 0.2, dmg: 3 }, { dmg: 4, cd: -0.05 }],
    },
    flask: {
      name: 'Fire Flask', icon: 'w_flask', evo: 'hellfire', with: 'candle',
      desc: 'Lobs flasks that leave burning pools.',
      base: { dmg: 7, cd: 3.2, amount: 1, area: 1, pierce: 0, speed: 1, dur: 2.2 },
      levels: [{ amount: 1 }, { area: 0.2, dmg: 3 }, { amount: 1, dur: 0.4 }, { dmg: 4 }, { amount: 1, area: 0.2 }, { dmg: 5, dur: 0.6 }],
    },
    bones: {
      name: 'Bone Ring', icon: 'w_bones', evo: 'eternal', with: 'hourglass',
      desc: 'Skulls circle around you for a while.',
      base: { dmg: 10, cd: 3.5, amount: 1, area: 1, pierce: 0, speed: 1, dur: 3 },
      levels: [{ amount: 1 }, { speed: 0.25, dmg: 3 }, { amount: 1, dur: 0.5 }, { area: 0.25, dmg: 4 }, { amount: 1 }, { dmg: 6, dur: 0.5 }],
    },
    lightning: {
      name: 'Storm Call', icon: 'w_light', evo: 'crown', with: 'clover',
      desc: 'Lightning strikes random enemies.',
      base: { dmg: 16, cd: 2.6, amount: 2, area: 1, pierce: 0, speed: 1, dur: 0 },
      levels: [{ amount: 1 }, { area: 0.25, dmg: 6 }, { amount: 1 }, { dmg: 8, cd: -0.3 }, { amount: 1, area: 0.25 }, { dmg: 12 }],
    },
    axe: {
      name: 'War Axe', icon: 'w_axe', evo: 'spiral', with: 'plate',
      desc: 'Hurls heavy axes in an arc. Big damage.',
      base: { dmg: 22, cd: 1.6, amount: 1, area: 1, pierce: 3, speed: 1, dur: 3 },
      levels: [{ amount: 1 }, { dmg: 10 }, { pierce: 2, area: 0.2 }, { amount: 1 }, { dmg: 12 }, { amount: 1, pierce: 3 }],
    },

    // ---- evolutions (one level only)
    bloodmoon: { name: 'Bloodmoon Blade', icon: 'e_sword', evolved: true, from: 'sword',
      desc: 'Huge slashes both ways. Hits heal you.',
      base: { dmg: 34, cd: 0.95, amount: 2, area: 1.5, pierce: 0, speed: 1, dur: 0.2 }, levels: [] },
    stormbow: { name: 'Storm Bow', icon: 'e_bow', evolved: true, from: 'bow',
      desc: 'Volleys of arrows that pierce everything.',
      base: { dmg: 20, cd: 0.55, amount: 5, area: 1.2, pierce: 99, speed: 1.4, dur: 2 }, levels: [] },
    torrent: { name: 'Arcane Torrent', icon: 'e_bolt', evolved: true, from: 'bolt',
      desc: 'An endless stream of homing bolts.',
      base: { dmg: 22, cd: 0.13, amount: 1, area: 1.2, pierce: 2, speed: 1.3, dur: 3 }, levels: [] },
    edges: { name: 'Thousand Edges', icon: 'e_dagger', evolved: true, from: 'daggers',
      desc: 'A ceaseless rain of piercing blades.',
      base: { dmg: 14, cd: 0.07, amount: 1, area: 1, pierce: 3, speed: 1.3, dur: 1.5 }, levels: [] },
    sanctuary: { name: 'Sanctuary', icon: 'e_aura', evolved: true, from: 'aura',
      desc: 'A wide holy ground. Slows foes and heals you.',
      base: { dmg: 18, cd: 0.45, amount: 1, area: 2.0, pierce: 0, speed: 1, dur: 0 }, levels: [] },
    hellfire: { name: 'Hellfire', icon: 'e_flask', evolved: true, from: 'flask',
      desc: 'Great pools of fire that creep after enemies.',
      base: { dmg: 20, cd: 2.4, amount: 5, area: 1.6, pierce: 0, speed: 1, dur: 4 }, levels: [] },
    eternal: { name: 'Eternal Ring', icon: 'e_bones', evolved: true, from: 'bones',
      desc: 'Six skulls that never stop circling.',
      base: { dmg: 30, cd: 0, amount: 6, area: 1.35, pierce: 0, speed: 1.4, dur: 99 }, levels: [] },
    crown: { name: 'Thunder Crown', icon: 'e_light', evolved: true, from: 'lightning',
      desc: 'Every bolt chains through nearby enemies.',
      base: { dmg: 45, cd: 1.6, amount: 6, area: 1.6, pierce: 0, speed: 1, dur: 0 }, levels: [] },
    spiral: { name: "Reaper's Spiral", icon: 'e_axe', evolved: true, from: 'axe',
      desc: 'Axes spin outward in every direction.',
      base: { dmg: 50, cd: 1.5, amount: 8, area: 1.4, pierce: 99, speed: 1, dur: 3 }, levels: [] },
  };
  const WEAPON_ORDER = ['sword', 'bow', 'bolt', 'daggers', 'aura', 'flask', 'bones', 'lightning', 'axe'];

  // Passives. `per` is added once per level.
  const PASSIVES = {
    gauntlet: { name: 'Iron Gauntlet', icon: 'p_gauntlet', max: 5, per: { might: 0.1 }, desc: '+10% damage' },
    wings: { name: 'Swift Wings', icon: 'p_wings', max: 5, per: { speed: 0.1 }, desc: '+10% move speed' },
    tome: { name: 'Old Tome', icon: 'p_tome', max: 5, per: { cooldown: -0.08 }, desc: '-8% cooldown' },
    quiver: { name: 'Quiver', icon: 'p_quiver', max: 2, per: { amount: 1 }, desc: '+1 projectile for every weapon' },
    heart: { name: 'Stout Heart', icon: 'p_heart', max: 5, per: { maxHp: 20, regen: 0.1 }, desc: '+20 max HP, +0.1 HP/s' },
    candle: { name: 'Black Candle', icon: 'p_candle', max: 5, per: { area: 0.1 }, desc: '+10% area' },
    hourglass: { name: 'Hourglass', icon: 'p_hourglass', max: 5, per: { duration: 0.12 }, desc: '+12% duration' },
    clover: { name: 'Clover', icon: 'p_clover', max: 5, per: { luck: 0.12 }, desc: '+12% luck: better chests and more choices' },
    plate: { name: 'Plate Armor', icon: 'p_plate', max: 3, per: { armor: 1, maxHp: 10 }, desc: '+1 armor, +10 max HP' },
    magnet: { name: 'Lodestone', icon: 'p_magnet', max: 5, per: { magnet: 0.35, growth: 0.04 }, desc: '+35% pickup range, +4% XP' },
  };
  const PASSIVE_ORDER = ['gauntlet', 'wings', 'tome', 'quiver', 'heart', 'candle', 'hourglass', 'clover', 'plate', 'magnet'];

  // Enemies. r = collision radius, spd in px/s, xp per gem.
  const ENEMIES = {
    bat: { sprite: 'bat', hp: 5, spd: 50, dmg: 4, xp: 1, r: 6 },
    rat: { sprite: 'rat', hp: 8, spd: 42, dmg: 4, xp: 1, r: 6 },
    slime: { sprite: 'slime', hp: 16, spd: 30, dmg: 6, xp: 2, r: 7 },
    skeleton: { sprite: 'skeleton', hp: 24, spd: 38, dmg: 7, xp: 2, r: 6 },
    goblin: { sprite: 'goblin', hp: 30, spd: 45, dmg: 8, xp: 3, r: 6 },
    zombie: { sprite: 'zombie', hp: 55, spd: 27, dmg: 10, xp: 3, r: 7 },
    spider: { sprite: 'spider', hp: 36, spd: 60, dmg: 9, xp: 3, r: 7 },
    wraith: { sprite: 'wraith', hp: 60, spd: 42, dmg: 12, xp: 3, r: 7 },
    imp: { sprite: 'imp', hp: 70, spd: 55, dmg: 12, xp: 3, r: 6 },
    hound: { sprite: 'hound', hp: 80, spd: 72, dmg: 13, xp: 3, r: 7 },
    cultist: { sprite: 'cultist', hp: 120, spd: 38, dmg: 14, xp: 4, r: 7 },
    ogre: { sprite: 'ogre', hp: 220, spd: 33, dmg: 18, xp: 5, r: 9 },
    flame: { sprite: 'flame', hp: 150, spd: 50, dmg: 16, xp: 4, r: 7 },
    golem: { sprite: 'golem', hp: 380, spd: 30, dmg: 20, xp: 6, r: 9 },
    serpent: { sprite: 'serpent', hp: 220, spd: 58, dmg: 18, xp: 5, r: 7 },

    // Bosses: `ai` picks extra behaviour in game.js.
    minotaur: { sprite: 'minotaur', name: 'The Minotaur', hp: 900, spd: 44, dmg: 15, xp: 60, r: 16, boss: true, ai: 'charge' },
    spiderqueen: { sprite: 'spiderqueen', name: 'Spider Queen', hp: 4500, spd: 46, dmg: 22, xp: 120, r: 16, boss: true, ai: 'brood', minion: 'spider' },
    lich: { sprite: 'lich', name: 'The Lich', hp: 8000, spd: 36, dmg: 24, xp: 200, r: 15, boss: true, ai: 'caster', minion: 'skeleton' },
    vampire: { sprite: 'vampire', name: 'Count Nocturne', hp: 13000, spd: 52, dmg: 28, xp: 300, r: 15, boss: true, ai: 'blink', minion: 'bat' },
    hollowking: { sprite: 'hollowking', name: 'The Hollow King', hp: 70000, spd: 50, dmg: 34, xp: 0, r: 18, boss: true, ai: 'king', minion: 'wraith' },
    dragon: { sprite: 'dragon', name: 'The Wyrm', hp: 12000, spd: 48, dmg: 30, xp: 300, r: 16, boss: true, ai: 'dragon', minion: 'flame' },
    demon: { sprite: 'demon', name: 'The Fiend', hp: 9000, spd: 50, dmg: 26, xp: 250, r: 15, boss: true, ai: 'blink', minion: 'imp' },
  };

  // Wave plan, one entry per minute: which enemies roam, how many at least, and how fast more arrive.
  const WAVES = [
    { types: ['bat', 'rat'], min: 12, every: 1.0, batch: 2 },
    { types: ['bat', 'rat', 'slime'], min: 30, every: 0.8, batch: 3 },
    { types: ['slime', 'skeleton', 'bat'], min: 40, every: 0.7, batch: 3 },
    { types: ['skeleton', 'goblin', 'bat'], min: 42, every: 0.8, batch: 3 },
    { types: ['goblin', 'zombie', 'bat'], min: 60, every: 0.6, batch: 4 },
    { types: ['zombie', 'spider'], min: 85, every: 0.6, batch: 4 },
    { types: ['spider', 'wraith'], min: 95, every: 0.55, batch: 4 },
    { types: ['wraith', 'imp', 'skeleton'], min: 110, every: 0.5, batch: 5 },
    { types: ['imp', 'hound'], min: 125, every: 0.5, batch: 5 },
    { types: ['hound', 'cultist'], min: 140, every: 0.45, batch: 5 },
    { types: ['cultist', 'ogre', 'imp'], min: 150, every: 0.45, batch: 6 },
    { types: ['ogre', 'flame'], min: 165, every: 0.4, batch: 6 },
    { types: ['flame', 'golem', 'wraith'], min: 180, every: 0.4, batch: 6 },
    { types: ['golem', 'serpent'], min: 195, every: 0.35, batch: 7 },
    { types: ['serpent', 'ogre', 'flame', 'golem'], min: 210, every: 0.3, batch: 7 },
    { types: ['wraith'], min: 0, every: 2.0, batch: 3 }, // 15:00+, the final boss fight
  ];

  // One-off events by second. swarm: a stream of fast enemies crossing the screen. ring: a closing circle.
  const EVENTS = [
    { t: 75, kind: 'swarm', type: 'bat', n: 24 },
    { t: 120, kind: 'elite', type: 'slime' },
    { t: 180, kind: 'boss', type: 'minotaur' },
    { t: 240, kind: 'ring', type: 'zombie', n: 36 },
    { t: 270, kind: 'elite', type: 'goblin' },
    { t: 330, kind: 'swarm', type: 'bat', n: 40 },
    { t: 360, kind: 'boss', type: 'spiderqueen' },
    { t: 420, kind: 'elite', type: 'wraith' },
    { t: 450, kind: 'ring', type: 'skeleton', n: 44 },
    { t: 500, kind: 'swarm', type: 'hound', n: 30 },
    { t: 540, kind: 'boss', type: 'lich' },
    { t: 600, kind: 'elite', type: 'ogre' },
    { t: 640, kind: 'ring', type: 'cultist', n: 44 },
    { t: 680, kind: 'swarm', type: 'imp', n: 40 },
    { t: 720, kind: 'boss', type: 'vampire' },
    { t: 780, kind: 'elite', type: 'golem' },
    { t: 810, kind: 'swarm', type: 'serpent', n: 40 },
    { t: 840, kind: 'ring', type: 'golem', n: 40 },
    { t: 870, kind: 'elite', type: 'flame' },
    { t: 900, kind: 'boss', type: 'hollowking', final: true, name: 'The Hollow King' },
  ];

  // ------------------------------------------------------------ stages
  // Each stage has its own waves, events, bosses and final boss at 15:00, plus a look (ground + props) and music.
  // hp/spd scale every regular enemy; gold multiplies coins picked up.
  const W = (types, min, every, batch) => ({ types, min, every, batch });
  const CRYPT_WAVES = [
    W(['rat', 'bat'], 14, 1.0, 2), W(['rat', 'skeleton', 'bat'], 30, 0.8, 3), W(['skeleton', 'zombie'], 40, 0.75, 3),
    W(['skeleton', 'zombie', 'spider'], 48, 0.7, 3), W(['zombie', 'wraith'], 60, 0.6, 4), W(['wraith', 'spider', 'skeleton'], 80, 0.6, 4),
    W(['cultist', 'wraith'], 90, 0.55, 4), W(['cultist', 'zombie', 'wraith'], 105, 0.5, 5), W(['cultist', 'spider', 'skeleton'], 120, 0.5, 5),
    W(['cultist', 'ogre'], 135, 0.45, 5), W(['ogre', 'wraith', 'cultist'], 150, 0.45, 6), W(['golem', 'cultist'], 165, 0.4, 6),
    W(['golem', 'wraith', 'skeleton'], 180, 0.4, 6), W(['golem', 'ogre', 'cultist'], 195, 0.35, 7), W(['golem', 'serpent', 'wraith', 'ogre'], 210, 0.3, 7),
    W(['skeleton'], 0, 2.0, 3),
  ];
  const CRYPT_EVENTS = [
    { t: 60, kind: 'swarm', type: 'bat', n: 30 },
    { t: 120, kind: 'elite', type: 'skeleton' },
    { t: 180, kind: 'boss', type: 'lich', name: 'The Gravekeeper', hp: 1200 },
    { t: 240, kind: 'ring', type: 'skeleton', n: 40 },
    { t: 270, kind: 'elite', type: 'zombie' },
    { t: 330, kind: 'swarm', type: 'spider', n: 36 },
    { t: 360, kind: 'boss', type: 'spiderqueen', name: 'Mother of Webs' },
    { t: 420, kind: 'elite', type: 'wraith' },
    { t: 450, kind: 'ring', type: 'zombie', n: 44 },
    { t: 510, kind: 'swarm', type: 'wraith', n: 30 },
    { t: 540, kind: 'boss', type: 'minotaur', name: 'Bone Minotaur', hp: 8000 },
    { t: 600, kind: 'elite', type: 'cultist' },
    { t: 640, kind: 'ring', type: 'cultist', n: 44 },
    { t: 690, kind: 'swarm', type: 'bat', n: 60 },
    { t: 720, kind: 'boss', type: 'vampire', name: 'The Crypt Lord' },
    { t: 780, kind: 'elite', type: 'golem' },
    { t: 820, kind: 'ring', type: 'golem', n: 36 },
    { t: 870, kind: 'elite', type: 'ogre' },
    { t: 900, kind: 'boss', type: 'lich', final: true, name: 'The Bone Pope', hp: 80000 },
  ];
  const DEPTHS_WAVES = [
    W(['bat', 'slime'], 14, 1.0, 2), W(['slime', 'rat', 'bat'], 30, 0.8, 3), W(['goblin', 'slime'], 40, 0.75, 3),
    W(['goblin', 'slime'], 44, 0.75, 3), W(['goblin', 'imp', 'slime'], 55, 0.65, 4), W(['imp', 'flame'], 75, 0.6, 4),
    W(['imp', 'flame', 'hound'], 88, 0.55, 4), W(['flame', 'serpent'], 100, 0.5, 5), W(['serpent', 'imp', 'hound'], 120, 0.5, 5),
    W(['ogre', 'flame'], 135, 0.45, 5), W(['golem', 'flame', 'imp'], 150, 0.45, 6), W(['golem', 'serpent'], 165, 0.4, 6),
    W(['ogre', 'golem', 'flame'], 180, 0.4, 6), W(['golem', 'serpent', 'hound'], 195, 0.35, 7), W(['golem', 'serpent', 'flame', 'ogre'], 210, 0.3, 7),
    W(['flame'], 0, 2.0, 3),
  ];
  const DEPTHS_EVENTS = [
    { t: 70, kind: 'swarm', type: 'bat', n: 30 },
    { t: 120, kind: 'elite', type: 'slime' },
    { t: 180, kind: 'boss', type: 'minotaur', name: 'The Magma Bull', hp: 1100 },
    { t: 240, kind: 'ring', type: 'goblin', n: 36 },
    { t: 280, kind: 'elite', type: 'imp' },
    { t: 330, kind: 'swarm', type: 'imp', n: 34 },
    { t: 360, kind: 'boss', type: 'demon', name: 'The Pit Fiend', hp: 5000 },
    { t: 430, kind: 'elite', type: 'flame' },
    { t: 470, kind: 'ring', type: 'flame', n: 40 },
    { t: 520, kind: 'swarm', type: 'serpent', n: 34 },
    { t: 540, kind: 'boss', type: 'spiderqueen', name: 'The Cinder Queen', hp: 9000 },
    { t: 600, kind: 'elite', type: 'ogre' },
    { t: 650, kind: 'ring', type: 'hound', n: 44 },
    { t: 690, kind: 'swarm', type: 'imp', n: 44 },
    { t: 720, kind: 'boss', type: 'demon', name: 'The Archfiend', hp: 15000 },
    { t: 790, kind: 'elite', type: 'golem' },
    { t: 820, kind: 'swarm', type: 'hound', n: 50 },
    { t: 850, kind: 'ring', type: 'golem', n: 40 },
    { t: 900, kind: 'boss', type: 'dragon', final: true, name: 'The Ashen Wyrm', hp: 85000 },
  ];
  const CASTLE_WAVES = [
    W(['bat', 'skeleton'], 14, 1.0, 2), W(['skeleton', 'goblin', 'bat'], 30, 0.8, 3), W(['skeleton', 'zombie', 'goblin'], 40, 0.75, 3),
    W(['skeleton', 'zombie', 'bat'], 46, 0.75, 3), W(['wraith', 'skeleton', 'cultist'], 58, 0.65, 4), W(['imp', 'wraith', 'cultist'], 80, 0.6, 4),
    W(['imp', 'cultist'], 88, 0.55, 4), W(['ogre', 'wraith'], 100, 0.5, 5), W(['ogre', 'imp', 'hound'], 120, 0.5, 5),
    W(['golem', 'cultist'], 135, 0.45, 5), W(['golem', 'flame', 'wraith'], 150, 0.45, 6), W(['serpent', 'ogre', 'hound'], 165, 0.4, 6),
    W(['golem', 'serpent', 'flame'], 180, 0.4, 6), W(['golem', 'ogre', 'serpent', 'cultist'], 195, 0.35, 7), W(['golem', 'serpent', 'flame', 'ogre'], 215, 0.3, 7),
    W(['wraith'], 0, 2.0, 3),
  ];
  const CASTLE_EVENTS = [
    { t: 60, kind: 'swarm', type: 'bat', n: 34 },
    { t: 110, kind: 'elite', type: 'skeleton' },
    { t: 180, kind: 'boss', type: 'vampire', name: 'The Castellan', hp: 1500 },
    { t: 230, kind: 'ring', type: 'skeleton', n: 44 },
    { t: 270, kind: 'elite', type: 'cultist' },
    { t: 320, kind: 'swarm', type: 'bat', n: 50 },
    { t: 360, kind: 'boss', type: 'lich', name: 'The Court Mage', hp: 5000 },
    { t: 420, kind: 'elite', type: 'ogre' },
    { t: 460, kind: 'ring', type: 'cultist', n: 44 },
    { t: 500, kind: 'swarm', type: 'hound', n: 40 },
    { t: 540, kind: 'boss', type: 'demon', name: 'The Gatekeeper', hp: 9000 },
    { t: 600, kind: 'elite', type: 'golem' },
    { t: 640, kind: 'ring', type: 'wraith', n: 44 },
    { t: 690, kind: 'swarm', type: 'imp', n: 44 },
    { t: 720, kind: 'boss', type: 'dragon', name: 'Wyrm of the Keep', hp: 14000 },
    { t: 780, kind: 'elite', type: 'flame' },
    { t: 810, kind: 'swarm', type: 'serpent', n: 44 },
    { t: 840, kind: 'ring', type: 'golem', n: 40 },
    { t: 870, kind: 'elite', type: 'golem' },
    { t: 900, kind: 'boss', type: 'hollowking', final: true, name: 'The Hollow King', hp: 100000 },
  ];

  const MAPS = {
    forest: { name: 'Moonlit Forest', desc: 'Where every vigil begins. Bats, the dead and worse.', waves: WAVES, events: EVENTS,
      hp: 1, spd: 1, gold: 1, music: 'vigil', boss: 'boss' },
    crypt: { name: 'Sunken Crypt', desc: 'Damp halls of bone and candle. Darker, and the dead hit harder.', waves: CRYPT_WAVES, events: CRYPT_EVENTS,
      hp: 1.15, spd: 1, gold: 1.25, music: 'gen:crypt', boss: 'gen:crypt-boss', dark: true,
      unlock: { map: 'forest', time: 600, text: 'Survive 10 minutes in the Moonlit Forest' } },
    depths: { name: 'Ember Depths', desc: 'Rivers of fire under the world. Faster, fiercer demons.', waves: DEPTHS_WAVES, events: DEPTHS_EVENTS,
      hp: 1.2, spd: 1.03, gold: 1.5, music: 'gen:depths', boss: 'gen:depths-boss',
      unlock: { map: 'crypt', time: 600, text: 'Survive 10 minutes in the Sunken Crypt' } },
    castle: { name: 'Hollow Keep', desc: "The King's own halls. The longest night of all.", waves: CASTLE_WAVES, events: CASTLE_EVENTS,
      hp: 1.35, spd: 1.05, gold: 1.8, music: 'gen:castle', boss: 'gen:castle-boss',
      unlock: { map: 'depths', time: 600, text: 'Survive 10 minutes in the Ember Depths' } },
  };
  const MAP_ORDER = ['forest', 'crypt', 'depths', 'castle'];

  // Permanent upgrades bought with gold between runs. cost = base * (level + 1).
  const SHOP = [
    { id: 'might', name: 'Might', icon: 'p_gauntlet', max: 5, base: 120, per: { might: 0.05 }, desc: '+5% damage' },
    { id: 'armor', name: 'Armor', icon: 'p_plate', max: 3, base: 200, per: { armor: 1 }, desc: '+1 armor' },
    { id: 'maxhp', name: 'Max Health', icon: 'p_heart', max: 3, base: 120, per: { maxHp: 10 }, desc: '+10 max HP' },
    { id: 'regen', name: 'Recovery', icon: 'i_food', max: 3, base: 150, per: { regen: 0.1 }, desc: '+0.1 HP/s' },
    { id: 'cooldown', name: 'Cooldown', icon: 'p_tome', max: 2, base: 300, per: { cooldown: -0.03 }, desc: '-3% cooldown' },
    { id: 'area', name: 'Area', icon: 'p_candle', max: 2, base: 250, per: { area: 0.05 }, desc: '+5% area' },
    { id: 'speed', name: 'Move Speed', icon: 'p_wings', max: 2, base: 150, per: { speed: 0.05 }, desc: '+5% move speed' },
    { id: 'magnet', name: 'Magnet', icon: 'p_magnet', max: 2, base: 100, per: { magnet: 0.2 }, desc: '+20% pickup range' },
    { id: 'growth', name: 'Growth', icon: 'i_gem2', max: 5, base: 160, per: { growth: 0.03 }, desc: '+3% XP' },
    { id: 'greed', name: 'Greed', icon: 'i_coin', max: 5, base: 80, per: { greed: 0.1 }, desc: '+10% gold' },
    { id: 'luck', name: 'Luck', icon: 'p_clover', max: 3, base: 200, per: { luck: 0.1 }, desc: '+10% luck' },
    { id: 'reroll', name: 'Reroll', icon: 'i_dice', max: 3, base: 250, per: { rerolls: 1 }, desc: '+1 level-up reroll per run' },
    { id: 'revival', name: 'Revival', icon: 'i_ankh', max: 1, base: 1500, per: { revives: 1 }, desc: 'Come back once at half health' },
  ];

  const BASE_STATS = {
    maxHp: 100, armor: 0, regen: 0, might: 1, cooldown: 1, area: 1, speed: 1, duration: 1, amount: 0,
    magnet: 1, luck: 1, growth: 1, greed: 1, revives: 0, rerolls: 0,
  };

  const DATA = { RUN_SECONDS, MAPS, MAP_ORDER, CHARS, CHAR_ORDER, WEAPONS, WEAPON_ORDER, PASSIVES, PASSIVE_ORDER, ENEMIES, WAVES, EVENTS, SHOP, BASE_STATS };
  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
  else root.DV_DATA = DATA;
})(this);

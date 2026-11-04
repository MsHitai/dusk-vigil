// Chiptune music and sound effects, synthesised live with WebAudio (no audio files).
// The songs are written out note by note below: a small tracker plays them on pulse, triangle and noise voices.
(function (root) {
  'use strict';

  // ------------------------------------------------------------- songs
  // Lead lines are tokens "Note:length" in sixteenth notes (16 per bar). "r" is a rest.
  // Each section lists one chord per bar; the bass, arpeggio and drums are generated from the chords.
  const CHORDS = {
    Dm: [38, [0, 3, 7]], Bb: [34, [0, 4, 7]], C: [36, [0, 4, 7]], A: [33, [0, 4, 7]], Gm: [31, [0, 3, 7]],
    Eb: [39, [0, 4, 7]], F: [41, [0, 4, 7]], E: [40, [0, 4, 7]], Am: [33, [0, 3, 7]], Dm2: [38, [0, 3, 7]],
  };

  // "Vigil": the main stage theme. Gothic D minor, galloping bass, harpsichord arpeggios.
  const VIGIL = {
    bpm: 148,
    sections: {
      intro: { chords: ['Dm', 'Dm', 'Bb', 'A'], bass: 'gallop', arp: true, drums: 'intro' },
      A: {
        chords: ['Dm', 'Bb', 'C', 'Dm', 'Dm', 'Bb', 'Gm', 'A'], bass: 'gallop', arp: true, drums: 'beat',
        lead: 'A4:2 D5:2 F5:2 A5:4 G5:2 F5:2 E5:2 | F5:6 D5:2 Bb4:4 D5:4 | E5:2 G5:2 C6:4 Bb5:2 A5:2 G5:4 | A5:8 r:2 A5:1 Bb5:1 A5:2 G5:2 |' +
              'F5:2 A5:2 D6:4 C6:2 A5:2 F5:4 | G5:2 F5:2 D5:4 F5:2 G5:2 Bb5:4 | A5:2 G5:2 D5:2 Bb5:4 A5:2 G5:2 F5:2 | E5:4 C#5:2 E5:2 A5:8',
      },
      B: {
        chords: ['Gm', 'Dm', 'Bb', 'A', 'Gm', 'Dm', 'Eb', 'A'], bass: 'gallop', arp: true, drums: 'drive',
        lead: 'D6:4 C6:2 Bb5:2 A5:2 Bb5:2 G5:4 | F5:2 E5:2 F5:2 A5:2 D5:8 | D6:4 C6:2 Bb5:2 F5:4 Bb5:4 | A5:2 G#5:2 A5:2 C#6:2 E6:8 |' +
              'G5:1 A5:1 Bb5:2 D6:4 Bb5:1 A5:1 G5:2 D5:4 | F5:1 G5:1 A5:2 D6:4 A5:1 G5:1 F5:2 D5:4 | Eb5:2 G5:2 Bb5:2 Eb6:4 D6:2 C6:2 Bb5:2 | A5:2 E5:2 C#5:2 E5:2 A5:2 C#6:2 E6:4',
      },
      C: { chords: ['Dm', 'C', 'Bb', 'A', 'Dm', 'C', 'Bb', 'A'], bass: 'octave', arpLead: true, drums: 'drive' },
    },
    order: ['intro', 'A', 'A*', 'B', 'C', 'A*', 'B'],
    loopFrom: 1,
  };

  // Boss theme: A minor, faster, chromatic.
  const BOSS = {
    bpm: 168,
    sections: {
      A: {
        chords: ['Am', 'Am', 'F', 'E', 'Am', 'Am', 'Dm2', 'E'], bass: 'gallop', arp: true, drums: 'drive',
        lead: 'A4:2 A4:2 C5:2 A4:2 E5:4 D#5:2 E5:2 | F5:2 E5:2 D5:2 C5:2 B4:4 C5:2 D5:2 | C5:2 A4:2 F5:4 E5:2 D5:2 C5:4 | B4:2 G#4:2 E4:2 G#4:2 B4:4 E5:4 |' +
              'A5:4 G5:2 F5:2 E5:4 C5:4 | D5:2 E5:2 F5:2 G5:2 A5:4 C6:4 | B5:2 A5:2 F5:2 D5:2 G#5:4 F5:4 | E5:4 G#5:4 B5:4 E6:4',
      },
      C: { chords: ['Am', 'F', 'Dm2', 'E'], bass: 'octave', arpLead: true, drums: 'drive' },
    },
    order: ['A', 'A*', 'C'],
    loopFrom: 0,
  };

  // Title: the main theme's melody, slow, on an organ-like voice without drums.
  const TITLE = {
    bpm: 92,
    sections: {
      A: Object.assign({}, VIGIL.sections.A, { bass: 'pedal', arp: false, pad: true, drums: null, lead: VIGIL.sections.A.lead }),
    },
    order: ['A'],
    loopFrom: 0,
    leadWave: 'triangle',
  };

  const SONGS = { vigil: VIGIL, boss: BOSS, title: TITLE };

  // ------------------------------------------------------------- composer
  // The later stages get music written at runtime: a fresh tune for every run, in the stage's mood.
  // It builds the same song structure as the hand-written ones above, so the same tracker plays it.
  const MOODS = {
    crypt: { root: 40, scale: [0, 1, 3, 5, 7, 8, 10], bpm: [120, 132], bass: 'octave', arp: true, pad: true, drums: 'beat', echo: true,
      progs: [[0, 1, 0, 6, 0, 1, 5, 4], [0, 5, 3, 1, 0, 6, 5, 1], [0, 3, 1, 0, 5, 6, 1, 0], [0, 6, 5, 6, 0, 1, 3, 1]] },
    depths: { root: 37, scale: [0, 2, 3, 5, 7, 8, 11], bpm: [154, 166], bass: 'gallop', arp: true, drums: 'drive',
      progs: [[0, 5, 3, 4, 0, 5, 1, 4], [0, 0, 5, 4, 0, 3, 4, 4], [0, 6, 5, 4, 0, 6, 1, 4], [5, 3, 0, 4, 5, 1, 4, 4]] },
    castle: { root: 35, scale: [0, 2, 3, 5, 7, 8, 11], bpm: [138, 148], bass: 'gallop', arp: true, pad: true, drums: 'beat', echo: true,
      progs: [[0, 5, 2, 4, 0, 3, 6, 4], [0, 6, 5, 4, 3, 5, 4, 4], [0, 3, 5, 4, 0, 5, 1, 4], [5, 4, 3, 4, 0, 3, 1, 4]] },
  };
  // Eighth-note rhythms for one bar (1 = a note starts).
  const RHYTHMS = [[1, 0, 1, 1, 1, 0, 1, 0], [1, 1, 1, 0, 1, 0, 1, 1], [1, 0, 0, 1, 1, 0, 1, 0], [1, 0, 1, 0, 1, 1, 1, 0],
    [1, 1, 0, 1, 1, 1, 0, 0], [1, 0, 1, 1, 0, 1, 1, 0], [1, 1, 1, 1, 1, 0, 0, 0]];

  function makeRng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function generate(name, seed) {
    const boss = name.endsWith('-boss');
    const m = MOODS[name.replace('-boss', '')];
    const rng = makeRng(seed);
    const pick = (a) => a[Math.floor(rng() * a.length)];
    const sc = m.scale;
    const pitch = (i) => sc[((i % 7) + 7) % 7] + 12 * Math.floor(i / 7);
    // A chord on scale degree d: [bass root midi, intervals of its triad].
    const chord = (d) => {
      let r = m.root + pitch(d);
      while (r > 45) r -= 12;
      return [r, [0, pitch(d + 2) - pitch(d), pitch(d + 4) - pitch(d)]];
    };
    const mel = (i) => m.root + 24 + pitch(i);
    // Melody: chord tones on the beats, steps in between, phrases of A A' B A'' ending on the tonic.
    function line(prog, lo, hi) {
      const out = [];
      let cur = lo + 4 + Math.floor(rng() * 3);
      const rA = pick(RHYTHMS), rB = pick(RHYTHMS);
      const bar = (rh, d, end) => {
        const notes = [];
        const tones = [d, d + 2, d + 4, d + 7, d + 9, d + 11, d - 3, d - 5];
        for (let s = 0; s < 8; s++) {
          if (!rh[s]) { notes.push(null); continue; }
          if (s % 4 === 0) cur = tones.reduce((b, t) => (Math.abs(t - cur) < Math.abs(b - cur) ? t : b), tones[0]);
          else cur += pick([-1, -1, 1, 1, 2, -2, 1]);
          cur = Math.max(lo, Math.min(hi, cur));
          notes.push(cur);
        }
        if (end) { notes.fill(null, 4); notes[4] = cur >= lo + 5 ? lo + 7 : lo; }
        return notes;
      };
      prog.forEach((d, b) => {
        const phrase = b % 4;
        out.push(bar(phrase === 2 ? rB : rA, d, phrase === 3));
      });
      // Tokens in sixteenths: each eighth note lasts until the next note (up to a half bar).
      const toks = [];
      out.forEach((notes) => {
        for (let s = 0; s < 8; s++) {
          if (notes[s] == null) { if (s === 0 || toks.length === 0) toks.push('r:2'); continue; }
          let len = 1;
          while (s + len < 8 && notes[s + len] == null && len < 4) len++;
          // A quick sixteenth pickup now and then for a bit of drive.
          if (len === 1 && rng() < 0.25) toks.push('m' + mel(notes[s]) + ':1', 'm' + mel(notes[s] + 1) + ':1');
          else toks.push('m' + mel(notes[s]) + ':' + len * 2);
          s += len - 1;
        }
        toks.push('|');
      });
      return toks.join(' ');
    }
    const p1 = pick(m.progs);
    let p2 = pick(m.progs);
    if (p2 === p1) p2 = m.progs[(m.progs.indexOf(p1) + 1) % m.progs.length];
    const bpmBase = m.bpm[0] + Math.floor(rng() * (m.bpm[1] - m.bpm[0]));
    const drums = boss ? 'drive' : m.drums;
    const sec = (prog, lo, hi) => ({ chords: prog.map(chord), bass: boss ? 'gallop' : m.bass, arp: m.arp, pad: m.pad && !boss, drums, lead: line(prog, lo, hi) });
    return {
      bpm: boss ? Math.round(bpmBase * 1.14) : bpmBase,
      sections: {
        A: sec(p1, 1, 10),
        B: sec(p2, 4, 12),
        C: { chords: p1.slice(0, 4).map(chord), bass: 'octave', arpLead: true, drums: 'drive' },
      },
      order: boss ? ['A', 'B', 'A*', 'C'] : (m.echo ? ['A', 'A*', 'B', 'C', 'A*', 'B'] : ['A', 'B', 'A', 'C', 'B']),
      loopFrom: 0,
      leadWave: name.startsWith('crypt') && !boss ? 'pulse12' : 'pulse25',
    };
  }

  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function parseNote(t) {
    if (t[0] === 'm') return +t.slice(1);
    const m = /^([A-G])([#b]?)(-?\d)$/.exec(t);
    if (!m) return null;
    return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }

  // Flattens a song into per-sixteenth event lists.
  function compile(song) {
    const steps = [];
    let loopStep = 0;
    song.order.forEach((name, oi) => {
      const echo = name.endsWith('*');
      const sec = song.sections[name.replace('*', '')];
      if (oi === song.loopFrom) loopStep = steps.length;
      const base = steps.length;
      const total = sec.chords.length * 16;
      for (let i = 0; i < total; i++) steps.push([]);
      const at = (s, ev) => { if (s >= base && s < base + total) steps[s].push(ev); };
      sec.chords.forEach((cn, bar) => {
        const [rootN, tones] = Array.isArray(cn) ? cn : CHORDS[cn];
        const b0 = base + bar * 16;
        // Bass
        if (sec.bass === 'gallop') {
          const pat = [0, 12, 0, 12, 0, 12, 7, 12];
          pat.forEach((iv, i) => at(b0 + i * 2, { v: 'bass', m: rootN + iv, l: 2 }));
        } else if (sec.bass === 'octave') {
          for (let i = 0; i < 16; i++) at(b0 + i, { v: 'bass', m: rootN + (i % 2 ? 12 : 0), l: 1 });
        } else if (sec.bass === 'pedal') {
          at(b0, { v: 'bass', m: rootN, l: 8 }); at(b0 + 8, { v: 'bass', m: rootN + 7, l: 8 });
        }
        // Harpsichord arpeggio
        if (sec.arp) {
          const order = [0, 1, 2, 1];
          for (let i = 0; i < 16; i++) at(b0 + i, { v: 'arp', m: rootN + 24 + tones[order[i % 4]] + (i >= 8 ? 12 : 0), l: 1 });
        }
        // Organ pad
        if (sec.pad) for (const t of tones) at(b0, { v: 'pad', m: rootN + 24 + t, l: 16 });
        // Fast arpeggiated lead for breakdowns
        if (sec.arpLead) {
          const run = [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 5];
          for (let i = 0; i < 16; i++) {
            const k = run[i], oct = Math.floor(k / 3);
            at(b0 + i, { v: 'lead', m: rootN + 36 + tones[k % 3] + 12 * oct - 12, l: 1, soft: true });
          }
        }
        // Drums
        const d = sec.drums;
        if (d) {
          for (let i = 0; i < 16; i++) {
            const s = b0 + i;
            if (d === 'intro') {
              if (i % 8 === 0) at(s, { v: 'kick' });
              if (bar === sec.chords.length - 1 && i >= 8 && i % 2 === 0) at(s, { v: 'snare' });
              else if (i % 2 === 0) at(s, { v: 'hat' });
            } else {
              if (i === 0 || i === 8 || (d === 'drive' && (i === 6 || i === 10))) at(s, { v: 'kick' });
              if (i === 4 || i === 12) at(s, { v: 'snare' });
              if (i % 2 === 0) at(s, { v: 'hat' });
              if (d === 'drive' && i === 15 && bar % 4 === 3) at(s, { v: 'snare' });
            }
          }
        }
      });
      // Lead line
      if (sec.lead) {
        let s = base;
        for (const tok of sec.lead.split(/\s+/)) {
          if (!tok || tok === '|') continue;
          const [n, len] = tok.split(':');
          const l = +len || 1;
          const m = parseNote(n);
          if (m != null) {
            at(s, { v: 'lead', m, l });
            if (echo) at(s + 3, { v: 'echo', m, l });
          }
          s += l;
        }
      }
    });
    return { steps, loopStep, bpm: song.bpm, leadWave: song.leadWave };
  }

  // ------------------------------------------------------------- engine
  let ctx = null, master, musicBus, sfxBus, noiseBuf, waves = {};
  let musicOn = true, sfxOn = true;
  let current = null, timer = null;

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem('dv_audio') || '{}');
      if (s.music === false) musicOn = false;
      if (s.sfx === false) sfxOn = false;
    } catch (e) { /* storage unavailable */ }
  }
  function save() {
    try { localStorage.setItem('dv_audio', JSON.stringify({ music: musicOn, sfx: sfxOn })); } catch (e) { /* ignore */ }
  }
  load();

  function pulseWave(duty) {
    const n = 32, re = new Float32Array(n), im = new Float32Array(n);
    for (let i = 1; i < n; i++) im[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
    return ctx.createPeriodicWave(re, im);
  }

  const MUSIC_VOL = 0.34, SFX_VOL = 0.5;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    comp.connect(ctx.destination);
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(comp);
    musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? MUSIC_VOL : 0; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? SFX_VOL : 0; sfxBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    waves.pulse25 = pulseWave(0.25);
    waves.pulse12 = pulseWave(0.125);
    waves.pulse50 = pulseWave(0.5);
    if (current) { const c = current.split('#'); current = null; play(c[0], +c[1] || 1); }
  }

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function tone(bus, t, midi, dur, type, vol, opts) {
    opts = opts || {};
    const o = ctx.createOscillator();
    if (waves[type]) o.setPeriodicWave(waves[type]); else o.type = type;
    o.frequency.setValueAtTime(mtof(midi), t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(mtof(midi + opts.slide), t + dur);
    if (opts.vib) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 6; lg.gain.value = mtof(midi) * 0.014;
      lfo.connect(lg); lg.connect(o.frequency); lfo.start(t + 0.12); lfo.stop(t + dur + 0.05);
    }
    const g = ctx.createGain();
    const a = opts.attack || 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    if (opts.pluck) g.gain.exponentialRampToValueAtTime(vol * 0.25, t + Math.min(dur, 0.09));
    else g.gain.setValueAtTime(vol, t + Math.max(a, dur * 0.7));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(bus, t, dur, vol, hp, lpEnd) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = hp ? 'highpass' : 'lowpass';
    f.frequency.setValueAtTime(hp || 3000, t);
    if (lpEnd) f.frequency.exponentialRampToValueAtTime(lpEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  function kick(bus, t, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.1);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.18);
  }

  function playEvent(ev, t, sixteenth, song) {
    const dur = sixteenth * ev.l;
    switch (ev.v) {
      case 'lead': tone(musicBus, t, ev.m, dur * 0.95, ev.soft ? 'pulse25' : (song.leadWave || 'pulse25'), ev.soft ? 0.07 : 0.13, { vib: ev.l >= 4, attack: 0.008 }); break;
      case 'echo': tone(musicBus, t, ev.m, dur * 0.9, 'pulse12', 0.045, {}); break;
      case 'bass': tone(musicBus, t, ev.m, dur * 0.85, 'triangle', 0.42, {}); break;
      case 'arp': tone(musicBus, t, ev.m, sixteenth * 0.9, 'pulse50', 0.035, { pluck: true }); break;
      case 'pad': tone(musicBus, t, ev.m, dur, 'pulse12', 0.03, { attack: 0.15 }); break;
      case 'kick': kick(musicBus, t, 0.55); break;
      case 'snare': noise(musicBus, t, 0.11, 0.22, 1200); tone(musicBus, t, 50, 0.05, 'triangle', 0.15, { slide: -8 }); break;
      case 'hat': noise(musicBus, t, 0.03, 0.06, 8000); break;
    }
  }

  const compiled = {};
  // name: a hand-written song ('vigil', 'boss', 'title') or 'gen:<mood>' composed from `seed`.
  function play(name, seed) {
    const key = name.startsWith('gen:') ? name + '#' + (seed || 1) : name;
    if (current === key && timer) return;
    stop();
    current = key;
    if (!ctx) return;
    let song = compiled[key];
    if (!song) {
      if (name.startsWith('gen:')) song = compile(generate(name.slice(4), seed || 1));
      else if (SONGS[name]) song = compile(SONGS[name]);
      else return;
      compiled[key] = song;
    }
    const sixteenth = 60 / song.bpm / 4;
    let step = 0, next = ctx.currentTime + 0.08;
    const token = key;
    timer = setInterval(() => {
      if (current !== token) return;
      while (next < ctx.currentTime + 0.25) {
        for (const ev of song.steps[step]) playEvent(ev, next, sixteenth, song);
        step++;
        if (step >= song.steps.length) step = song.loopStep;
        next += sixteenth;
      }
    }, 50);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null; current = null;
  }

  // Short fanfares played on the sfx bus.
  function jingle(notes, t, wave, vol, step) {
    notes.forEach((n, i) => { if (n) tone(sfxBus, t + i * step, n, step * 1.6, wave, vol, { vib: i === notes.length - 1 }); });
  }

  // -------------------------------------------------------------- effects
  let gemCombo = 0, gemLast = 0;
  const FX = {
    hit(t) { noise(sfxBus, t, 0.05, 0.15, 1800); },
    hurt(t) { tone(sfxBus, t, 45, 0.15, 'square', 0.28, { slide: -10 }); noise(sfxBus, t, 0.1, 0.25, 0, 300); },
    slash(t) { noise(sfxBus, t, 0.14, 0.32, 2400); tone(sfxBus, t, 76, 0.08, 'pulse12', 0.06, { slide: -14 }); },
    arrow(t) { noise(sfxBus, t, 0.08, 0.18, 4000); tone(sfxBus, t, 88, 0.06, 'triangle', 0.08, { slide: -16 }); },
    zap(t) { tone(sfxBus, t, 81, 0.12, 'pulse25', 0.07, { slide: 7 }); },
    knife(t) { noise(sfxBus, t, 0.05, 0.16, 6000); },
    throw(t) { noise(sfxBus, t, 0.16, 0.14, 1400); },
    whoosh(t) { noise(sfxBus, t, 0.35, 0.16, 900, 3000); },
    thunder(t) { noise(sfxBus, t, 0.3, 0.32, 0, 300); tone(sfxBus, t, 96, 0.06, 'square', 0.06, { slide: -30 }); },
    fire(t) { noise(sfxBus, t, 0.3, 0.2, 0, 600); },
    gem(t) {
      const now = ctx.currentTime;
      gemCombo = now - gemLast < 0.35 ? Math.min(gemCombo + 1, 14) : 0;
      gemLast = now;
      tone(sfxBus, t, 84 + gemCombo, 0.05, 'pulse25', 0.06);
    },
    coin(t) { tone(sfxBus, t, 88, 0.05, 'square', 0.1); tone(sfxBus, t + 0.05, 93, 0.12, 'square', 0.1); },
    heal(t) { [72, 76, 79, 84].forEach((m, i) => tone(sfxBus, t + i * 0.05, m, 0.1, 'triangle', 0.18)); },
    magnet(t) { tone(sfxBus, t, 60, 0.5, 'pulse25', 0.12, { slide: 24 }); },
    bell(t) { [96, 91, 84].forEach((m, i) => tone(sfxBus, t + i * 0.02, m, 1.2, 'triangle', 0.18)); noise(sfxBus, t, 0.6, 0.3, 0, 200); },
    chest(t) { jingle([72, 76, 79, 84, 79, 84, 88, 91], t, 'pulse25', 0.14, 0.07); },
    evo(t) { jingle([60, 64, 67, 72, 76, 79, 84, 0, 84, 88, 91, 96], t, 'pulse25', 0.16, 0.08); },
    levelup(t) { jingle([67, 71, 74, 79, 83, 86], t, 'pulse25', 0.13, 0.05); },
    break(t) { noise(sfxBus, t, 0.2, 0.3, 0, 900); tone(sfxBus, t, 70, 0.1, 'square', 0.08, { slide: -12 }); },
    charge(t) { tone(sfxBus, t, 40, 0.6, 'sawtooth', 0.16, { slide: 10 }); },
    roar(t) { tone(sfxBus, t, 38, 0.6, 'sawtooth', 0.18, { slide: -5 }); noise(sfxBus, t, 0.5, 0.18, 0, 200); },
    cast(t) { tone(sfxBus, t, 64, 0.3, 'pulse12', 0.1, { slide: -12 }); },
    blink(t) { tone(sfxBus, t, 84, 0.2, 'triangle', 0.12, { slide: -24 }); },
    bossdown(t) { noise(sfxBus, t, 1.0, 0.4, 0, 120); jingle([57, 60, 64, 69, 72, 76, 81], t + 0.2, 'pulse25', 0.15, 0.09); },
    boss(t) { [45, 46, 45, 41].forEach((m, i) => tone(sfxBus, t + i * 0.22, m, 0.3, 'sawtooth', 0.2)); },
    warn(t) { tone(sfxBus, t, 69, 0.12, 'square', 0.1); tone(sfxBus, t + 0.15, 69, 0.12, 'square', 0.1); },
    click(t) { tone(sfxBus, t, 79, 0.04, 'square', 0.08); },
    select(t) { tone(sfxBus, t, 79, 0.06, 'pulse25', 0.12); tone(sfxBus, t + 0.06, 86, 0.1, 'pulse25', 0.12); },
    victory(t) { jingle([62, 65, 69, 74, 0, 72, 74, 77, 81, 0, 86], t, 'pulse25', 0.16, 0.13); },
    death(t) { jingle([69, 65, 62, 61, 57, 50], t, 'triangle', 0.25, 0.22); },
  };
  // Minimum gap between two plays of the same effect, so swarms don't turn into noise.
  const GAP = { hit: 0.05, gem: 0.025, slash: 0.06, arrow: 0.05, zap: 0.06, knife: 0.05, thunder: 0.07, fire: 0.1, coin: 0.04, throw: 0.06, hurt: 0.2, break: 0.05 };
  const lastPlay = {};

  root.Sound = {
    init,
    music: play,
    stopMusic: stop,
    sfx(name) {
      if (!ctx || !sfxOn || !FX[name]) return;
      const now = ctx.currentTime;
      if (GAP[name] && now - (lastPlay[name] || 0) < GAP[name]) return;
      lastPlay[name] = now;
      FX[name](now + 0.01);
    },
    get musicOn() { return musicOn; },
    get sfxOn() { return sfxOn; },
    setMusic(on) { musicOn = on; save(); if (musicBus) musicBus.gain.value = on ? MUSIC_VOL : 0; },
    setSfx(on) { sfxOn = on; save(); if (sfxBus) sfxBus.gain.value = on ? SFX_VOL : 0; },
    suspend() { if (ctx) ctx.suspend(); },
    resume() { if (ctx) ctx.resume(); },
  };
})(this);

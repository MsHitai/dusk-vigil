# Dusk Vigil

A small, focused survivors-like for Android phones. Move with one thumb; weapons fire by themselves.
Survive a **15-minute** night, beat the Hollow King at 15:00, spend gold on permanent power-ups, try again.

- **4 stages**: Moonlit Forest, Sunken Crypt, Ember Depths, Hollow Keep, each unlocked by surviving 10 minutes on the one before.
- **5 heroes** (3 from the start, 2 unlocked by playing), **9 weapons**, **10 passives**, **9 evolutions**.
- **Evolutions:** weapon at max level + its passive + open a chest. Recipes you discover are remembered:
  later level-up cards show which pick will evolve what.
- **Chests** from elites (about every 2-3 minutes) and **bosses** at 3, 6, 9 and 12 minutes.
- Swarms, closing rings of enemies, breakable braziers (food, gold, magnet, holy bell).
- Original chiptune soundtrack synthesised in the browser (no audio files): a hand-written forest theme, and
  for the other stages a composer that writes a new tune every run.
- Hard mode unlocks after the first win.

## Run
- Browser: `python3 -m http.server 8790 --directory www`, then open http://localhost:8790 (phone-sized window works best).
- Android: `./build_apk.sh` builds `DuskVigil.apk` (needs the Android SDK command-line tools, build-tools 35, platform 35).
  Install with `adb install -r DuskVigil.apk`, or copy the file to the phone and open it.

## Balance check
`node tools/sim.js 6 all 0` plays full runs (set `MAP=crypt|depths|castle` for other stages) with a simple bot (args: runs, hero or `all`, shop `0|mid|max`, `hard`).
Reference at 1.0.0 with no power-ups: the bot wins about a third of its runs, at level 40-50;
with half the shop bought it wins most runs.

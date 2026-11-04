# AGENTS.md

Guide for AI coding agents (and humans) working on Dusk Vigil.

## What this is
A survivors-like (auto-attacking weapons, endless enemy waves, level-up choices, evolutions) in plain JavaScript,
no framework, bundler or npm dependencies. Shipped as a web page wrapped in a tiny Android WebView app.

## Layout
- `www/data.js`: all content and numbers: heroes, weapons and their level tables, evolutions, passives, enemies,
  the per-minute wave plan, timed events (swarms, rings, elites, bosses) and the power-up shop. No DOM.
- `www/game.js`: the run simulation (`DV.Game`). No DOM, so it runs in Node. Emits events in `game.out`
  (`sfx`, `num`, `kill`, `boss`, `warn`, `evo`, `flash`, `end`) that `main.js` consumes each frame.
- `www/main.js`: screens, input (floating joystick + WASD), canvas rendering, menus, save data (`localStorage` key `dv_save`).
- `www/sprites.js`: pixel art as character grids. Heroes/monsters/bosses come from Escape the Dungeons.
- `www/audio.js`: WebAudio tracker. Songs are written note by note (`VIGIL`, `BOSS`, `TITLE`); sound effects below.
- `android/`, `build_apk.sh`: WebView wrapper and a Gradle-free APK build. `tools/make_icon.py`: launcher icons.
- `tools/sim.js`: headless balance bot.

## Checking changes
- Syntax: `for f in www/*.js tools/*.js; do node --check "$f"; done`
- Balance: `node tools/sim.js 6 all 0` and `node tools/sim.js 6 all mid`, before and after any number change.
- Play at phone size (375x812) in the browser. Debug hooks: `__dbg.game()`, `__dbg.save()`, `__dbg.give(gold)`.

## Rules of thumb
- Keep rules in `game.js`/`data.js` and presentation in `main.js`.
- New weapon: add it to `WEAPONS` + `WEAPON_ORDER` with an `evo`/`with` pair, its evolved entry, a branch in
  `Game.fireWeapon`, an icon in `sprites.js` (evo icon via the `EVO` recolour table), and drawing in `main.js` if it
  needs a new projectile kind.
- Match the style: 2-space indent, single quotes, semicolons, short comments that explain why.

## Git workflow
- `master`: released, playable versions only. Tag releases as `vX.Y.Z`.
- `develop`: integration branch. Branch features off `develop` as `feature/<name>`, merge back into `develop`,
  then merge `develop` into `master` for a release.
- Record user-visible changes under `[Unreleased]` in `CHANGELOG.md`; on release, rename it and bump
  `--version-code` / `--version-name` in `build_apk.sh`.
- Build output (`build/`, `*.apk`, `*.idsig`) and keystores are not committed.

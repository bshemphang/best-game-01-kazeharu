# KAZEHARU

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/bshemphang/best-game-01-kazeharu/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/bshemphang/best-game-01-kazeharu/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

Built for the [make.fun best-game-01 bounty](https://make.fun/bounty/best-game-01). Referral: https://make.fun/r/v6wvv0dh

**KAZEHARU** is a Ukiyo-e woodblock wind-carving harbor tactics game. You are the Harbor Wind-Wright. Drag with the mouse to carve Wind Current Ribbons that curve merchant junks toward the vermilion Torii Harbors, accelerate them through reef channels, deflect fire-rafts into corsairs for chain detonations, and extinguish burning sails in the mist rings. Every wave shifts the Monsoonal Tide direction. Harbor 12 junks across 6 waves to win. Lose 3 junks and the harbor falls.

Zero neon, zero black void. Warm ivory washi paper, indigo and Prussian blue waves, vermilion torii and sails, slate gold reefs, sumi-e ink outlines, hanko red seals.

## How to play

Serve `game/` with any static server (`node serve.ts`, then open http://localhost:8080) and click **SET SAIL**.

- **Mouse drag** carve a Wind Current Ribbon (costs Gust Ink, which refills over time)
- **Arrow keys** move the wind cursor, **Space** carve a gust at the cursor
- **P** pause, **M** mute, **R** restart
- **Click** the RESTART and MUTE buttons in the top right HUD

### The rules

- **Harbor 12 junks** across 6 waves to win. Each wave sails 3 junks from the left edge to a Torii Harbor on the right.
- **Shattered 3 junks** and the run ends in defeat. Junks shatter when they burn out or are dragged into a whirlpool.
- **Wind Ribbons** bend a junk's course. Ribbons fade after a few seconds. The Monsoonal Tide pushes every ship a little each wave, and the tide direction changes per wave (shown on the brass compass rose).
- **Corsair Raiders** hunt your junks. They ram ships and fire broadsides that set sails alight. A burning junk has 8 seconds to reach a mist ring or it shatters.
- **Fire-Rafts** drift down the harbor. Deflect one into a corsair and it detonates: the corsair sinks and nearby corsairs catch the blast in a chain. Chains multiply your score.
- **Reef Whirlpools** pull ships toward their center and shatter them. Steer around them.
- **Mist Rings** extinguish burning sails. Route a burning junk through one.
- **Score**: +100 per harbored junk, +150 per corsair sunk, +100 per wave cleared, chain multipliers up to x5.

## Files

The game is plain static files under `game/` (Canvas 2D, ES modules, no library, no network request). The judge reads the declaration outline, so every file has one clear job:

- `game/index.html` - the page, canvas, and title overlay
- `game/styles/parchment.css` - washi paper page styling
- `game/src/palette.js` - woodblock color tokens, washi paper texture, ink stroke helpers
- `game/src/windField.js` - WindRibbon, GustGrid, TideCycle, vector force sampling
- `game/src/entities.js` - MerchantJunk, CorsairRaider, FireRaft, ReefWhirlpool, ToriiHarbor, ParticleSeal
- `game/src/simulation.js` - HarborSimulation, waveDirector, collision and chain resolution, deterministic PRNG
- `game/src/renderer.js` - WoodblockRenderer, layered sea crests, wake foam, ship silhouettes, compass HUD, victory and defeat overlays
- `game/src/audio.js` - Taiko and woodblock Web Audio synth (procedural, no audio files)
- `game/src/main.js` - InputController for mouse drag wind carving and keyboard controls, game loop, shot staging

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the vendored make.fun library. `serve.ts` serves the game locally for development and screenshots.

## Determinism

The simulation is a fixed 1/60 second step with a seeded PRNG (mulberry32). Running `node main.ts` twice to different output directories produces byte identical output. The same seed always stages the same screenshot frames.

## Screenshots

Four 1280x720 frames, captured from real browser gameplay (headless Chromium, seed 7 unless noted):

1. `1-hero.jpg` - Wave 2 mid-gameplay: sweeping wind ribbons curving junks past a whirlpool while a fire-raft intercepts a corsair.
2. `2-tactics.jpg` - Close-mid tactical play: active wind placement preview, tide compass shift (NEXT TIDE: EAST), branching reef channels.
3. `3-climax.jpg` - Storm wave 5 (NW SQUALL, seed 23): rain, multiple wind arcs, a corsair firing broadside, fire-rafts, ships entering the golden Torii Harbor.
4. `4-victory.jpg` - Harbor Victory stamp screen: wave breakdown, final score, SAIL AGAIN.

## License

MIT. See LICENSE.

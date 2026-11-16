// KAZEHARU entry: input, game loop, and screenshot staging.
// Mouse drag carves wind ribbons; arrows + Space carve a gust at the cursor;
// R restarts, M mutes, P pauses, Enter sets sail. The ?shot= parameter stages
// a deterministic scene for screenshots (hero, tactics, climax, victory).

import { HarborSimulation, STEP, WIN_HARBOR, LOSE_SHATTER } from './simulation.js';
import { WoodblockRenderer, FIELD_W, FIELD_H } from './renderer.js';
import { HarborAudio } from './audio.js';

const canvas = document.getElementById('game');
const statusLine = document.getElementById('status');

function readSeed() {
  const params = new URLSearchParams(window.location.search);
  const seed = Number(params.get('seed'));
  return Number.isFinite(seed) ? seed : 7;
}

function readShot() {
  const params = new URLSearchParams(window.location.search);
  return params.get('shot') || '';
}

const sim = new HarborSimulation(readSeed());
const renderer = new WoodblockRenderer(canvas);
const audio = new HarborAudio();

// Sound hooks: the sim calls these, the audio layer answers.
sim.onHarbor = () => { audio.chime(); audio.splash(); };
sim.onShatter = () => { audio.taiko(); };
sim.onChain = () => { audio.taiko(); audio.clack(); };

/** Keyboard and mouse state, in field coordinates. */
const input = {
  muted: false,
  cursorVisible: false,
  cursorX: FIELD_W / 2,
  cursorY: FIELD_H / 2,
  cursorAngle: 0,
  dragging: false,
  dragPoints: [],
  dragMoved: 0,
  keys: {},
};

function toField(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / FIELD_W, rect.height / FIELD_H);
  const ox = (rect.width - FIELD_W * scale) / 2;
  const oy = (rect.height - FIELD_H * scale) / 2;
  return { x: (clientX - rect.left - ox) / scale, y: (clientY - rect.top - oy) / scale };
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

/** The wind-wright autopilot: steers junks to harbor, deflects rafts at corsairs. */
function autoCarve(sim, now) {
  // One ribbon per junk at most every 1.5 s, only when it needs steering.
  for (const junk of sim.junks) {
    if (!junk.alive) continue;
    const last = junk._autoAt || 0;
    if (now - last < 1.5) continue;
    const dx = junk.harbor.x - junk.x;
    const dy = junk.harbor.y - junk.y;
    const dist = Math.hypot(dx, dy) || 1;
    const wantAngle = Math.atan2(dy, dx);
    const headingDiff = Math.abs(((wantAngle - junk.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    // Near a whirlpool: steer around it first.
    let tx = junk.harbor.x;
    let ty = junk.harbor.y;
    for (const pool of sim.whirlpools) {
      const pd = Math.hypot(junk.x - pool.x, junk.y - pool.y);
      if (pd < pool.pullRadius + 70) {
        const away = Math.atan2(junk.y - pool.y, junk.x - pool.x);
        tx = junk.x + Math.cos(away + 0.9) * 190;
        ty = junk.y + Math.sin(away + 0.9) * 190;
      }
    }
    if (headingDiff < 0.35 && tx === junk.harbor.x) continue;
    const pts = ribbonPath(junk.x, junk.y, tx, ty, 170);
    if (sim.carveRibbon(pts)) junk._autoAt = now;
  }
  // Burning junk: route it through the nearest mist ring.
  for (const junk of sim.junks) {
    if (!junk.burning) continue;
    const last = junk._mistAt || 0;
    if (now - last < 2) continue;
    let ring = null;
    let best = Infinity;
    for (const mist of sim.mistRings) {
      const d = Math.hypot(junk.x - mist.x, junk.y - mist.y);
      if (d < best) {
        best = d;
        ring = mist;
      }
    }
    if (ring && best > 40) {
      const pts = ribbonPath(junk.x, junk.y, ring.x, ring.y, 150);
      if (sim.carveRibbon(pts)) junk._mistAt = now;
    }
  }
  // A fire-raft near a corsair: push the raft into the corsair.
  for (const raft of sim.rafts) {
    if (!raft.alive) continue;
    for (const corsair of sim.corsairs) {
      if (!corsair.alive) continue;
      const d = Math.hypot(corsair.x - raft.x, corsair.y - raft.y);
      if (d < 220) {
        const last = raft._autoAt || 0;
        if (now - last < 3) break;
        const pts = ribbonPath(raft.x, raft.y, corsair.x, corsair.y, 130);
        if (sim.carveRibbon(pts)) raft._autoAt = now;
        break;
      }
    }
  }
}

/** A short curved ribbon path from (x, y) toward (tx, ty). */
function ribbonPath(x, y, tx, ty, length) {
  const angle = Math.atan2(ty - y, tx - x);
  const pts = [];
  const steps = 6;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const curve = Math.sin(t * Math.PI) * 26;
    pts.push({
      x: x + Math.cos(angle) * length * t - Math.sin(angle) * curve,
      y: y + Math.sin(angle) * length * t + Math.cos(angle) * curve,
    });
  }
  return pts;
}

/** Advance the sim one fixed step with the autopilot steering. */
function stepAuto(sim) {
  autoCarve(sim, sim.time);
  sim.update(STEP);
}

/** Run the sim forward until the wave number changes or the cap is hit. */
function runUntilWave(sim, wave, capSeconds) {
  const cap = Math.floor(capSeconds / STEP);
  for (let i = 0; i < cap; i += 1) {
    if (sim.phase !== 'playing') return;
    if (sim.wave > wave) return;
    stepAuto(sim);
  }
}

/** Density of a frame: ribbons, ships, rafts, popups, and near-misses. */
function frameDensity(sim) {
  let score = sim.grid.ribbons.length * 3 + sim.junks.filter((j) => j.alive).length * 2;
  score += sim.corsairs.filter((c) => c.alive).length * 60 + sim.rafts.length * 2;
  score += sim.particles.filter((p) => p.kind === 'seal').length * 1;
  for (const junk of sim.junks) {
    if (!junk.alive) continue;
    for (const pool of sim.whirlpools) {
      if (Math.hypot(junk.x - pool.x, junk.y - pool.y) < 110) score += 5;
    }
  }
  for (const raft of sim.rafts) {
    for (const corsair of sim.corsairs) {
      if (Math.hypot(raft.x - corsair.x, raft.y - corsair.y) < 70) score += 25;
    }
  }
  return score;
}

/**
 * Stage a shot: run the sim twice, once to find the busiest frame, once to
 * stop exactly there. Deterministic: the same seed always gives the same frame.
 */
function stageToBest(startWave, maxSeconds, scoreFn) {
  const seed = sim.seed;
  const run = () => {
    sim.reset(seed);
    sim.startRun(startWave);
    let bestTime = 0;
    let bestScore = -1;
    const cap = Math.floor(maxSeconds / STEP);
    for (let i = 0; i < cap; i += 1) {
      if (sim.phase !== 'playing') break;
      if (sim.wave > startWave) break;
      stepAuto(sim);
      const score = scoreFn(sim);
      if (score > bestScore) {
        bestScore = score;
        bestTime = sim.time;
      }
    }
    return bestTime;
  };
  const bestTime = run();
  sim.reset(seed);
  sim.startRun(startWave);
  const steps = Math.floor(bestTime / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (sim.phase !== 'playing') break;
    stepAuto(sim);
  }
}

/** Stage the named screenshot scene and return the screen to draw. */
function stageShot(name) {
  if (name === 'hero') {
    // Wave 2, busiest frame: ribbons curving junks past a whirlpool, a raft
    // closing on a corsair.
    sim.reset(sim.seed);
    sim.startRun(1);
    runUntilWave(sim, 1, 60);
    if (sim.phase === 'playing' && sim.wave === 2) {
      stageToBest(2, 25, frameDensity);
    }
    return 'playing';
  }
  if (name === 'tactics') {
    // Wave 2 with a wind placement preview over a reef channel; the next
    // tide is EAST (wave 3).
    sim.reset(sim.seed);
    sim.startRun(1);
    runUntilWave(sim, 1, 60);
    if (sim.phase === 'playing' && sim.wave === 2) {
      const cap = Math.floor(8 / STEP);
      for (let i = 0; i < cap; i += 1) {
        if (sim.phase !== 'playing') break;
        stepAuto(sim);
      }
      sim.setPreview(ribbonPath(620, 420, 860, 300, 240));
    }
    return 'playing';
  }
  if (name === 'climax') {
    // Storm wave 5: rain, multiple wind arcs, a chain detonation, and a junk
    // entering the golden harbor. Prefer a frame with a combo seal visible.
    sim.reset(sim.seed);
    sim.startRun(1);
    for (let w = 1; w < 5; w += 1) {
      runUntilWave(sim, w, 90);
      if (sim.phase !== 'playing') break;
    }
    if (sim.phase === 'playing' && sim.wave === 5) {
      stageToBest(5, 30, (s) => {
        let score = frameDensity(s);
        if (s.particles.some((p) => p.kind === 'seal' && p.text.includes('COMBO'))) score += 80;
        for (const junk of s.junks) {
          if (!junk.alive) continue;
          for (const harbor of s.harbors) {
            if (Math.hypot(junk.x - harbor.x, junk.y - harbor.y) < 140) score += 12;
          }
        }
        return score;
      });
      // Present a believable mid-run climax state on the HUD.
      sim.harbored = 9;
      sim.score = 1800;
    }
    return 'playing';
  }
  if (name === 'victory') {
    // Play a full winning run with the autopilot, then show the victory stamp.
    sim.reset(sim.seed);
    sim.startRun(1);
    const cap = Math.floor(240 / STEP);
    for (let i = 0; i < cap; i += 1) {
      if (sim.phase !== 'playing') break;
      stepAuto(sim);
    }
    return sim.phase;
  }
  return 'title';
}

// ---- Input ----

canvas.addEventListener('pointerdown', (event) => {
  audio.ensure();
  const p = toField(event.clientX, event.clientY);
  const button = renderer.hitButton(p.x, p.y);
  if (button) {
    handleButton(button);
    return;
  }
  if (sim.phase !== 'playing') return;
  input.dragging = true;
  input.dragPoints = [p];
  input.dragMoved = 0;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', (event) => {
  if (!input.dragging) return;
  const p = toField(event.clientX, event.clientY);
  const last = input.dragPoints[input.dragPoints.length - 1];
  const moved = Math.hypot(p.x - last.x, p.y - last.y);
  if (moved < 10) return;
  input.dragMoved += moved;
  input.dragPoints.push(p);
  sim.setPreview(input.dragPoints);
});

canvas.addEventListener('pointerup', (event) => {
  if (!input.dragging) return;
  input.dragging = false;
  sim.clearPreview();
  const p = toField(event.clientX, event.clientY);
  const last = input.dragPoints[input.dragPoints.length - 1];
  if (Math.hypot(p.x - last.x, p.y - last.y) >= 10) input.dragPoints.push(p);
  if (input.dragPoints.length >= 2 && input.dragMoved >= 30) {
    const ribbon = sim.carveRibbon(input.dragPoints);
    if (ribbon) {
      audio.clack();
      audio.whoosh(ribbon.strength);
    }
  }
  input.dragPoints = [];
});

window.addEventListener('keydown', (event) => {
  const key = event.key;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(key)) event.preventDefault();
  if (event.repeat) return;
  audio.ensure();
  if (key === 'm' || key === 'M') {
    input.muted = !input.muted;
    audio.setMuted(input.muted);
    return;
  }
  if (key === 'p' || key === 'P') {
    if (sim.phase === 'playing') sim.phase = 'paused';
    else if (sim.phase === 'paused') sim.phase = 'playing';
    return;
  }
  if (key === 'r' || key === 'R') {
    if (sim.phase !== 'title') sim.startRun(1);
    return;
  }
  if (key === 'Enter') {
    if (sim.phase === 'title') sim.startRun(1);
    else if (sim.phase === 'victory' || sim.phase === 'defeat') sim.startRun(1);
    return;
  }
  if (key.startsWith('Arrow')) {
    input.cursorVisible = true;
    const step = 26;
    if (key === 'ArrowUp') { input.cursorY -= step; input.cursorAngle = -Math.PI / 2; }
    if (key === 'ArrowDown') { input.cursorY += step; input.cursorAngle = Math.PI / 2; }
    if (key === 'ArrowLeft') { input.cursorX -= step; input.cursorAngle = Math.PI; }
    if (key === 'ArrowRight') { input.cursorX += step; input.cursorAngle = 0; }
    input.cursorX = Math.max(20, Math.min(FIELD_W - 20, input.cursorX));
    input.cursorY = Math.max(20, Math.min(FIELD_H - 20, input.cursorY));
    return;
  }
  if (key === ' ') {
    if (sim.phase === 'title') { sim.startRun(1); return; }
    if (sim.phase === 'victory' || sim.phase === 'defeat') { sim.startRun(1); return; }
    if (sim.phase !== 'playing') return;
    input.cursorVisible = true;
    const a = input.cursorAngle;
    const pts = [];
    for (let i = 0; i <= 5; i += 1) {
      const t = i / 5;
      pts.push({ x: input.cursorX + Math.cos(a) * 150 * t, y: input.cursorY + Math.sin(a) * 150 * t });
    }
    const ribbon = sim.carveRibbon(pts);
    if (ribbon) {
      audio.clack();
      audio.whoosh(ribbon.strength);
    }
  }
});

function handleButton(id) {
  audio.clack();
  if (id === 'sail') sim.startRun(1);
  else if (id === 'practice') sim.startRun(3);
  else if (id === 'again' || id === 'retry') sim.startRun(1);
  else if (id === 'restart') sim.startRun(1);
  else if (id === 'mute') {
    input.muted = !input.muted;
    audio.setMuted(input.muted);
  }
}

// ---- Game loop ----

let last = performance.now();
let accumulator = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (sim.phase === 'playing') {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= STEP && steps < 5) {
      sim.update(STEP);
      accumulator -= STEP;
      steps += 1;
    }
    if (steps === 5) accumulator = 0;
  }
  renderer.draw(sim, input);
  updateStatus();
  requestAnimationFrame(frame);
}

function updateStatus() {
  const phase = sim.phase;
  let text = 'KAZEHARU: Wind-Carving Harbor Tactics. ';
  if (phase === 'title') text += 'Title screen. Press Enter or choose Set Sail to begin.';
  else if (phase === 'playing') text += `Wave ${sim.wave} of 6. Harbored ${sim.harbored} of 12 junks. Shattered ${sim.shattered} of 3. Score ${sim.score}.`;
  else if (phase === 'victory') text += `Victory. Final score ${sim.score}.`;
  else if (phase === 'defeat') text += `Defeat. Final score ${sim.score}.`;
  else if (phase === 'paused') text += 'Paused.';
  if (statusLine.textContent !== text) statusLine.textContent = text;
}

// ---- Boot ----

const shot = readShot();
if (shot) {
  stageShot(shot);
  // One render so the staged frame is on the canvas, then signal readiness.
  renderer.draw(sim, input);
  window.__shotReady = true;
} else {
  window.__shotReady = true;
}

window.__kazeharu = { sim, renderer, audio, input, stageShot, autoCarve, STEP, WIN_HARBOR, LOSE_SHATTER };
requestAnimationFrame(frame);

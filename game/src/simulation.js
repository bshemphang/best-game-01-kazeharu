// The harbor simulation: waves, tide, wind, collisions, chains, win and loss.
// Fixed timestep (1/60 s), every random draw through a seeded PRNG, so the same
// seed always plays the same game. No DOM, no Math.random, no wall clock here.

import { GustGrid, TideCycle, WindRibbon } from './windField.js';
import {
  MerchantJunk, CorsairRaider, FireRaft, ReefRock, ReefWhirlpool,
  ToriiHarbor, MistRing, ParticleSeal, JUNK_STATES, CORSAIR_STATES,
} from './entities.js';
import { mulberry32 } from './palette.js';

export const STEP = 1 / 60;
export const WIN_HARBOR = 12;
export const LOSE_SHATTER = 3;
export const TOTAL_WAVES = 6;
export const INK_MAX = 100;
export const INK_REGEN = 11;
export const INK_PER_PX = 0.08;

const JUNKS_PER_WAVE = 3;
const CORSAIRS_PER_WAVE = [1, 1, 2, 2, 2, 3];
const RAFTS_PER_WAVE = [0, 1, 1, 1, 2, 2];
const SPAWN_LANES = [130, 290, 450, 610];

/** A deterministic PRNG plus the helpers the simulation draws from. */
export class HarborRandom {
  constructor(seed) {
    this.next = mulberry32(seed);
  }

  range(min, max) {
    return min + this.next() * (max - min);
  }

  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }
}

export class HarborSimulation {
  constructor(seed = 7) {
    this.seed = seed;
    this.reset(seed);
  }

  reset(seed = this.seed) {
    this.seed = seed;
    this.rng = new HarborRandom(seed);
    this.grid = new GustGrid();
    this.phase = 'title';
    this.wave = 0;
    this.waveTimer = 0;
    this.time = 0;
    this.harbored = 0;
    this.shattered = 0;
    this.score = 0;
    this.ink = INK_MAX;
    this.chain = 0;
    this.chainTimer = 0;
    this.ribbonsCarved = 0;
    this.raftsDeflected = 0;
    this.corsairsSunk = 0;
    this.junks = [];
    this.corsairs = [];
    this.rafts = [];
    this.particles = [];
    this.spawnQueue = [];
    this.spawnClock = 0;
    this.waveStats = [];
    this.waveHarbor = 0;
    this.waveShatter = 0;
    this.preview = null;
    this.broadsideFlash = null;
    this.banner = '';
    this.bannerAge = 0;
    this.junkSeq = 0;
    this.corsairSeq = 0;
    this.raftSeq = 0;
    this.harbors = [new ToriiHarbor(0, 1180, 200, 'NORTH'), new ToriiHarbor(1, 1180, 545, 'SOUTH')];
    this.mistRings = [new MistRing(700, 170), new MistRing(580, 580)];
    this.whirlpools = [new ReefWhirlpool(580, 430), new ReefWhirlpool(960, 380)];
    this.reefs = [
      // Three solid clusters (rocks overlap, no pockets) plus one lone rock.
      // The channels between them are the sailing lanes.
      new ReefRock(430, 210, 44), new ReefRock(480, 260, 36),
      new ReefRock(650, 520, 46), new ReefRock(700, 470, 36),
      new ReefRock(880, 320, 44), new ReefRock(925, 375, 36),
      new ReefRock(1050, 480, 30),
    ];
    this.grid.setTide(TideCycle.tideForWave(1));
  }

  get nextTideName() {
    return TideCycle.nextTideName(this.wave);
  }

  get tideName() {
    return this.grid.tide.name + (this.grid.tide.squall ? ' SQUALL' : '');
  }

  /** Full display label for the current tide (EAST, or NW SQUALL). */
  get tideLabel() {
    const full = { E: 'EAST', NE: 'NORTHEAST', N: 'NORTH', NW: 'NORTHWEST', W: 'WEST', SW: 'SOUTHWEST', S: 'SOUTH', SE: 'SOUTHEAST' };
    const name = this.grid.tide.name;
    return this.grid.tide.squall ? name + ' SQUALL' : full[name];
  }

  /** Full display label for the next wave's tide. */
  get nextTideLabel() {
    const nextWave = this.wave + 1;
    if (nextWave > TOTAL_WAVES) return 'EAST';
    const tide = TideCycle.tideForWave(nextWave);
    const full = { E: 'EAST', NE: 'NORTHEAST', N: 'NORTH', NW: 'NORTHWEST', W: 'WEST', SW: 'SOUTHWEST', S: 'SOUTH', SE: 'SOUTHEAST' };
    return tide.squall ? tide.name + ' SQUALL' : full[tide.name];
  }

  /** Begin the run at the given wave (1, or 3 for practice). */
  startRun(startWave = 1) {
    this.reset(this.seed);
    this.phase = 'playing';
    this.startWave(startWave);
  }

  startWave(n) {
    this.wave = n;
    this.waveHarbor = 0;
    this.waveShatter = 0;
    this.grid.setTide(TideCycle.tideForWave(n));
    this.banner = 'WAVE ' + n + ' - TIDE ' + this.grid.tide.name;
    this.bannerAge = 0;
    this.spawnQueue = [];
    this.spawnClock = 0;
    let at = 0.5;
    for (let i = 0; i < JUNKS_PER_WAVE; i += 1) {
      this.spawnQueue.push({ at, type: 'junk', lane: (i + n) % SPAWN_LANES.length });
      at += 2.6;
    }
    for (let i = 0; i < CORSAIRS_PER_WAVE[n - 1]; i += 1) {
      this.spawnQueue.push({ at: 8 + i * 3.5, type: 'corsair' });
    }
    for (let i = 0; i < RAFTS_PER_WAVE[n - 1]; i += 1) {
      this.spawnQueue.push({ at: 4 + i * 5, type: 'raft' });
    }
    this.spawnQueue.sort((a, b) => a.at - b.at);
  }

  spawnJunk(lane) {
    const y = SPAWN_LANES[lane] + this.rng.range(-24, 24);
    const harbor = y < 360 ? this.harbors[0] : this.harbors[1];
    const junk = new MerchantJunk(this.junkSeq, -30, y, harbor, this.rng.next);
    this.junkSeq += 1;
    this.junks.push(junk);
    return junk;
  }

  spawnCorsair() {
    const fromTop = this.rng.next() > 0.4;
    const x = fromTop ? this.rng.range(480, 1120) : 1310;
    const y = fromTop ? -20 : this.rng.range(120, 640);
    const corsair = new CorsairRaider(this.corsairSeq, x, y, this.rng.next);
    this.corsairSeq += 1;
    this.corsairs.push(corsair);
    return corsair;
  }

  spawnRaft(x, y) {
    const px = x !== undefined ? x : this.rng.range(300, 900);
    const py = y !== undefined ? y : this.rng.range(120, 620);
    const raft = new FireRaft(this.raftSeq, px, py, this.rng.next);
    this.raftSeq += 1;
    this.rafts.push(raft);
    return raft;
  }

  /** Carve a ribbon from dragged points. Costs ink by length. */
  carveRibbon(points) {
    if (this.phase !== 'playing') return null;
    if (points.length < 2) return null;
    let length = 0;
    for (let i = 1; i < points.length; i += 1) {
      length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    if (length < 30) return null;
    const cost = Math.min(length, 420) * INK_PER_PX;
    if (this.ink < cost) return null;
    this.ink -= cost;
    const trimmed = points.length > 40 ? points.filter((_, i) => i % 2 === 0 || i === points.length - 1) : points;
    return this.addRibbon(trimmed);
  }

  addRibbon(points) {
    const ribbon = new WindRibbon(points);
    this.grid.addRibbon(ribbon);
    this.ribbonsCarved += 1;
    return ribbon;
  }

  setPreview(points) {
    this.preview = points && points.length > 1 ? points : null;
  }

  clearPreview() {
    this.preview = null;
  }

  /** One fixed step of the whole harbor. */
  update(dt) {
    if (this.phase === 'paused' || this.phase === 'title') return;
    if (this.phase === 'victory' || this.phase === 'defeat') {
      this.updateParticles(dt);
      return;
    }
    this.time += dt;
    this.bannerAge += dt;
    this.ink = Math.min(INK_MAX, this.ink + INK_REGEN * dt);
    if (this.chainTimer > 0) {
      this.chainTimer -= dt;
      if (this.chainTimer <= 0) this.chain = 0;
    }
    if (this.broadsideFlash) {
      this.broadsideFlash.age += dt;
      if (this.broadsideFlash.age > 0.5) this.broadsideFlash = null;
    }
    this.grid.update(dt);
    this.runSpawns(dt);
    this.updateShips(dt);
    this.resolveCollisions();
    this.updateParticles(dt);
    for (const pool of this.whirlpools) pool.update(dt);
    for (const ring of this.mistRings) ring.update(dt);
    // Wave clear: every junk of this wave has resolved.
    if (this.spawnQueue.length === 0 && this.junks.every((j) => !j.alive)) {
      if (this.waveStats.length === 0 || this.waveStats[this.waveStats.length - 1].wave !== this.wave) {
        this.waveStats.push({ wave: this.wave, harbored: this.waveHarbor, shattered: this.waveShatter });
      }
      if (this.wave >= TOTAL_WAVES) {
        this.endRun(this.harbored >= WIN_HARBOR);
      } else {
        this.waveTimer += dt;
        if (this.waveTimer > 2.5) {
          this.waveTimer = 0;
          this.startWave(this.wave + 1);
        }
      }
    }
  }

  runSpawns(dt) {
    this.spawnClock += dt;
    while (this.spawnQueue.length > 0 && this.spawnQueue[0].at <= this.spawnClock) {
      const spawn = this.spawnQueue.shift();
      if (spawn.type === 'junk') this.spawnJunk(spawn.lane);
      else if (spawn.type === 'corsair') this.spawnCorsair();
      else if (spawn.type === 'raft') this.spawnRaft();
    }
  }

  updateShips(dt) {
    for (const junk of this.junks) {
      if (!junk.alive) continue;
      const force = this.grid.sampleForce(junk.x, junk.y);
      const avoid = this.reefAvoidance(junk.x, junk.y);
      force.x += avoid.x;
      force.y += avoid.y;
      this.applyWhirlpool(junk, dt);
      junk.update(dt, force, this.time);
      this.pushOutOfReefs(junk);
      junk.x = Math.max(8, Math.min(1272, junk.x));
      junk.y = Math.max(8, Math.min(712, junk.y));
    }
    for (const corsair of this.corsairs) {
      if (!corsair.alive) continue;
      const force = this.grid.sampleForce(corsair.x, corsair.y);
      const avoid = this.reefAvoidance(corsair.x, corsair.y);
      force.x += avoid.x * 0.7;
      force.y += avoid.y * 0.7;
      this.applyWhirlpool(corsair, dt);
      corsair.update(dt, force, this.junks, this.time);
      this.pushOutOfReefs(corsair);
      corsair.x = Math.max(8, Math.min(1272, corsair.x));
      corsair.y = Math.max(8, Math.min(712, corsair.y));
      if (corsair.raftTimer <= 0) {
        corsair.raftTimer = 7 + this.rng.range(0, 3);
        this.spawnRaft(corsair.x, corsair.y + 24);
      }
    }
    for (const raft of this.rafts) {
      if (!raft.alive) continue;
      const force = this.grid.sampleForce(raft.x, raft.y);
      raft.update(dt, force);
      raft.x = Math.max(8, Math.min(1272, raft.x));
      raft.y = Math.max(8, Math.min(712, raft.y));
    }
    this.corsairs = this.corsairs.filter((c) => c.state !== CORSAIR_STATES.SUNK);
    this.rafts = this.rafts.filter((r) => r.alive);
  }

  applyWhirlpool(ship, dt) {
    for (const pool of this.whirlpools) {
      const dx = pool.x - ship.x;
      const dy = pool.y - ship.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < pool.pullRadius) {
        const pull = (1 - dist / pool.pullRadius) * 15;
        ship.vx += (dx / dist) * pull * dt;
        ship.vy += (dy / dist) * pull * dt;
        // Swirl around the center.
        ship.vx += (-dy / dist) * pull * 0.55 * dt;
        ship.vy += (dx / dist) * pull * 0.55 * dt;
      }
    }
  }

  pushOutOfReefs(ship) {
    for (const rock of this.reefs) {
      const dx = ship.x - rock.x;
      const dy = ship.y - rock.y;
      const dist = Math.hypot(dx, dy);
      const min = rock.radius + ship.radius - 2;
      if (dist < min && dist > 0.01) {
        const nx = dx / dist;
        const ny = dy / dist;
        ship.x = rock.x + nx * min;
        ship.y = rock.y + ny * min;
        // Slide: remove only the velocity into the rock, keep the tangential
        // part, so a ship glides around the rock instead of pinning to it.
        const into = ship.vx * nx + ship.vy * ny;
        if (into < 0) {
          ship.vx -= into * nx;
          ship.vy -= into * ny;
        }
      }
    }
  }

  /** Reef avoidance: a repulsion from nearby rocks, so ships steer around them. */
  reefAvoidance(x, y) {
    let ax = 0;
    let ay = 0;
    for (const rock of this.reefs) {
      const dx = x - rock.x;
      const dy = y - rock.y;
      const dist = Math.hypot(dx, dy);
      const range = rock.radius + 62;
      if (dist < range && dist > 0.01) {
        const push = (1 - dist / range) * 70;
        ax += (dx / dist) * push;
        ay += (dy / dist) * push;
      }
    }
    return { x: ax, y: ay };
  }

  resolveCollisions() {
    // Junks reaching a harbor.
    for (const junk of this.junks) {
      if (!junk.alive) continue;
      for (const harbor of this.harbors) {
        const d = Math.hypot(junk.x - harbor.x, junk.y - harbor.y);
        if (d < harbor.radius) {
          junk.state = JUNK_STATES.HARBORED;
          this.harbored += 1;
          this.waveHarbor += 1;
          this.score += 100;
          harbor.glow = 1;
          this.particles.push(new ParticleSeal(junk.x, junk.y - 24, '+100', 'seal'));
          this.particles.push(new ParticleSeal(junk.x, junk.y, '', 'splash', 0.8));
          this.onHarbor(junk);
          break;
        }
      }
    }
    // Whirlpool kills: the state flips here; the single counting pass below
    // records each shattered junk exactly once, whatever sank it.
    for (const ship of [...this.junks, ...this.corsairs]) {
      if (!ship.alive) continue;
      for (const pool of this.whirlpools) {
        const d = Math.hypot(ship.x - pool.x, ship.y - pool.y);
        if (d < pool.killRadius) {
          if (ship instanceof MerchantJunk) {
            ship.state = JUNK_STATES.SHATTERED;
            ship.shatterReason = 'whirl';
          } else {
            ship.sinkShip();
            this.corsairsSunk += 1;
            this.score += 50;
          }
          break;
        }
      }
    }
    // Burning junks finding a mist ring.
    for (const junk of this.junks) {
      if (!junk.burning) continue;
      for (const ring of this.mistRings) {
        const d = Math.hypot(junk.x - ring.x, junk.y - ring.y);
        if (d < ring.radius) {
          junk.extinguish();
          this.score += 20;
          this.particles.push(new ParticleSeal(junk.x, junk.y - 24, 'MIST SAVED', 'seal'));
          break;
        }
      }
    }
    // Burning out: the state already flipped in MerchantJunk.update; the
    // counting pass below records it once.
    // Corsair rams and broadsides.
    for (const corsair of this.corsairs) {
      if (!corsair.alive) continue;
      let nearest = null;
      let nearestDist = Infinity;
      for (const junk of this.junks) {
        if (!junk.alive) continue;
        const d = Math.hypot(junk.x - corsair.x, junk.y - corsair.y);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = junk;
        }
      }
      if (nearest && nearestDist < corsair.radius + nearest.radius + 2) {
        nearest.ignite();
        const dx = nearest.x - corsair.x;
        const dy = nearest.y - corsair.y;
        const dist = Math.hypot(dx, dy) || 1;
        nearest.vx += (dx / dist) * 60;
        nearest.vy += (dy / dist) * 60;
      }
      if (nearest && nearestDist < 80 && corsair.broadsideReady) {
        corsair.resetBroadside();
        nearest.ignite();
        this.broadsideFlash = { x: corsair.x, y: corsair.y, tx: nearest.x, ty: nearest.y, age: 0 };
        this.particles.push(new ParticleSeal(nearest.x, nearest.y - 24, 'BROADSIDE', 'seal'));
      }
    }
    // Fire-rafts: ignite junks, detonate corsairs.
    for (const raft of this.rafts) {
      if (!raft.alive) continue;
      for (const junk of this.junks) {
        if (!junk.alive) continue;
        const d = Math.hypot(junk.x - raft.x, junk.y - raft.y);
        if (d < raft.radius + junk.radius) {
          junk.ignite();
          raft.detonate();
          this.particles.push(new ParticleSeal(raft.x, raft.y - 18, 'FIRE', 'seal'));
          break;
        }
      }
      if (!raft.alive) continue;
      for (const corsair of this.corsairs) {
        if (!corsair.alive) continue;
        const d = Math.hypot(corsair.x - raft.x, corsair.y - raft.y);
        if (d < raft.radius + corsair.radius + 4) {
          raft.detonate();
          this.raftsDeflected += 1;
          this.detonateChain(corsair);
          break;
        }
      }
    }
    // One counting pass: every newly shattered junk is recorded exactly once.
    for (const junk of this.junks) {
      if (junk.state === JUNK_STATES.SHATTERED && !junk.counted) {
        junk.counted = true;
        this.shattered += 1;
        this.waveShatter += 1;
        const reason = junk.shatterReason === 'burn' ? 'BURNED OUT' : 'LOST TO THE WHIRL';
        this.particles.push(new ParticleSeal(junk.x, junk.y - 20, reason, 'seal'));
        this.onShatter(junk);
      }
    }
    this.junks = this.junks.filter((j) => j.state !== JUNK_STATES.SHATTERED);
    // Win and loss.
    if (this.harbored >= WIN_HARBOR) this.endRun(true);
    else if (this.shattered >= LOSE_SHATTER) this.endRun(false);
  }

  /** A chain detonation: the corsair sinks, nearby corsairs catch the blast. */
  detonateChain(first) {
    const blast = { x: first.x, y: first.y };
    let chain = 0;
    const hit = [first];
    first.sinkShip();
    chain += 1;
    for (const other of this.corsairs) {
      if (!other.alive || hit.includes(other)) continue;
      const d = Math.hypot(other.x - blast.x, other.y - blast.y);
      if (d < 135) {
        other.sinkShip();
        hit.push(other);
        chain += 1;
      }
    }
    this.corsairsSunk += chain;
    this.chain = chain;
    this.chainTimer = 2.5;
    const points = 150 * chain + (chain >= 2 ? 100 * (chain - 1) : 0);
    this.score += points;
    for (let i = 0; i < 10; i += 1) {
      this.particles.push(new ParticleSeal(
        blast.x + this.rng.range(-24, 24), blast.y + this.rng.range(-24, 24), '', 'spark', 0.7,
      ));
    }
    for (let i = 0; i < 4; i += 1) {
      this.particles.push(new ParticleSeal(
        blast.x + this.rng.range(-18, 18), blast.y + this.rng.range(-18, 18), '', 'smoke', 1.6,
      ));
    }
    const text = chain >= 2 ? `+${chain} COMBO  +${points}` : `+${points}`;
    this.particles.push(new ParticleSeal(blast.x, blast.y - 30, text, 'seal', 1.8));
    this.onChain(chain);
  }

  updateParticles(dt) {
    for (const p of this.particles) p.update(dt);
    this.particles = this.particles.filter((p) => p.alive);
    for (const harbor of this.harbors) harbor.glow = Math.max(0, harbor.glow - dt * 0.8);
  }

  endRun(won) {
    if (this.phase !== 'playing') return;
    this.phase = won ? 'victory' : 'defeat';
    if (this.waveStats.length === 0 || this.waveStats[this.waveStats.length - 1].wave !== this.wave) {
      this.waveStats.push({ wave: this.wave, harbored: this.waveHarbor, shattered: this.waveShatter });
    }
  }

  // Hooks the renderer and audio layer attach to; the sim never plays sound.
  onHarbor(junk) { void junk; }
  onShatter(junk) { void junk; }
  onChain(chain) { void chain; }
}

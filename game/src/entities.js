// The things on the sea: merchant junks, corsair raiders, fire-rafts, reef
// rocks, whirlpools, torii harbors, and the seal particles that pop over them.
// Entities hold state and movement; the renderer draws them, the simulation
// resolves their collisions.

export const JUNK_STATES = { SAILING: 'sailing', BURNING: 'burning', HARBORED: 'harbored', SHATTERED: 'shattered' };
export const CORSAIR_STATES = { HUNTING: 'hunting', SINKING: 'sinking', SUNK: 'sunk' };

/** A merchant junk sailing for a torii harbor. */
export class MerchantJunk {
  constructor(id, x, y, harbor, rng) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.heading = 0;
    this.radius = 16;
    this.harbor = harbor;
    this.state = JUNK_STATES.SAILING;
    this.burn = 0;
    this.counted = false;
    this.shatterReason = '';
    this.burnTime = 8;
    this.baseSpeed = 34;
    this.sailHue = rng() > 0.5 ? 0 : 1;
    this.wake = 0;
    this.bob = rng() * Math.PI * 2;
  }

  get alive() {
    return this.state === JUNK_STATES.SAILING || this.state === JUNK_STATES.BURNING;
  }

  get burning() {
    return this.state === JUNK_STATES.BURNING;
  }

  /** Steer toward the harbor, pushed by the wind field, slowed by nothing. */
  update(dt, force, time) {
    if (!this.alive) return;
    this.bob += dt * 2;
    const dx = this.harbor.x - this.x;
    const dy = this.harbor.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    const seekX = dx / dist;
    const seekY = dy / dist;
    // Wind matters most: ribbons bend the course, the seek only trims it.
    const ax = seekX * 32 + force.x * 1.9;
    const ay = seekY * 32 + force.y * 1.9;
    this.vx += ax * dt;
    this.vy += ay * dt;
    const speed = Math.hypot(this.vx, this.vy);
    const maxSpeed = this.baseSpeed + 40;
    if (speed > maxSpeed) {
      this.vx = (this.vx / speed) * maxSpeed;
      this.vy = (this.vy / speed) * maxSpeed;
    }
    // Drag keeps the motion smooth and stops runaway drift.
    this.vx *= 1 - 0.55 * dt;
    this.vy *= 1 - 0.55 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const targetHeading = Math.atan2(this.vy, this.vx);
    let diff = targetHeading - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
    this.wake += dt;
    if (this.burning) {
      this.burn -= dt;
      if (this.burn <= 0) {
        this.state = JUNK_STATES.SHATTERED;
        this.shatterReason = 'burn';
      }
    }
  }

  ignite() {
    if (this.state === JUNK_STATES.SAILING) {
      this.state = JUNK_STATES.BURNING;
      this.burn = this.burnTime;
    }
  }

  extinguish() {
    if (this.state === JUNK_STATES.BURNING) {
      this.state = JUNK_STATES.SAILING;
      this.burn = 0;
    }
  }
}

/** A corsair fire-boat hunting the nearest junk. */
export class CorsairRaider {
  constructor(id, x, y, rng) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.heading = Math.PI;
    this.radius = 15;
    this.state = CORSAIR_STATES.HUNTING;
    this.sink = 0;
    this.baseSpeed = 34;
    this.broadside = 2 + rng() * 2;
    this.raftTimer = 5 + rng() * 3;
    this.bob = rng() * Math.PI * 2;
  }

  get alive() {
    return this.state === CORSAIR_STATES.HUNTING;
  }

  update(dt, force, junks, time) {
    if (this.state === CORSAIR_STATES.SINKING) {
      this.sink += dt;
      this.y += 12 * dt;
      if (this.sink > 1.1) this.state = CORSAIR_STATES.SUNK;
      return;
    }
    if (!this.alive) return;
    this.bob += dt * 2.4;
    this.broadside -= dt;
    this.raftTimer -= dt;
    let target = null;
    let best = Infinity;
    for (const junk of junks) {
      if (!junk.alive) continue;
      const d = Math.hypot(junk.x - this.x, junk.y - this.y);
      if (d < best) {
        best = d;
        target = junk;
      }
    }
    let ax = force.x * 0.7;
    let ay = force.y * 0.7;
    if (target) {
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const dist = Math.hypot(dx, dy) || 1;
      ax += (dx / dist) * 34;
      ay += (dy / dist) * 34;
    }
    this.vx += ax * dt;
    this.vy += ay * dt;
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > this.baseSpeed) {
      this.vx = (this.vx / speed) * this.baseSpeed;
      this.vy = (this.vy / speed) * this.baseSpeed;
    }
    this.vx *= 1 - 0.5 * dt;
    this.vy *= 1 - 0.5 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const targetHeading = Math.atan2(this.vy, this.vx);
    let diff = targetHeading - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
  }

  /** Broadside is ready when a junk is close and the cooldown has run out. */
  get broadsideReady() {
    return this.broadside <= 0;
  }

  resetBroadside() {
    this.broadside = 3.2;
  }

  sinkShip() {
    if (this.state === CORSAIR_STATES.HUNTING) {
      this.state = CORSAIR_STATES.SINKING;
      this.sink = 0;
    }
  }
}

/** A drifting burning raft. It sets junks alight and detonates corsairs. */
export class FireRaft {
  constructor(id, x, y, rng) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.vx = (rng() - 0.5) * 10;
    this.vy = (rng() - 0.5) * 10;
    this.radius = 12;
    this.state = 'drifting';
    this.flicker = rng() * Math.PI * 2;
  }

  get alive() {
    return this.state === 'drifting';
  }

  update(dt, force) {
    if (!this.alive) return;
    this.flicker += dt * 6;
    this.vx += force.x * 1.4 * dt;
    this.vy += force.y * 1.4 * dt;
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > 26) {
      this.vx = (this.vx / speed) * 26;
      this.vy = (this.vy / speed) * 26;
    }
    this.vx *= 1 - 0.4 * dt;
    this.vy *= 1 - 0.4 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  detonate() {
    this.state = 'exploded';
  }
}

/** A reef rock that blocks and deflects ships. */
export class ReefRock {
  constructor(x, y, radius) {
    this.x = x;
    this.y = y;
    this.radius = radius;
  }
}

/** A whirlpool that drags ships toward its center and shatters them. */
export class ReefWhirlpool {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.pullRadius = 60;
    this.killRadius = 16;
    this.swirl = 0;
  }

  update(dt) {
    this.swirl += dt * 1.8;
  }
}

/** A vermilion torii harbor where junks are safe. */
export class ToriiHarbor {
  constructor(id, x, y, name) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.name = name;
    this.radius = 58;
    this.glow = 0;
  }
}

/** A cool mist ring that extinguishes burning sails. */
export class MistRing {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 62;
    this.drift = 0;
  }

  update(dt) {
    this.drift += dt;
  }
}

/** A floating particle: a seal popup, foam, splash ring, smoke or spark. */
export class ParticleSeal {
  constructor(x, y, text, kind, life = 1.4) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = kind === 'seal' ? -26 : 0;
    this.text = text;
    this.kind = kind;
    this.life = life;
    this.age = 0;
  }

  get alive() {
    return this.age < this.life;
  }

  update(dt) {
    this.age += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.kind === 'smoke') this.y -= 18 * dt;
  }
}

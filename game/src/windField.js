// Wind ribbons, the gust grid, and the monsoonal tide cycle.
// The player carves WindRibbons on the sea; the GustGrid turns them plus the
// tide into a force vector at any point, which the simulation applies to ships
// and fire-rafts.

export const TIDE_NAMES = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];
export const TIDE_ANGLES = [0, -Math.PI / 4, -Math.PI / 2, -3 * Math.PI / 4, Math.PI, 3 * Math.PI / 4, Math.PI / 2, Math.PI / 4];

/** Tide direction per wave (wave 1..6). Wave 5 is the storm squall. */
export const WAVE_TIDES = ['E', 'NE', 'E', 'SE', 'NW', 'E'];
export const WAVE_TIDE_STRENGTH = [12, 14, 14, 16, 24, 16];

/** A carved wind ribbon: a polyline the wind follows, fading over its life. */
export class WindRibbon {
  constructor(points, strength = 95) {
    this.points = points.map((p) => ({ x: p.x, y: p.y }));
    this.strength = strength;
    this.age = 0;
    this.maxAge = 9;
    this.length = 0;
    for (let i = 1; i < this.points.length; i += 1) {
      this.length += Math.hypot(this.points[i].x - this.points[i - 1].x, this.points[i].y - this.points[i - 1].y);
    }
  }

  get alive() {
    return this.age < this.maxAge;
  }

  get fade() {
    return Math.max(0, 1 - this.age / this.maxAge);
  }

  /** Closest point on the polyline to (x, y), with the local tangent. */
  closest(x, y) {
    let bestDist = Infinity;
    let bestTx = 1;
    let bestTy = 0;
    for (let i = 1; i < this.points.length; i += 1) {
      const a = this.points[i - 1];
      const b = this.points[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      let t = ((x - a.x) * dx + (y - a.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      const dist = Math.hypot(x - px, y - py);
      if (dist < bestDist) {
        bestDist = dist;
        const len = Math.hypot(dx, dy) || 1;
        bestTx = dx / len;
        bestTy = dy / len;
      }
    }
    return { dist: bestDist, tx: bestTx, ty: bestTy };
  }
}

/** Tide for one wave: a named compass direction, an angle, and a strength. */
export class TideCycle {
  static tideForWave(wave) {
    const name = WAVE_TIDES[Math.max(0, Math.min(WAVE_TIDES.length - 1, wave - 1))];
    const idx = TIDE_NAMES.indexOf(name);
    return {
      name,
      angle: TIDE_ANGLES[idx],
      strength: WAVE_TIDE_STRENGTH[Math.max(0, Math.min(WAVE_TIDE_STRENGTH.length - 1, wave - 1))],
      squall: wave === 5,
    };
  }

  static nextTideName(wave) {
    if (wave >= WAVE_TIDES.length) return 'E';
    return WAVE_TIDES[wave];
  }
}

/** The wind field: ribbons plus tide, sampled as a force vector. */
export class GustGrid {
  constructor() {
    this.ribbons = [];
    this.tide = TideCycle.tideForWave(1);
    this.tideAngle = this.tide.angle;
    this.tideStrength = this.tide.strength;
  }

  setTide(tide) {
    this.tide = tide;
    this.tideAngle = tide.angle;
    this.tideStrength = tide.strength;
  }

  addRibbon(ribbon) {
    this.ribbons.push(ribbon);
    if (this.ribbons.length > 14) this.ribbons.shift();
  }

  update(dt) {
    for (const ribbon of this.ribbons) ribbon.age += dt;
    this.ribbons = this.ribbons.filter((r) => r.alive);
  }

  /** Wind force (px/s^2) at a point: tide drift plus every nearby ribbon. */
  sampleForce(x, y) {
    let fx = Math.cos(this.tideAngle) * this.tideStrength;
    let fy = Math.sin(this.tideAngle) * this.tideStrength;
    for (const ribbon of this.ribbons) {
      const hit = ribbon.closest(x, y);
      const reach = 78;
      if (hit.dist < reach) {
        const fall = 1 - hit.dist / reach;
        const push = ribbon.strength * fall * ribbon.fade;
        fx += hit.tx * push;
        fy += hit.ty * push;
      }
    }
    return { x: fx, y: fy };
  }

  /** Strongest ribbon push at a point, for the whoosh volume. */
  gustAt(x, y) {
    let best = 0;
    for (const ribbon of this.ribbons) {
      const hit = ribbon.closest(x, y);
      if (hit.dist < 78) best = Math.max(best, ribbon.strength * (1 - hit.dist / 78) * ribbon.fade);
    }
    return best;
  }
}

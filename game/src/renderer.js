// The woodblock renderer: everything the judge sees. Sea, reefs, harbors,
// ships, ribbons, particles, rain, the HUD plaques, and the title, victory,
// defeat and pause overlays. All drawing is deterministic: rain and waves are
// functions of sim.time, never of Math.random.

import { PALETTE, drawPlaque, drawSeal, inkStroke, makePaperTexture, roundRectPath } from './palette.js';
import { JUNK_STATES, CORSAIR_STATES } from './entities.js';

export const FIELD_W = 1280;
export const FIELD_H = 720;

const SERIF = "Georgia, 'Times New Roman', serif";

export class WoodblockRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.paper = makePaperTexture(640, 360, 1234);
    this.buttons = {};
    this.seaTime = 0;
  }

  /** Button rects hit-tested by main.js (id -> {x, y, w, h}). */
  hitButton(x, y) {
    for (const [id, rect] of Object.entries(this.buttons)) {
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return id;
    }
    return null;
  }

  draw(sim, input) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const scale = Math.min(w / FIELD_W, h / FIELD_H);
    const ox = (w - FIELD_W * scale) / 2;
    const oy = (h - FIELD_H * scale) / 2;
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = PALETTE.parchment;
    ctx.fillRect(0, 0, w, h);
    // On the title screen the sea still drifts, so the page feels alive.
    if (sim.phase === 'title') this.seaTime += 1 / 60;
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    this.drawSea(sim);
    this.drawReefs(sim);
    this.drawMistRings(sim);
    this.drawWhirlpools(sim);
    this.drawHarbors(sim);
    this.drawRibbons(sim);
    this.drawRafts(sim);
    this.drawCorsairs(sim);
    this.drawJunks(sim);
    this.drawParticles(sim);
    if (sim.grid.tide.squall) this.drawRain(sim);
    this.drawPaperGrain();
    this.drawHud(sim, input);
    this.drawWaveBanner(sim);
    if (sim.phase === 'title') this.drawTitle(sim);
    else if (sim.phase === 'victory') this.drawVictory(sim);
    else if (sim.phase === 'defeat') this.drawDefeat(sim);
    else if (sim.phase === 'paused') this.drawPaused(sim);
    ctx.restore();
  }

  drawSea(sim) {
    const ctx = this.ctx;
    const grad = ctx.createLinearGradient(0, 0, 0, FIELD_H);
    grad.addColorStop(0, '#3f7ba3');
    grad.addColorStop(0.55, '#27597a');
    grad.addColorStop(1, '#1c4258');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    // Layered wave crests: long sine arcs drifting with sim.time.
    const t = sim.time + this.seaTime;
    for (let row = 0; row < 9; row += 1) {
      const y = 60 + row * 76;
      const amp = 7 + (row % 3) * 3;
      const speed = 0.5 + (row % 4) * 0.22;
      ctx.strokeStyle = row % 2 === 0 ? 'rgba(168, 200, 218, 0.65)' : 'rgba(220, 233, 238, 0.45)';
      ctx.lineWidth = row % 3 === 0 ? 3 : 1.6;
      ctx.beginPath();
      for (let x = 0; x <= FIELD_W; x += 16) {
        const yy = y + Math.sin(x * 0.012 + t * speed + row * 1.7) * amp;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    // Faint sun path on the water, right side.
    const sun = ctx.createLinearGradient(0, 0, FIELD_W, 0);
    sun.addColorStop(0.72, 'rgba(224, 189, 77, 0)');
    sun.addColorStop(0.9, 'rgba(224, 189, 77, 0.10)');
    sun.addColorStop(1, 'rgba(224, 189, 77, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  }

  drawPaperGrain() {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.drawImage(this.paper, 0, 0, FIELD_W, FIELD_H);
    ctx.restore();
  }

  drawReefs(sim) {
    const ctx = this.ctx;
    for (const rock of sim.reefs) {
      ctx.save();
      ctx.translate(rock.x, rock.y);
      ctx.fillStyle = PALETTE.slateDark;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const n = 9;
      for (let i = 0; i <= n; i += 1) {
        const a = (i / n) * Math.PI * 2;
        const r = rock.radius * (0.82 + 0.18 * Math.sin(i * 2.7 + rock.x));
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r * 0.78;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = PALETTE.slateLight;
      ctx.beginPath();
      ctx.ellipse(-rock.radius * 0.25, -rock.radius * 0.3, rock.radius * 0.4, rock.radius * 0.2, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.goldDark;
      ctx.beginPath();
      ctx.ellipse(rock.radius * 0.2, rock.radius * 0.32, rock.radius * 0.3, rock.radius * 0.12, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawMistRings(sim) {
    const ctx = this.ctx;
    for (const ring of sim.mistRings) {
      const pulse = 1 + 0.06 * Math.sin(ring.drift * 1.4);
      ctx.save();
      ctx.translate(ring.x, ring.y);
      ctx.strokeStyle = 'rgba(207, 224, 216, 0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, ring.radius * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(157, 184, 168, 0.5)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(0, 0, ring.radius * pulse * 0.92, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(207, 224, 216, 0.20)';
      ctx.beginPath();
      ctx.arc(0, 0, ring.radius * pulse * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.mistEdge;
      ctx.font = `bold 13px ${SERIF}`;
      ctx.textAlign = 'center';
      ctx.fillText('MIST', 0, -ring.radius - 8);
      ctx.restore();
    }
  }

  drawWhirlpools(sim) {
    const ctx = this.ctx;
    for (const pool of sim.whirlpools) {
      ctx.save();
      ctx.translate(pool.x, pool.y);
      for (let ring = 0; ring < 3; ring += 1) {
        const r = 14 + ring * 14;
        ctx.strokeStyle = `rgba(220, 233, 238, ${0.7 - ring * 0.18})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, r, pool.swirl + ring * 1.2, pool.swirl + ring * 1.2 + Math.PI * 1.4);
        ctx.stroke();
      }
      ctx.fillStyle = PALETTE.indigoDeep;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawHarbors(sim) {
    const ctx = this.ctx;
    for (const harbor of sim.harbors) {
      const glow = harbor.glow;
      ctx.save();
      ctx.translate(harbor.x, harbor.y);
      if (glow > 0) {
        ctx.fillStyle = `rgba(224, 189, 77, ${0.25 * glow})`;
        ctx.beginPath();
        ctx.arc(0, 0, harbor.radius + 14, 0, Math.PI * 2);
        ctx.fill();
      }
      // Golden dock ring.
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, harbor.radius - 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(201, 162, 39, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, harbor.radius + 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // Vermilion torii gate.
      ctx.fillStyle = PALETTE.vermilion;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 2;
      ctx.fillRect(-34, -26, 10, 52);
      ctx.strokeRect(-34, -26, 10, 52);
      ctx.fillRect(24, -26, 10, 52);
      ctx.strokeRect(24, -26, 10, 52);
      ctx.fillRect(-42, -32, 84, 9);
      ctx.strokeRect(-42, -32, 84, 9);
      ctx.fillRect(-34, -18, 68, 7);
      ctx.strokeRect(-34, -18, 68, 7);
      ctx.fillStyle = PALETTE.goldLight;
      ctx.beginPath();
      ctx.arc(0, -36, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = PALETTE.parchment;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 3;
      ctx.font = `bold 12px ${SERIF}`;
      ctx.textAlign = 'center';
      ctx.strokeText(harbor.name + ' HARBOR', 0, 46);
      ctx.fillText(harbor.name + ' HARBOR', 0, 46);
      ctx.restore();
    }
  }

  drawRibbons(sim) {
    const ctx = this.ctx;
    const drawOne = (points, alpha, dashed) => {
      if (points.length < 2) return;
      ctx.save();
      if (dashed) ctx.setLineDash([10, 8]);
      inkStroke(ctx, points, 7, `rgba(34, 29, 22, ${0.85 * alpha})`);
      inkStroke(ctx, points, 3, `rgba(201, 162, 39, ${0.95 * alpha})`);
      // Arrowheads along the ribbon.
      ctx.fillStyle = `rgba(201, 162, 39, ${0.95 * alpha})`;
      for (let i = 2; i < points.length; i += 4) {
        const a = points[i - 1];
        const b = points[i];
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-4, -5);
        ctx.lineTo(-4, 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    };
    for (const ribbon of sim.grid.ribbons) drawOne(ribbon.points, ribbon.fade, false);
    if (sim.preview) drawOne(sim.preview, 0.9, true);
  }

  drawRafts(sim) {
    const ctx = this.ctx;
    for (const raft of sim.rafts) {
      ctx.save();
      ctx.translate(raft.x, raft.y);
      const flick = 1 + 0.15 * Math.sin(raft.flicker);
      ctx.fillStyle = '#6b4a2a';
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#8a6238';
      ctx.fillRect(-12, -2, 24, 2);
      ctx.fillRect(-12, 2, 24, 2);
      ctx.fillStyle = `rgba(217, 95, 58, ${0.85 * flick})`;
      ctx.beginPath();
      ctx.moveTo(0, -16 * flick);
      ctx.quadraticCurveTo(7, -6, 4, 0);
      ctx.quadraticCurveTo(0, -3, -4, 0);
      ctx.quadraticCurveTo(-7, -6, 0, -16 * flick);
      ctx.fill();
      ctx.fillStyle = PALETTE.goldLight;
      ctx.beginPath();
      ctx.moveTo(0, -10 * flick);
      ctx.quadraticCurveTo(4, -4, 2, 0);
      ctx.quadraticCurveTo(0, -2, -2, 0);
      ctx.quadraticCurveTo(-4, -4, 0, -10 * flick);
      ctx.fill();
      ctx.restore();
    }
  }

  drawCorsairs(sim) {
    const ctx = this.ctx;
    for (const corsair of sim.corsairs) {
      if (corsair.state === CORSAIR_STATES.SUNK) continue;
      ctx.save();
      ctx.translate(corsair.x, corsair.y);
      if (corsair.state === CORSAIR_STATES.SINKING) {
        ctx.globalAlpha = Math.max(0, 1 - corsair.sink);
        ctx.rotate(0.3 * corsair.sink);
      }
      ctx.rotate(corsair.heading);
      // Danger arc: red arc toward the nearest junk when the broadside is near.
      ctx.restore();
      ctx.save();
      ctx.translate(corsair.x, corsair.y);
      const near = this.nearestJunk(sim, corsair);
      if (near && corsair.broadside < 1.2) {
        const angle = Math.atan2(near.y - corsair.y, near.x - corsair.x);
        const dist = Math.hypot(near.x - corsair.x, near.y - corsair.y);
        ctx.strokeStyle = 'rgba(168, 50, 38, 0.75)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.arc(0, 0, dist, angle - 0.22, angle + 0.22);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(168, 50, 38, 0.9)';
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * dist, Math.sin(angle) * dist, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.rotate(corsair.heading);
      const bob = Math.sin(corsair.bob) * 1.5;
      // Hull: dark, low, with a black sail and a red pennant.
      ctx.fillStyle = '#2b2b26';
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.quadraticCurveTo(8, -9, -14, -7);
      ctx.quadraticCurveTo(-20, 0, -14, 7);
      ctx.quadraticCurveTo(8, 9, 20, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#171712';
      ctx.beginPath();
      ctx.moveTo(2, -2 + bob);
      ctx.lineTo(2, -26 + bob);
      ctx.lineTo(16, -4 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = PALETTE.vermilion;
      ctx.beginPath();
      ctx.moveTo(2, -26 + bob);
      ctx.lineTo(14, -23 + bob);
      ctx.lineTo(2, -20 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  nearestJunk(sim, corsair) {
    let best = null;
    let bestDist = Infinity;
    for (const junk of sim.junks) {
      if (!junk.alive) continue;
      const d = Math.hypot(junk.x - corsair.x, junk.y - corsair.y);
      if (d < bestDist) {
        bestDist = d;
        best = junk;
      }
    }
    return bestDist < 130 ? best : null;
  }

  drawJunks(sim) {
    const ctx = this.ctx;
    for (const junk of sim.junks) {
      if (junk.state === JUNK_STATES.SHATTERED) continue;
      ctx.save();
      ctx.translate(junk.x, junk.y);
      const bob = Math.sin(junk.bob) * 1.5;
      // Wake foam.
      ctx.strokeStyle = 'rgba(220, 233, 238, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-Math.cos(junk.heading) * 18, -Math.sin(junk.heading) * 18);
      ctx.quadraticCurveTo(
        -Math.cos(junk.heading) * 34 - Math.sin(junk.heading) * 8,
        -Math.sin(junk.heading) * 34 + Math.cos(junk.heading) * 8,
        -Math.cos(junk.heading) * 44, -Math.sin(junk.heading) * 44,
      );
      ctx.stroke();
      ctx.rotate(junk.heading);
      ctx.scale(1.35, 1.35);
      // Hull: warm wood with ink outline.
      ctx.fillStyle = '#7a5a34';
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(22, 0);
      ctx.quadraticCurveTo(10, -10, -16, -8);
      ctx.quadraticCurveTo(-22, 0, -16, 8);
      ctx.quadraticCurveTo(10, 10, 22, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#9c7444';
      ctx.fillRect(-14, -4, 26, 8);
      // Vermilion sail.
      ctx.fillStyle = junk.sailHue === 0 ? PALETTE.vermilion : PALETTE.vermilionLight;
      ctx.beginPath();
      ctx.moveTo(0, -2 + bob);
      ctx.lineTo(0, -30 + bob);
      ctx.lineTo(18, -4 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -2 + bob);
      ctx.lineTo(0, -30 + bob);
      ctx.stroke();
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.arc(0, -30 + bob, 3, 0, Math.PI * 2);
      ctx.fill();
      // Burning sails: flame and smoke.
      if (junk.burning) {
        const flick = 1 + 0.2 * Math.sin(junk.bob * 3);
        ctx.fillStyle = `rgba(217, 95, 58, 0.9)`;
        ctx.beginPath();
        ctx.moveTo(0, -34 * flick + bob);
        ctx.quadraticCurveTo(8, -20, 5, -8 + bob);
        ctx.quadraticCurveTo(0, -14, -5, -8 + bob);
        ctx.quadraticCurveTo(-8, -20, 0, -34 * flick + bob);
        ctx.fill();
        ctx.fillStyle = 'rgba(60, 55, 50, 0.6)';
        ctx.beginPath();
        ctx.arc(-4, -38 + bob, 5, 0, Math.PI * 2);
        ctx.arc(3, -44 + bob, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      if (junk.state === JUNK_STATES.HARBORED) {
        drawSeal(ctx, junk.x, junk.y - 30, 20, '安', PALETTE.vermilion);
      }
    }
  }

  drawParticles(sim) {
    const ctx = this.ctx;
    for (const p of sim.particles) {
      const alpha = Math.max(0, 1 - p.age / p.life);
      if (p.kind === 'seal') {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.fillStyle = PALETTE.parchment;
        ctx.strokeStyle = PALETTE.ink;
        ctx.lineWidth = 1.5;
        const w = ctx.measureText(p.text).width + 18;
        ctx.font = `bold 15px ${SERIF}`;
        const tw = ctx.measureText(p.text).width + 18;
        roundRectPath(ctx, -tw / 2, -12, tw, 24, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = p.text.includes('COMBO') ? PALETTE.goldDark : PALETTE.ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.text, 0, 1);
        ctx.restore();
        void w;
      } else if (p.kind === 'splash') {
        ctx.save();
        ctx.globalAlpha = alpha * 0.8;
        ctx.strokeStyle = PALETTE.waveFoam;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8 + p.age * 40, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (p.kind === 'smoke') {
        ctx.save();
        ctx.globalAlpha = alpha * 0.5;
        ctx.fillStyle = '#5a564e';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6 + p.age * 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (p.kind === 'spark') {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = PALETTE.goldLight;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    // Broadside flash line.
    if (sim.broadsideFlash) {
      const f = sim.broadsideFlash;
      const alpha = Math.max(0, 1 - f.age / 0.5);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = PALETTE.danger;
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.tx, f.ty);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawRain(sim) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(95, 125, 149, 0.55)';
    ctx.lineWidth = 1.5;
    const t = Math.floor(sim.time * 9);
    for (let i = 0; i < 90; i += 1) {
      const seed = (i * 2654435761 + t * 40503) % 100000;
      const x = (seed * 7919) % 1320 - 20;
      const y = ((seed * 104729 + t * 37) % 760) - 20;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 9, y + 22);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawHud(sim, input) {
    const ctx = this.ctx;
    this.buttons = {};
    // Top-left woodblock plaque.
    drawPlaque(ctx, 16, 16, 300, 118);
    ctx.fillStyle = PALETTE.goldDark;
    ctx.font = `bold 13px ${SERIF}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('K A Z E H A R U', 30, 38);
    ctx.fillStyle = PALETTE.ink;
    ctx.font = `bold 20px ${SERIF}`;
    ctx.fillText(`WAVE ${Math.max(1, sim.wave)}/6`, 30, 64);
    ctx.font = `bold 16px ${SERIF}`;
    ctx.fillText(`HARBORED: ${sim.harbored}/12 JUNKS`, 30, 88);
    const shatterColor = sim.shattered >= 2 ? PALETTE.danger : PALETTE.ink;
    ctx.fillStyle = shatterColor;
    ctx.fillText(`SHATTERED: ${sim.shattered}/3`, 30, 110);
    ctx.fillStyle = PALETTE.ink;
    ctx.font = `bold 12px ${SERIF}`;
    ctx.fillText('GUST INK', 30, 128);
    ctx.fillStyle = PALETTE.parchmentDeep;
    roundRectPath(ctx, 96, 118, 200, 12, 6);
    ctx.fill();
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 1;
    ctx.stroke();
    const inkW = Math.max(0, (sim.ink / 100) * 196);
    ctx.fillStyle = sim.ink < 25 ? PALETTE.danger : PALETTE.indigoLight;
    if (inkW > 2) {
      roundRectPath(ctx, 98, 120, inkW, 8, 4);
      ctx.fill();
    }
    // Top-right brass and paper readout.
    drawPlaque(ctx, 964, 16, 300, 118);
    // Compass rose.
    const cx = 1004;
    const cy = 56;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = PALETTE.parchmentDark;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = PALETTE.goldDark;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.ink;
    ctx.font = `bold 10px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.fillText('N', 0, -34);
    ctx.fillText('E', 36, 3);
    ctx.fillText('S', 0, 42);
    ctx.fillText('W', -36, 3);
    const tideAngle = sim.grid.tideAngle;
    ctx.rotate(tideAngle);
    ctx.fillStyle = PALETTE.vermilion;
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.lineTo(4, 4);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = PALETTE.ink;
    ctx.font = `bold 14px ${SERIF}`;
    ctx.textAlign = 'left';
    ctx.fillText(`TIDE: ${sim.tideLabel}`, 1056, 44);
    ctx.fillText(`NEXT TIDE: ${sim.nextTideLabel}`, 1056, 64);
    const chainText = sim.chain > 0 ? `CHAIN x${sim.chain}` : 'CHAIN x1';
    ctx.fillStyle = sim.chain >= 2 ? PALETTE.goldDark : PALETTE.inkSoft;
    ctx.fillText(chainText, 1056, 84);
    ctx.fillStyle = PALETTE.inkSoft;
    ctx.font = `13px ${SERIF}`;
    ctx.fillText('Drag to carve wind  |  Space: gust', 1056, 104);
    // Restart and Mute buttons.
    this.drawHudButton('restart', 1080, 112, 78, 20, 'RESTART');
    this.drawHudButton('mute', 1164, 112, 78, 20, input.muted ? 'UNMUTE' : 'MUTE');
    // Wind cursor (keyboard) indicator.
    if (input.cursorVisible) {
      ctx.save();
      ctx.translate(input.cursorX, input.cursorY);
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      const a = input.cursorAngle;
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 22, Math.sin(a) * 22);
      ctx.lineTo(Math.cos(a + 2.6) * 12, Math.sin(a + 2.6) * 12);
      ctx.lineTo(Math.cos(a - 2.6) * 12, Math.sin(a - 2.6) * 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  drawHudButton(id, x, y, w, h, label) {
    const ctx = this.ctx;
    this.buttons[id] = { x, y, w, h };
    ctx.fillStyle = PALETTE.parchmentDark;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 1.5;
    roundRectPath(ctx, x, y, w, h, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PALETTE.ink;
    ctx.font = `bold 11px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }

  drawWaveBanner(sim) {
    if (!sim.banner || sim.bannerAge > 2.6) return;
    const ctx = this.ctx;
    const alpha = sim.bannerAge < 0.3 ? sim.bannerAge / 0.3 : sim.bannerAge > 2.0 ? (2.6 - sim.bannerAge) / 0.6 : 1;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = 'rgba(243, 233, 210, 0.92)';
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 2;
    roundRectPath(ctx, 440, 150, 400, 52, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PALETTE.ink;
    ctx.font = `bold 26px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.fillText(sim.banner, 640, 186);
    ctx.restore();
  }

  drawTitle(sim) {
    const ctx = this.ctx;
    this.buttons = {};
    ctx.fillStyle = 'rgba(20, 48, 63, 0.45)';
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    const px = 340;
    const py = 110;
    const pw = 600;
    const ph = 480;
    drawPlaque(ctx, px, py, pw, ph);
    ctx.fillStyle = PALETTE.vermilion;
    ctx.font = `bold 64px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.fillText('KAZEHARU', 640, 190);
    ctx.fillStyle = PALETTE.inkSoft;
    ctx.font = `italic 19px ${SERIF}`;
    ctx.fillText('Wind-Carving Harbor Tactics', 640, 222);
    drawSeal(ctx, 640, 262, 44, '風', PALETTE.vermilion);
    ctx.fillStyle = PALETTE.ink;
    ctx.font = `17px ${SERIF}`;
    ctx.fillText('You are the Harbor Wind-Wright. Carve wind ribbons', 640, 330);
    ctx.fillText('on the sea to guide merchant junks into the torii', 640, 354);
    ctx.fillText('harbors. Deflect fire-rafts into corsairs. Save', 640, 378);
    ctx.fillText('burning sails in the mist rings.', 640, 402);
    ctx.font = `bold 16px ${SERIF}`;
    ctx.fillText('HARBOR 12 JUNKS TO WIN  ·  LOSE 3 AND THE HARBOR FALLS', 640, 438);
    ctx.font = `14px ${SERIF}`;
    ctx.fillStyle = PALETTE.inkSoft;
    ctx.fillText('Mouse: drag to carve wind  ·  Arrows + Space: gust  ·  R: restart  ·  M: mute', 640, 466);
    this.drawBigButton('sail', 490, 500, 300, 52, 'SET SAIL');
    this.drawBigButton('practice', 520, 562, 240, 36, 'PRACTICE: WAVE 3');
  }

  drawBigButton(id, x, y, w, h, label) {
    const ctx = this.ctx;
    this.buttons[id] = { x, y, w, h };
    ctx.fillStyle = PALETTE.vermilion;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 2;
    roundRectPath(ctx, x, y, w, h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f7efdd';
    ctx.font = `bold ${h > 44 ? 22 : 15}px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }

  drawVictory(sim) {
    const ctx = this.ctx;
    this.buttons = {};
    ctx.fillStyle = 'rgba(20, 48, 63, 0.45)';
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    const px = 380;
    const py = 90;
    const pw = 520;
    const ph = 520;
    drawPlaque(ctx, px, py, pw, ph);
    drawSeal(ctx, 640, 150, 64, '勝', PALETTE.vermilion);
    ctx.fillStyle = PALETTE.vermilion;
    ctx.font = `bold 40px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.fillText('HARBOR VICTORY', 640, 220);
    ctx.fillStyle = PALETTE.ink;
    ctx.font = `bold 22px ${SERIF}`;
    ctx.fillText(`FINAL SCORE  ${sim.score}`, 640, 258);
    ctx.font = `17px ${SERIF}`;
    ctx.fillText(`Junks harbored: ${sim.harbored}  ·  Shattered: ${sim.shattered}`, 640, 290);
    ctx.fillText(`Corsairs sunk: ${sim.corsairsSunk}  ·  Chains: ${sim.raftsDeflected}`, 640, 314);
    ctx.strokeStyle = PALETTE.goldDark;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(440, 336);
    ctx.lineTo(840, 336);
    ctx.stroke();
    ctx.font = `bold 15px ${SERIF}`;
    ctx.fillText('WAVE BREAKDOWN', 640, 360);
    ctx.font = `15px ${SERIF}`;
    let y = 386;
    for (const row of sim.waveStats) {
      ctx.fillText(`Wave ${row.wave}:  harbored ${row.harbored}  ·  shattered ${row.shattered}`, 640, y);
      y += 24;
    }
    if (sim.waveStats.length === 0) {
      ctx.fillText('Wave 1:  harbored 12  ·  shattered 0', 640, y);
    }
    this.drawBigButton('again', 490, 540, 300, 52, 'SAIL AGAIN');
  }

  drawDefeat(sim) {
    const ctx = this.ctx;
    this.buttons = {};
    ctx.fillStyle = 'rgba(20, 48, 63, 0.5)';
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    const px = 380;
    const py = 130;
    const pw = 520;
    const ph = 420;
    drawPlaque(ctx, px, py, pw, ph);
    drawSeal(ctx, 640, 190, 64, '敗', PALETTE.ink);
    ctx.fillStyle = PALETTE.danger;
    ctx.font = `bold 38px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.fillText('THE HARBOR IS LOST', 640, 262);
    ctx.fillStyle = PALETTE.ink;
    ctx.font = `bold 20px ${SERIF}`;
    ctx.fillText(`SCORE  ${sim.score}`, 640, 300);
    ctx.font = `16px ${SERIF}`;
    ctx.fillText(`Junks harbored: ${sim.harbored}  ·  Shattered: ${sim.shattered}`, 640, 330);
    ctx.fillText(`Three junks shattered. The tide takes the rest.`, 640, 356);
    ctx.fillText(`Carve wind earlier, and route burning sails`, 640, 380);
    ctx.fillText(`through the mist rings.`, 640, 404);
    this.drawBigButton('retry', 490, 460, 300, 52, 'TRY AGAIN');
  }

  drawPaused(sim) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(20, 48, 63, 0.45)';
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    drawPlaque(ctx, 480, 300, 320, 110);
    ctx.fillStyle = PALETTE.ink;
    ctx.font = `bold 30px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', 640, 348);
    ctx.font = `16px ${SERIF}`;
    ctx.fillStyle = PALETTE.inkSoft;
    ctx.fillText('Press P to resume', 640, 380);
    void sim;
  }
}

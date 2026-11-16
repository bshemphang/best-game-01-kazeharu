// Woodblock color tokens, washi paper texture, and ink stroke helpers.
// Every color in KAZEHARU comes from this palette: warm parchment, deep indigo
// sea, vermilion sails and torii, slate-gold reef, sumi-e ink. No neon anywhere.

export const PALETTE = {
  parchment: '#f3e9d2',
  parchmentDark: '#e6d5b3',
  parchmentDeep: '#d9c49a',
  paperEdge: '#c9b184',
  ink: '#221d16',
  inkSoft: '#4a4238',
  indigo: '#27597a',
  indigoDeep: '#1c4258',
  indigoLight: '#3f7ba3',
  waveCrest: '#a8c8da',
  waveFoam: '#dce9ee',
  vermilion: '#c8401f',
  vermilionLight: '#d95f3a',
  vermilionDeep: '#9c2f16',
  gold: '#c9a227',
  goldLight: '#e0bd4d',
  goldDark: '#8a6d1a',
  slate: '#5a6b7a',
  slateDark: '#3d4a56',
  slateLight: '#7d8f9d',
  mist: '#cfe0d8',
  mistEdge: '#9db8a8',
  danger: '#a83226',
  rain: '#5f7d95',
};

/** Deterministic PRNG (mulberry32) for texture generation. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A washi paper texture: warm parchment with short plant fibers, faint speckles
 * and a soft vignette. Drawn once at load from a fixed seed, so every run and
 * every screenshot shows the same paper.
 */
export function makePaperTexture(width, height, seed) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const rng = mulberry32(seed);
  ctx.fillStyle = PALETTE.parchment;
  ctx.fillRect(0, 0, width, height);
  // Long faint fibers.
  for (let i = 0; i < 900; i += 1) {
    const x = rng() * width;
    const y = rng() * height;
    const angle = rng() * Math.PI;
    const len = 6 + rng() * 22;
    const alpha = 0.03 + rng() * 0.05;
    ctx.strokeStyle = rng() > 0.5 ? `rgba(120, 95, 55, ${alpha})` : `rgba(255, 250, 235, ${alpha})`;
    ctx.lineWidth = 0.8 + rng() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }
  // Speckles.
  for (let i = 0; i < 1400; i += 1) {
    const x = rng() * width;
    const y = rng() * height;
    const alpha = 0.02 + rng() * 0.05;
    ctx.fillStyle = rng() > 0.5 ? `rgba(90, 70, 40, ${alpha})` : `rgba(255, 252, 240, ${alpha})`;
    ctx.fillRect(x, y, 1 + rng() * 2, 1 + rng() * 2);
  }
  // Soft vignette.
  const grad = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.45,
    width / 2, height / 2, Math.max(width, height) * 0.75,
  );
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  grad.addColorStop(1, 'rgba(80, 60, 30, 0.10)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

/** A sumi-e ink stroke along points: a dark line with a lighter edge and taper. */
export function inkStroke(ctx, points, width, color) {
  if (points.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 250, 235, 0.25)';
  ctx.lineWidth = Math.max(1, width * 0.25);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y - width * 0.18);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y - width * 0.18);
  ctx.stroke();
  ctx.restore();
}

/** A hanko red seal stamp: a vermilion square with a white glyph inside. */
export function drawSeal(ctx, x, y, size, glyph, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 1.5;
  const r = size * 0.14;
  ctx.beginPath();
  ctx.roundRect(-size / 2, -size / 2, size, size, r);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f7efdd';
  ctx.font = `bold ${Math.round(size * 0.62)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, 0, size * 0.04);
  ctx.restore();
}

/** Rounded rectangle path helper. */
export function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Woodblock plaque: parchment panel with a double ink border and gold corners. */
export function drawPlaque(ctx, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(243, 233, 210, 0.94)';
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 2;
  roundRectPath(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = PALETTE.goldDark;
  ctx.lineWidth = 1;
  roundRectPath(ctx, x + 4, y + 4, w - 8, h - 8, 4);
  ctx.stroke();
  ctx.fillStyle = PALETTE.gold;
  const c = 5;
  ctx.fillRect(x - 1, y - 1, c, c);
  ctx.fillRect(x + w - c + 1, y - 1, c, c);
  ctx.fillRect(x - 1, y + h - c + 1, c, c);
  ctx.fillRect(x + w - c + 1, y + h - c + 1, c, c);
  ctx.restore();
}

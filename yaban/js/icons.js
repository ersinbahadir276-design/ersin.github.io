// Eşya ikonları kodla çizilir (canvas) — dış görsel kullanılmaz.

const cache = {};

function circ(g, x, y, r, fill, stroke, lw = 3) {
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}
function poly(g, pts, fill, stroke, lw = 3) {
  g.beginPath(); g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}
function line(g, x1, y1, x2, y2, w, col) {
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2);
  g.strokeStyle = col; g.lineWidth = w; g.stroke();
}
function log(g, x1, y1, x2, y2, r) {
  line(g, x1, y1, x2, y2, r * 2, '#6b3f1c');
  line(g, x1, y1, x2, y2, r * 2 - 6, '#9a6433');
  line(g, x1 + 2, y1 - 3, x2 + 2, y2 - 3, 2, '#b67c44');
  circ(g, x2, y2, r, '#dcb27a', '#6b3f1c');
  circ(g, x2, y2, r * 0.45, null, '#a8763f', 2);
}
function flame(g, x, y, s = 1) {
  poly(g, [x - 10 * s, y, x - 12 * s, y - 14 * s, x - 4 * s, y - 26 * s, x, y - 16 * s, x + 6 * s, y - 30 * s, x + 12 * s, y - 12 * s, x + 10 * s, y], '#ff7a1a');
  poly(g, [x - 5 * s, y, x - 6 * s, y - 10 * s, x, y - 18 * s, x + 6 * s, y - 9 * s, x + 5 * s, y], '#ffd23a');
}
function meat(g, c1, c2, c3) {
  line(g, 14, 50, 28, 37, 7, '#efe6d2');
  circ(g, 11, 51, 5, '#efe6d2'); circ(g, 15, 55, 5, '#efe6d2');
  g.beginPath(); g.ellipse(38, 27, 19, 14, -0.65, 0, Math.PI * 2);
  g.fillStyle = c1; g.fill(); g.strokeStyle = c2; g.lineWidth = 3; g.stroke();
  g.beginPath(); g.ellipse(34, 23, 8, 5, -0.65, 0, Math.PI * 2); g.fillStyle = c3; g.fill();
}

const DRAW = {
  wood(g) { log(g, 8, 46, 44, 24, 9); log(g, 14, 56, 52, 38, 8); },
  stone(g) {
    poly(g, [10, 42, 17, 22, 33, 13, 50, 19, 57, 38, 46, 53, 22, 55], '#9a9a9a', '#555');
    poly(g, [19, 26, 32, 17, 45, 22, 34, 31], '#c2c2c2');
  },
  fiber(g) {
    const cs = ['#7fb24a', '#5d8f33', '#94c45a'];
    for (let i = 0; i < 7; i++) {
      g.strokeStyle = cs[i % 3]; g.lineWidth = 3; g.beginPath(); g.moveTo(32, 58);
      g.quadraticCurveTo(18 + i * 5, 30, 8 + i * 8, 8 + (i % 3) * 5); g.stroke();
    }
    line(g, 22, 44, 42, 44, 6, '#c9a86a');
  },
  berry(g) {
    line(g, 32, 20, 32, 8, 3, '#4a7a2a');
    poly(g, [32, 12, 48, 5, 43, 17], '#5d9a3a');
    [[24, 31], [39, 31], [31, 43], [19, 45], [43, 45]].forEach(([x, y]) => {
      circ(g, x, y, 9, '#c8263d', '#7a1424'); circ(g, x - 3, y - 3, 2.6, '#ff9aa8');
    });
  },
  meat(g) { meat(g, '#d4505c', '#8a2a32', '#f2a6ae'); },
  cooked(g) { meat(g, '#8a4a22', '#4e250e', '#b8743e'); },
  hide(g) { poly(g, [12, 14, 26, 21, 38, 11, 52, 17, 47, 31, 55, 45, 40, 50, 32, 57, 22, 48, 9, 46, 16, 32], '#c89a64', '#7a5a34'); circ(g, 30, 33, 8, '#b78a55'); },
  essence(g) {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 28);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.25, '#d6a6ff'); gr.addColorStop(0.6, '#7a2fd0'); gr.addColorStop(1, 'rgba(60,10,120,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    poly(g, [32, 12, 44, 32, 32, 52, 20, 32], null, '#f0dcff', 2);
  },
  bandage(g) {
    circ(g, 30, 34, 20, '#f2f2f2', '#a8a8a8');
    circ(g, 30, 34, 7, '#d6d6d6', '#a8a8a8', 2);
    poly(g, [44, 22, 58, 18, 60, 30, 46, 34], '#f2f2f2', '#a8a8a8', 2);
    poly(g, [48, 8, 54, 8, 54, 12, 58, 12, 58, 18, 54, 18, 54, 22, 48, 22, 48, 18, 44, 18, 44, 12, 48, 12], '#e0303a');
  },
  axe(g) { line(g, 14, 56, 44, 14, 6, '#8b5a2b'); poly(g, [36, 7, 56, 12, 59, 31, 43, 25], '#a7a7a7', '#555'); line(g, 38, 20, 44, 24, 5, '#c9a86a'); },
  pick(g) {
    line(g, 18, 57, 40, 16, 6, '#8b5a2b');
    g.beginPath(); g.moveTo(12, 24); g.quadraticCurveTo(38, 2, 60, 28);
    g.strokeStyle = '#555'; g.lineWidth = 9; g.stroke();
    g.strokeStyle = '#a7a7a7'; g.lineWidth = 5; g.stroke();
  },
  spear(g) { line(g, 8, 58, 46, 18, 5, '#8b5a2b'); poly(g, [41, 16, 57, 5, 50, 23], '#b5b5b5', '#555', 2); line(g, 39, 22, 45, 27, 5, '#c9a86a'); },
  torch(g) { line(g, 22, 60, 38, 28, 7, '#8b5a2b'); line(g, 34, 34, 40, 24, 9, '#3a2a1c'); flame(g, 40, 26, 0.85); },
  sword(g) {
    line(g, 11, 53, 21, 43, 6, '#2a1d2e'); line(g, 14, 36, 28, 50, 6, '#6a4a8e');
    line(g, 21, 43, 55, 9, 9, '#7a46c8'); line(g, 24, 40, 52, 12, 3, '#e0c8ff');
  },
  armor(g) {
    poly(g, [18, 10, 26, 15, 38, 15, 46, 10, 55, 22, 48, 29, 47, 55, 17, 55, 16, 29, 9, 22], '#b07a48', '#6a4424');
    line(g, 32, 17, 32, 54, 2, '#6a4424'); line(g, 18, 40, 46, 40, 3, '#8a5a30');
  },
  campfire(g) {
    circ(g, 32, 50, 22, 'rgba(0,0,0,0.0)');
    [[10, 54], [20, 58], [32, 60], [44, 58], [54, 54]].forEach(([x, y]) => circ(g, x, y, 5, '#8d8d8d', '#555', 2));
    line(g, 12, 52, 50, 40, 7, '#6b3f1c'); line(g, 14, 40, 52, 52, 7, '#8b5a2b');
    flame(g, 32, 46, 1.1);
  },
  wall(g) {
    for (let i = 0; i < 5; i++) {
      const x = 12 + i * 10;
      poly(g, [x - 4, 58, x - 4, 16, x, 7, x + 4, 16, x + 4, 58], i % 2 ? '#9a6433' : '#8b5a2b', '#5a3a1a', 2);
    }
    line(g, 6, 27, 58, 27, 4, '#5a3a1a'); line(g, 6, 46, 58, 46, 4, '#5a3a1a');
  },
  spikes(g) {
    poly(g, [5, 50, 59, 50, 59, 58, 5, 58], '#6b4421');
    for (let i = 0; i < 5; i++) { const x = 8 + i * 10.5; poly(g, [x, 50, x + 4.5, 16 + (i % 2) * 9, x + 9, 50], '#d6b27a', '#7a5a34', 2); }
  },
  bed(g) {
    poly(g, [8, 20, 56, 20, 56, 52, 8, 52], '#2f6b4f', '#1d4532');
    poly(g, [10, 22, 22, 22, 22, 50, 10, 50], '#ece5d3');
    poly(g, [34, 20, 56, 20, 56, 52, 34, 52], '#3d8a65', '#1d4532');
  },
};

export function itemIcon(id) {
  if (cache[id]) return cache[id];
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round';
  (DRAW[id] || ((gg) => circ(gg, 32, 32, 18, '#888')))(g);
  cache[id] = c.toDataURL();
  return cache[id];
}

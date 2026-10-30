'use strict';
/* 宝贝练习本 — worksheet generator for ages 1–6.
 * Every worksheet type is a generator: gen(rand, age) -> { tip, body, answers?, answerSvg? }.
 * Pages are plain HTML at A4 size; printing uses the browser's own print / Save-as-PDF. */

// ---------- helpers ----------
function makeRand(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const shuffle = (r, arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const sample = (r, arr, n) => shuffle(r, arr).slice(0, n);
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const emo = (e, mm, cls = '') => `<span class="emo ${cls}" style="font-size:${mm}mm">${e}</span>`;

const PICS = ['🍎', '🍌', '🍓', '🍊', '🍇', '🍉', '🍒', '🥕', '🐶', '🐱', '🐰', '🐻', '🐼', '🐸', '🐥', '🐟', '🦋', '🐞', '🚗', '🚌', '⭐', '🌸', '🎈', '⚽'];
const ANIMALS = ['🐶', '🐱', '🐰', '🐻', '🐼', '🐸', '🐥', '🐟', '🦋', '🐞', '🐘', '🦒', '🐢', '🦆', '🐌', '🦀'];

const CATS = {
  math:  { name: '数学启蒙', color: '#ff8a3d' },
  lang:  { name: '语言识字', color: '#e2557a' },
  motor: { name: '精细动作', color: '#2fa37a' },
  logic: { name: '认知逻辑', color: '#4a7bd8' },
};

// ---------- SVG pieces ----------
function shapeSvg(kind, cx, cy, s, stroke = '#222', sw = 1.4, fill = 'none') {
  const p = `fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"`;
  switch (kind) {
    case 'circle': return `<circle cx="${cx}" cy="${cy}" r="${s}" ${p}/>`;
    case 'square': return `<rect x="${cx - s}" y="${cy - s}" width="${2 * s}" height="${2 * s}" rx="${s * .08}" ${p}/>`;
    case 'triangle': return `<polygon points="${cx},${cy - s} ${cx + s * 1.1},${cy + s * .85} ${cx - s * 1.1},${cy + s * .85}" ${p}/>`;
    case 'diamond': return `<polygon points="${cx},${cy - s} ${cx + s * .8},${cy} ${cx},${cy + s} ${cx - s * .8},${cy}" ${p}/>`;
    case 'star': {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? s * .45 : s;
        pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
      }
      return `<polygon points="${pts.join(' ')}" ${p}/>`;
    }
    case 'heart': {
      const k = s / 10;
      return `<path d="M ${cx} ${cy + 9 * k} C ${cx - 14 * k} ${cy - 1 * k}, ${cx - 9 * k} ${cy - 12 * k}, ${cx} ${cy - 5 * k} C ${cx + 9 * k} ${cy - 12 * k}, ${cx + 14 * k} ${cy - 1 * k}, ${cx} ${cy + 9 * k} Z" ${p}/>`;
    }
  }
  return '';
}
const SHAPE_NAMES = { circle: '圆形', square: '正方形', triangle: '三角形', diamond: '菱形', star: '星星', heart: '爱心' };
const COLORS = [['红色', '#e53935'], ['黄色', '#fdd835'], ['蓝色', '#1e88e5'], ['绿色', '#43a047'], ['橙色', '#fb8c00'], ['紫色', '#8e24aa']];

function clockSvg(h, m, size, hands = true) {
  const c = 50, out = [];
  out.push(`<svg viewBox="0 0 100 100" width="${size}mm" height="${size}mm">`);
  out.push(`<circle cx="50" cy="50" r="46" fill="#fff" stroke="#333" stroke-width="2.5"/>`);
  for (let i = 0; i < 60; i++) {
    const a = i * Math.PI / 30, r1 = i % 5 ? 42 : 39;
    out.push(`<line x1="${c + r1 * Math.sin(a)}" y1="${c - r1 * Math.cos(a)}" x2="${c + 44 * Math.sin(a)}" y2="${c - 44 * Math.cos(a)}" stroke="#555" stroke-width="${i % 5 ? .6 : 1.6}"/>`);
  }
  for (let i = 1; i <= 12; i++) {
    const a = i * Math.PI / 6;
    out.push(`<text x="${c + 32 * Math.sin(a)}" y="${c - 32 * Math.cos(a) + 3.6}" font-size="10" text-anchor="middle" font-family="Andika, Arial, sans-serif" fill="#222">${i}</text>`);
  }
  if (hands) {
    const ha = ((h % 12) + m / 60) * Math.PI / 6, ma = m * Math.PI / 30;
    out.push(`<line x1="50" y1="50" x2="${c + 20 * Math.sin(ha)}" y2="${c - 20 * Math.cos(ha)}" stroke="#e53935" stroke-width="4" stroke-linecap="round"/>`);
    out.push(`<line x1="50" y1="50" x2="${c + 33 * Math.sin(ma)}" y2="${c - 33 * Math.cos(ma)}" stroke="#1e88e5" stroke-width="2.6" stroke-linecap="round"/>`);
  }
  out.push(`<circle cx="50" cy="50" r="2.6" fill="#333"/></svg>`);
  return out.join('');
}

// path samples for tracing lines; u in [0,1]
function tracePoints(type, x0, x1, yc, A) {
  const pts = [], N = 260, W = x1 - x0;
  if (type === 'loops') {
    const T = Math.PI * 2 * 6, b = A * .9, a = W / T;
    for (let i = 0; i <= N; i++) { const t = T * i / N; pts.push([x0 + a * t - b * Math.sin(t), yc + b * Math.cos(t) - b * .2]); }
    return pts;
  }
  for (let i = 0; i <= N; i++) {
    const u = i / N; let y = yc;
    if (type === 'wave') y = yc + A * Math.sin(u * Math.PI * 2 * 3);
    if (type === 'zigzag') { const f = (u * 5) % 1; y = yc + A * (f < .5 ? 4 * f - 1 : 3 - 4 * f); }
    if (type === 'bumps') y = yc + A * .5 - A * Math.abs(Math.sin(u * Math.PI * 4));
    if (type === 'square') y = yc + (Math.sin(u * Math.PI * 2 * 4 + .001) >= 0 ? -A : A);
    pts.push([x0 + W * u, y]);
  }
  return pts;
}

// perfect maze via recursive backtracker; returns walls + solution
function makeMaze(r, w, h) {
  const cell = range(0, w * h - 1).map(() => ({ n: true, s: true, e: true, w: true, seen: false }));
  const at = (x, y) => cell[y * w + x];
  const stack = [[0, 0]]; at(0, 0).seen = true;
  const dirs = [[0, -1, 'n', 's'], [0, 1, 's', 'n'], [1, 0, 'e', 'w'], [-1, 0, 'w', 'e']];
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const opts = dirs.filter(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < w && ny < h && !at(nx, ny).seen; });
    if (!opts.length) { stack.pop(); continue; }
    const [dx, dy, a, b] = pick(r, opts);
    at(x, y)[a] = false; at(x + dx, y + dy)[b] = false; at(x + dx, y + dy).seen = true;
    stack.push([x + dx, y + dy]);
  }
  // BFS for solution
  const prev = new Map(), q = [[0, 0]], key = (x, y) => y * w + x; prev.set(0, null);
  while (q.length) {
    const [x, y] = q.shift();
    if (x === w - 1 && y === h - 1) break;
    for (const [dx, dy, a] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (!at(x, y)[a] && !prev.has(key(nx, ny))) { prev.set(key(nx, ny), [x, y]); q.push([nx, ny]); }
    }
  }
  const path = []; let cur = [w - 1, h - 1];
  while (cur) { path.unshift(cur); cur = prev.get(key(cur[0], cur[1])); }
  return { w, h, at, path };
}
function mazeSvg(m, cs, showPath, start, goal) {
  const pad = cs, W = m.w * cs + pad * 2, H = m.h * cs + pad * 2, L = [];
  L.push(`<svg viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm" stroke-linecap="round">`);
  if (showPath) L.push(`<polyline fill="none" stroke="#e53935" stroke-width="${cs * .25}" points="${m.path.map(([x, y]) => `${pad + (x + .5) * cs},${pad + (y + .5) * cs}`).join(' ')}"/>`);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const c = m.at(x, y), X = pad + x * cs, Y = pad + y * cs;
    const ln = (a, b, c2, d) => L.push(`<line x1="${a}" y1="${b}" x2="${c2}" y2="${d}" stroke="#333" stroke-width="${Math.max(.8, cs * .09)}"/>`);
    if (c.n && !(x === 0 && y === 0)) ln(X, Y, X + cs, Y);
    if (c.w) ln(X, Y, X, Y + cs);
    if (y === m.h - 1 && !(x === m.w - 1)) ln(X, Y + cs, X + cs, Y + cs);
    if (x === m.w - 1 && !(y === m.h - 1)) ln(X + cs, Y, X + cs, Y + cs);
    if (y === m.h - 1 && x === m.w - 1) ln(X, Y + cs, X + cs, Y + cs);
  }
  if (start) {
    const fs = Math.min(pad * .9, 14);
    L.push(`<text x="${pad + cs / 2}" y="${pad - 1}" font-size="${fs}" text-anchor="middle" class="emo">${start}</text>`);
    L.push(`<text x="${pad + m.w * cs + pad / 2}" y="${pad + (m.h - .5) * cs + fs * .35}" font-size="${fs}" text-anchor="middle" class="emo">${goal}</text>`);
  }
  L.push('</svg>');
  return L.join('');
}

// ---------- content data ----------
const HANZI_4 = '一yī 二èr 三sān 人rén 口kǒu 大dà 小xiǎo 上shàng 下xià 日rì 月yuè 山shān 水shuǐ 火huǒ 木mù 田tián 中zhōng 天tiān 十shí 土tǔ';
const HANZI_5 = '手shǒu 目mù 耳ěr 牛niú 羊yáng 马mǎ 鸟niǎo 云yún 雨yǔ 花huā 草cǎo 我wǒ 你nǐ 他tā 爸bà 妈mā 子zǐ 女nǚ 门mén 不bù 来lái 去qù 出chū 入rù 左zuǒ 右yòu 白bái 石shí 禾hé 竹zhú 米mǐ 飞fēi 车chē 王wáng 文wén 心xīn 个gè 头tóu 足zú 力lì';
const parseHanzi = s => s.split(' ').map(t => [t[0], t.slice(1)]);
const PINYIN = [
  { name: '单韵母', items: ['a', 'o', 'e', 'i', 'u', 'ü'], age: 5 },
  { name: '声母（一）', items: ['b', 'p', 'm', 'f', 'd', 't', 'n', 'l'], age: 5 },
  { name: '声母（二）', items: ['g', 'k', 'h', 'j', 'q', 'x'], age: 5 },
  { name: '声母（三）', items: ['zh', 'ch', 'sh', 'r', 'z', 'c', 's', 'y', 'w'], age: 6 },
  { name: '复韵母', items: ['ai', 'ei', 'ui', 'ao', 'ou', 'iu', 'ie', 'üe', 'er'], age: 6 },
  { name: '鼻韵母', items: ['an', 'en', 'in', 'un', 'ün', 'ang', 'eng', 'ing', 'ong'], age: 6 },
];

// ---------- worksheet generators ----------
const GENS = [
  {
    id: 'coloring', name: '形状涂色', cat: 'motor', ages: [1, 3],
    gen(r, age) {
      const n = age <= 2 ? 4 : 6;
      const shapes = sample(r, Object.keys(SHAPE_NAMES), n), cols = sample(r, COLORS, n);
      const cells = shapes.map((s, i) => `<div style="text-align:center">
        <svg viewBox="0 0 80 80" width="${age <= 2 ? 72 : 52}mm" height="${age <= 2 ? 72 : 52}mm">${shapeSvg(s, 40, 41, 32, '#222', 2.2)}</svg>
        <div style="font-size:5.5mm"><span style="display:inline-block;width:5mm;height:5mm;border-radius:50%;background:${cols[i][1]};vertical-align:-0.6mm"></span> ${SHAPE_NAMES[s]} · ${cols[i][0]}</div></div>`);
      return { tip: '按照下面的提示，给每个图形涂上颜色。', body: `<div class="${age <= 2 ? 'grid2' : 'grid2'}" style="grid-template-columns:repeat(${age <= 2 ? 2 : 3},1fr)">${cells.join('')}</div>` };
    },
  },
  {
    id: 'traceLines', name: '描线练习', cat: 'motor', ages: [1, 4],
    gen(r, age) {
      const pool = ['straight', 'bumps'].concat(age >= 2 ? ['wave', 'zigzag'] : [], age >= 3 ? ['square'] : [], age >= 4 ? ['loops'] : []);
      const rows = age <= 2 ? 4 : 6, H = age <= 2 ? 52 : 36, A = age <= 2 ? 12 : 8;
      const out = [];
      for (let i = 0; i < rows; i++) {
        const type = i < pool.length ? pool[(i + int(r, 0, pool.length - 1)) % pool.length] : pick(r, pool);
        const pts = tracePoints(type, 24, 156, H / 2, A).map(p => p.map(v => v.toFixed(2)).join(',')).join(' ');
        const [a, b] = sample(r, PICS, 2);
        out.push(`<svg viewBox="0 0 180 ${H}" width="180mm" height="${H}mm">
          <polyline points="${pts}" fill="none" stroke="#9a9a9a" stroke-width="${age <= 2 ? 1.6 : 1.1}" stroke-dasharray="1.6 2.2" stroke-linecap="round"/>
          <circle cx="24" cy="${tracePoints(type, 24, 156, H / 2, A)[0][1]}" r="1.8" fill="#2fa37a"/>
          <text x="10" y="${H / 2 + 4.5}" font-size="13" text-anchor="middle" class="emo">${a}</text>
          <text x="170" y="${H / 2 + 4.5}" font-size="13" text-anchor="middle" class="emo">${b}</text></svg>`);
      }
      return { tip: '从绿点出发，沿着虚线画到另一边。', body: out.join('') };
    },
  },
  {
    id: 'matching', name: '连一连', cat: 'logic', ages: [1, 4],
    gen(r, age) {
      const n = age <= 2 ? 3 : age === 3 ? 4 : 5;
      const left = sample(r, ANIMALS, n), right = shuffle(r, left), shadow = age >= 3, size = n <= 3 ? 26 : 19;
      const col = (arr, dotRight, sh) => `<div>${arr.map(e => `<div class="mitem">${dotRight ? '' : '<span class="dot"></span>'}${emo(e, size, sh ? 'shadow' : '')}${dotRight ? '<span class="dot"></span>' : ''}</div>`).join('')}</div>`;
      return {
        tip: shadow ? '找一找每个小动物的影子，用线连起来。' : '把一样的小动物用线连起来。',
        body: `<div class="mcol" style="padding:0 12mm">${col(left, true, false)}${col(right, false, shadow)}</div>`,
        answers: left.map(e => `${e}→第${right.indexOf(e) + 1}个`),
      };
    },
  },
  {
    id: 'sizeCompare', name: '比大小', cat: 'logic', ages: [1, 3],
    gen(r, age) {
      const rows = 5, k = age <= 2 ? 2 : 3, ans = [], out = [];
      for (let i = 0; i < rows; i++) {
        const e = pick(r, PICS), big = i % 2 === 0;
        const sizes = shuffle(r, k === 2 ? [12, 26] : [10, 17, 26]);
        const target = big ? Math.max(...sizes) : Math.min(...sizes);
        ans.push(`${i + 1}.${big ? '大' : '小'}:第${sizes.indexOf(target) + 1}个`);
        out.push(`<div class="rowline"><span style="font-size:6mm;width:30mm">圈出最${big ? '<b>大</b>' : '<b>小</b>'}的</span>
          <span class="items" style="flex:1;justify-content:space-around;align-items:flex-end">${sizes.map(s => emo(e, s)).join('')}</span></div>`);
      }
      return { tip: '看一看，按要求圈一圈。', body: out.join(''), answers: ans };
    },
  },
  {
    id: 'patterns', name: '找规律', cat: 'logic', ages: [2, 6],
    gen(r, age) {
      const units = age <= 3 ? ['AB'] : age === 4 ? ['AB', 'AAB', 'ABB'] : ['ABC', 'AABB', 'ABB', 'ABCC', 'AAB'];
      const rows = age <= 3 ? 4 : 6, sz = age <= 3 ? 14 : 11, out = [], ans = [];
      for (let i = 0; i < rows; i++) {
        const u = pick(r, units), sym = sample(r, PICS, 3), map = c => sym['ABC'.indexOf(c)];
        const len = Math.max(age <= 3 ? 5 : 7, u.length * 2 + 1);
        const seq = range(0, len - 1).map(j => map(u[j % u.length]));
        const correct = seq[len - 1];
        const opts = shuffle(r, Array.from(new Set([correct, ...sym, pick(r, PICS)])).slice(0, 3));
        ans.push(`${i + 1}.${correct}`);
        out.push(`<div class="rowline"><span class="items">${seq.slice(0, -1).map(e => emo(e, sz)).join('')}<span class="box" style="width:${sz + 2}mm;height:${sz + 2}mm;border-style:dashed"></span></span>
          <span style="white-space:nowrap;border-left:.3mm solid #ddd;padding-left:3mm">${opts.map(e => emo(e, sz * .8)).join(' ')}</span></div>`);
      }
      return { tip: '下一个应该是谁？在右边圈出来，或画在方框里。', body: out.join(''), answers: ans };
    },
  },
  {
    id: 'count', name: '数一数', cat: 'math', ages: [2, 6],
    gen(r, age) {
      const max = age <= 3 ? 5 : age <= 5 ? 10 : 15, rows = age <= 3 ? 4 : 6, sz = age <= 3 ? 14 : 9;
      const out = [], ans = [];
      for (let i = 0; i < rows; i++) {
        const n = int(r, 1, max), e = pick(r, PICS);
        const items = range(1, n).map(j => `<span class="${j % 5 === 0 ? 'g5' : ''}">${emo(e, sz)}</span>`).join('');
        let right;
        if (age <= 3) {
          const opts = new Set([n]);
          while (opts.size < 3) opts.add(int(r, 1, max));
          right = [...opts].sort((a, b) => a - b).map(v => `<span class="opt">${v}</span>`).join('');
        } else right = '<span class="box"></span>';
        ans.push(`${i + 1}.${n}`);
        out.push(`<div class="rowline"><span class="items" style="flex:1">${items}</span><span style="white-space:nowrap">${right}</span></div>`);
      }
      return { tip: age <= 3 ? '数一数有几个，圈出正确的数字。' : '数一数有几个，把数字写在方框里。', body: out.join(''), answers: ans };
    },
  },
  {
    id: 'traceNumbers', name: '数字描红', cat: 'motor', ages: [3, 5],
    gen(r, age) {
      const digits = age === 3 ? [1, 2, 3, 4, 5] : sample(r, range(0, 9), 8).sort((a, b) => a - b);
      const out = digits.map(d => `<div class="tracecells">
        <span class="emo" style="width:22mm;font-size:4.2mm;color:#888;text-align:center">${'●'.repeat(d) || '○'}</span>
        ${range(0, 6).map(j => `<div class="tz" style="width:21.5mm;height:${age === 3 ? 30 : 23}mm"><span class="digit ${j === 0 ? '' : j <= 4 ? 'gray' : ''}">${j <= 4 ? d : ''}</span></div>`).join('')}</div>`);
      return { tip: '先描灰色的数字，再在空格里自己写一写。', body: out.join('') };
    },
  },
  {
    id: 'compare', name: '比多少', cat: 'math', ages: [3, 6],
    gen(r, age) {
      const out = [], ans = [];
      if (age === 3) {
        for (let i = 0; i < 4; i++) {
          let a = int(r, 1, 5), b = int(r, 1, 5); while (a === b) b = int(r, 1, 5);
          const [e1, e2] = sample(r, PICS, 2);
          ans.push(`${i + 1}.${a > b ? '左' : '右'}`);
          const grp = (n, e) => `<span class="items" style="border:.4mm solid #bbb;border-radius:3mm;padding:3mm;width:72mm;min-height:22mm;justify-content:center">${range(1, n).map(() => emo(e, 12)).join('')}</span>`;
          out.push(`<div class="rowline" style="justify-content:space-around">${grp(a, e1)}${grp(b, e2)}</div>`);
        }
        return { tip: '哪一组多？把多的那一组圈起来。', body: out.join(''), answers: ans };
      }
      const cells = [];
      const n = age === 4 ? 6 : 12;
      for (let i = 0; i < n; i++) {
        const max = age === 4 ? 9 : age === 5 ? 20 : 20;
        let a = int(r, 0, max), b = int(r, 0, max);
        if (r() < .15) b = a;
        let la = a, lb = b;
        if (age === 6 && i % 2) { const x = int(r, 0, Math.min(a, 10)); la = `${x}+${a - x}`; }
        const sign = a > b ? '>' : a < b ? '<' : '=';
        ans.push(`${i + 1}. ${sign}`);
        if (age === 4) {
          const [e1, e2] = sample(r, PICS, 2);
          cells.push(`<div class="rowline"><span class="items" style="width:70mm">${range(1, a).map(() => emo(e1, 7)).join('') || '（空）'}</span><span class="opt" style="width:13mm;height:13mm;border-color:#555"></span><span class="items" style="width:70mm;justify-content:flex-end">${range(1, b).map(() => emo(e2, 7)).join('') || '（空）'}</span></div>`);
        } else cells.push(`<div class="eq"><b style="min-width:20mm;text-align:right">${la}</b><span class="opt" style="width:12mm;height:12mm;border-color:#555"></span><b>${lb}</b></div>`);
      }
      return {
        tip: '在圆圈里填上 “>”、“<” 或 “=”。',
        body: age === 4 ? cells.join('') : `<div class="grid2">${cells.join('')}</div>`, answers: ans,
      };
    },
  },
  {
    id: 'addSub', name: '加减法', cat: 'math', ages: [4, 6],
    gen(r, age) {
      const ans = [];
      if (age === 4) {
        const out = [];
        for (let i = 0; i < 6; i++) {
          const e = pick(r, PICS), sub = i >= 3;
          let a = int(r, 1, 4), b = int(r, 1, 5 - a);
          if (sub) { a = int(r, 2, 5); b = int(r, 1, a - 1); }
          ans.push(`${i + 1}. ${sub ? a - b : a + b}`);
          const g = n => `<span class="items" style="gap:.5mm">${range(1, n).map(() => emo(e, 8.5)).join('')}</span>`;
          out.push(`<div class="rowline" style="justify-content:flex-start"><span class="eq">${g(a)}<b>${sub ? '−' : '+'}</b>${g(b)}<b>=</b><span class="box"></span></span>
            <span style="margin-left:auto;font-size:6.5mm;color:#888">${a} ${sub ? '−' : '+'} ${b} = ___</span></div>`);
        }
        return { tip: '看图算一算，把答案写在方框里。', body: out.join(''), answers: ans };
      }
      const n = age === 5 ? 20 : 30, max = age === 5 ? 10 : 20, cells = [];
      for (let i = 0; i < n; i++) {
        let a, b, op = r() < .5 ? '+' : '−';
        if (op === '+') { a = int(r, 0, max); b = int(r, 0, max - a); } else { a = int(r, 1, max); b = int(r, 0, a); }
        ans.push(`${i + 1}. ${op === '+' ? a + b : a - b}`);
        cells.push(`<div class="eq" style="font-size:${age === 5 ? 8 : 7}mm"><span style="min-width:30mm;text-align:right">${a} ${op} ${b} =</span><span class="box"></span></div>`);
      }
      return { tip: `${max} 以内加减法，认真算一算！`, body: `<div class="${age === 5 ? 'grid2' : 'grid3'}">${cells.join('')}</div>`, answers: ans };
    },
  },
  {
    id: 'missingNumber', name: '数字填空', cat: 'math', ages: [4, 6],
    gen(r, age) {
      const rows = 10, out = [], ans = [];
      for (let i = 0; i < rows; i++) {
        const step = age === 6 && r() < .4 ? 2 : 1, desc = age === 6 && r() < .35;
        const max = age === 4 ? 10 : 20, len = 6;
        const start = int(r, desc ? step * (len - 1) : 0, desc ? max : max - step * (len - 1));
        const seq = range(0, len - 1).map(j => start + (desc ? -1 : 1) * step * j);
        const blanks = sample(r, range(1, len - 1), age === 4 ? 1 : 2);
        ans.push(`${i + 1}. ${blanks.sort((a, b) => a - b).map(b => seq[b]).join('、')}`);
        out.push(`<div class="eq" style="justify-content:center;gap:3mm">${seq.map((v, j) => blanks.includes(j) ? '<span class="box" style="width:15mm;height:13mm"></span>' : `<span style="display:inline-grid;place-items:center;width:15mm;height:13mm">${v}</span>`).join('<span style="color:#bbb">→</span>')}</div>`);
      }
      return { tip: '按顺序想一想，空格里应该填几？', body: out.join(''), answers: ans };
    },
  },
  {
    id: 'clock', name: '认识钟表', cat: 'math', ages: [4, 6],
    gen(r, age) {
      const cells = [], ans = [];
      for (let i = 0; i < 6; i++) {
        const h = int(r, 1, 12), m = age === 4 ? 0 : (r() < .5 ? 0 : 30);
        const t = `${h}:${m ? '30' : '00'}`, draw = age === 6 && i >= 3;
        ans.push(`${i + 1}. ${t}`);
        cells.push(`<div style="text-align:center">${clockSvg(h, m, 58, !draw)}
          <div style="font-size:7mm;margin-top:2mm">${draw ? `请画出 <b>${t}</b>` : '<span class="box" style="width:16mm"></span> : <span class="box" style="width:16mm"></span>'}</div></div>`);
      }
      return { tip: age === 6 ? '读出钟面上的时间；后三个请画上时针和分针。' : '短针（红）指几点，长针（蓝）指分钟，写出时间。', body: `<div class="grid2">${cells.join('')}</div>`, answers: ans };
    },
  },
  {
    id: 'maze', name: '走迷宫', cat: 'motor', ages: [3, 6],
    gen(r, age) {
      const [w, h] = { 3: [5, 6], 4: [7, 9], 5: [10, 12], 6: [13, 16] }[age];
      const cs = Math.min(160 / (w + 2), 205 / (h + 2));
      const m = makeMaze(r, w, h), pair = pick(r, [['🐰', '🥕'], ['🐶', '🦴'], ['🐻', '🍯'], ['🐥', '🌽'], ['🐱', '🐟']]);
      return {
        tip: `帮 ${pair[0]} 找到 ${pair[1]}，用笔画出路线吧！`,
        body: `<div style="display:grid;place-items:center;flex:1">${mazeSvg(m, cs, false, ...pair)}</div>`,
        answerSvg: mazeSvg(m, Math.min(60 / (w + 2), 80 / (h + 2)), true),
      };
    },
  },
  {
    id: 'hanzi', name: '汉字描红', cat: 'lang', ages: [4, 6],
    gen(r, age) {
      const pool = parseHanzi(HANZI_4).concat(age >= 5 ? parseHanzi(HANZI_5) : []);
      const chars = sample(r, pool, 9);
      const out = chars.map(([c, py]) => `<div class="tracecells"><span class="py-label">${py}</span>
        ${range(0, 6).map(j => `<div class="tz"><span class="${j === 0 ? '' : 'gray'}">${j <= 3 ? c : ''}</span></div>`).join('')}</div>`);
      return { tip: '先看第一个字，再描灰色的字，最后自己写。', body: out.join('') };
    },
  },
  {
    id: 'pinyin', name: '拼音书写', cat: 'lang', ages: [5, 6],
    gen(r, age) {
      const g = pick(r, PINYIN.filter(p => p.age <= age));
      const lines = y => [0, 5, 10, 15].map((d, k) => `<line x1="0" x2="180" y1="${y + d}" y2="${y + d}" stroke="${k === 2 ? '#e7a3b8' : '#bbb'}" stroke-width="${k === 2 ? .5 : .35}"/>`).join('');
      const rowH = 21, out = [`<svg viewBox="0 0 180 ${rowH * g.items.length}" width="180mm" height="${rowH * g.items.length}mm" font-family="Andika, Arial, sans-serif">`];
      g.items.forEach((it, i) => {
        const y = i * rowH + 3;
        out.push(lines(y));
        for (let j = 0; j < 6; j++) out.push(`<text x="${6 + j * 29}" y="${y + 10}" font-size="11" fill="${j === 0 ? '#222' : j <= 2 ? '#cfcfcf' : 'none'}">${it}</text>`);
      });
      out.push('</svg>');
      return { tip: `${g.name}：先描再写，注意占格（写在四线三格里）。`, body: out.join('') };
    },
  },
];

// ---------- page assembly ----------
function pageHtml(g, res, age, no, name) {
  const c = CATS[g.cat];
  return `<section class="page" style="--pc:${c.color}">
    <header class="ph"><div class="ph-title"><span class="badge">${c.name}</span>${g.name}</div>
      <div class="ph-meta">姓名 <u>${esc(name)}</u>　日期 <u></u></div></header>
    <p class="tip">${res.tip}</p>
    <div class="pbody">${res.body}</div>
    <footer class="pf">宝贝练习本 · 适合 ${age} 岁 · 第 ${no} 页</footer></section>`;
}
function answersHtml(list, age, no) {
  const blocks = list.map(({ no, g, res }) => `<h4>第 ${no} 页 · ${g.name}</h4>` +
    (res.answers ? `<p>${res.answers.map(esc).join('　')}</p>` : '') + (res.answerSvg ? `<div>${res.answerSvg}</div>` : ''));
  return `<section class="page" style="--pc:#777"><header class="ph"><div class="ph-title"><span class="badge">家长用</span>参考答案</div></header>
    <div class="ans">${blocks.join('')}</div><footer class="pf">宝贝练习本 · 适合 ${age} 岁 · 第 ${no} 页</footer></section>`;
}

function buildPages({ age, ids, pages, name, withAnswers, seed }) {
  const r = makeRand(seed);
  const gens = shuffle(r, GENS.filter(g => ids.includes(g.id)));
  const done = [], html = [];
  for (let i = 0; i < pages; i++) {
    const g = gens[i % gens.length];
    const res = g.gen(r, age);
    html.push(pageHtml(g, res, age, i + 1, name));
    if (res.answers || res.answerSvg) done.push({ no: i + 1, g, res });
  }
  if (withAnswers && done.length) html.push(answersHtml(done, age, pages + 1));
  return html.join('');
}

// ---------- UI ----------
const state = { age: 3, pages: 4, selected: {}, name: '', withAnswers: true, seed: Date.now() >>> 0 };
const store = {
  load() { try { Object.assign(state, JSON.parse(localStorage.getItem('bblx') || '{}')); } catch (e) { /* storage unavailable */ } },
  save() { try { localStorage.setItem('bblx', JSON.stringify({ age: state.age, pages: state.pages, selected: state.selected, name: state.name, withAnswers: state.withAnswers })); } catch (e) { /* ignore */ } },
};
const fits = (g, age) => age >= g.ages[0] && age <= g.ages[1];
function selectedIds() {
  const sel = state.selected[state.age];
  const ids = (sel || GENS.filter(g => fits(g, state.age)).map(g => g.id)).filter(id => fits(GENS.find(g => g.id === id), state.age));
  return ids;
}

function renderControls() {
  $('#ages').innerHTML = range(1, 6).map(a => `<button class="chip" type="button" data-age="${a}" aria-pressed="${a === state.age}">${a} 岁</button>`).join('');
  const ids = selectedIds();
  $('#cats').innerHTML = Object.entries(CATS).map(([k, c]) => `<div class="cat" style="--cc:${c.color}"><h3>${c.name}</h3><div class="chips">
    ${GENS.filter(g => g.cat === k).map(g => `<button class="chip" type="button" data-gen="${g.id}" ${fits(g, state.age) ? '' : 'disabled'} aria-pressed="${ids.includes(g.id)}">${g.name}<small>${g.ages[0]}–${g.ages[1]}岁</small></button>`).join('')}
  </div></div>`).join('');
  $('#pagesOut').textContent = state.pages;
  $('#childName').value = state.name;
  $('#withAnswers').checked = state.withAnswers;
  $('#genBtn').disabled = !ids.length;
}

function generate() {
  const ids = selectedIds();
  if (!ids.length) return;
  $('#pages').innerHTML = `<div class="zoom">${buildPages({ age: state.age, ids, pages: state.pages, name: state.name, withAnswers: state.withAnswers, seed: state.seed })}</div>`;
  $('#previewWrap').hidden = false;
  $('#previewInfo').textContent = `${state.age} 岁 · ${state.pages} 页${state.withAnswers ? ' + 答案' : ''}`;
  fitZoom();
}
function fitZoom() {
  const z = $('#pages .zoom'); if (!z) return;
  const pagePx = 210 * 96 / 25.4, avail = Math.min(window.innerWidth, document.documentElement.clientWidth) - 32;
  z.style.setProperty('--z', Math.min(1, avail / pagePx).toFixed(3));
}

function $(s) { return document.querySelector(s); }

document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.age) { state.age = +t.dataset.age; renderControls(); }
  else if (t.dataset.gen) {
    const ids = selectedIds(), id = t.dataset.gen;
    state.selected[state.age] = ids.includes(id) ? ids.filter(x => x !== id) : ids.concat(id);
    renderControls();
  } else if (t.dataset.d) { state.pages = Math.max(1, Math.min(30, state.pages + +t.dataset.d)); renderControls(); }
  else if (t.id === 'genBtn') { state.seed = (Math.random() * 2 ** 32) >>> 0; generate(); $('#previewWrap').scrollIntoView({ behavior: 'smooth' }); }
  else if (t.id === 'reBtn') { state.seed = (Math.random() * 2 ** 32) >>> 0; generate(); }
  else if (t.id === 'printBtn') window.print();
  store.save();
});
$('#childName').addEventListener('input', e => { state.name = e.target.value.trim(); store.save(); });
$('#withAnswers').addEventListener('change', e => { state.withAnswers = e.target.checked; store.save(); });
window.addEventListener('resize', fitZoom);

store.load();
renderControls();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});

// exposed for tests / headless PDF rendering
window.BBLX = { GENS, buildPages };

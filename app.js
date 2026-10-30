'use strict';
/* 宝贝练习本 / Little Learner — bilingual (zh/en) worksheet generator for ages 1–6.
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

// category colors; names live in I18N.cats
const CATS = {
  math:  { color: '#ff8a3d' },
  lang:  { color: '#e2557a' },
  motor: { color: '#2fa37a' },
  logic: { color: '#4a7bd8' },
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
// color swatches; names live in I18N.colors (same order)
const COLORS = [['red', '#e53935'], ['yellow', '#fdd835'], ['blue', '#1e88e5'], ['green', '#43a047'], ['orange', '#fb8c00'], ['purple', '#8e24aa']];

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

// ---------- i18n ----------
const I18N = {
  zh: {
    app: '宝贝练习本', sub: '1–6 岁 · 按年龄出题 · 打印 / 存为 PDF',
    age: '孩子年龄', types: '选择题型', typesHint: '点选需要的题型（灰色表示不适合当前年龄）。',
    settings: '打印设置', nameL: '孩子姓名（可选）', namePh: '印在每页抬头', pages: '总页数',
    answers: '附答案页（给家长）', gen: '生成练习题', re: '换一批', print: '打印 / 存为 PDF',
    printHint: 'iPhone：打印界面里双指放大预览 → 分享 → 存储到“文件”即得 PDF；安卓：打印机选“另存为 PDF”。纸张选 A4，边距选“无”。',
    ageChip: n => `${n} 岁`, ageRange: (a, b) => `${a}–${b}岁`,
    info: (a, p, ans) => `${a} 岁 · ${p} 页${ans ? ' + 答案' : ''}`,
    name: '姓名', date: '日期', footer: (a, n) => `宝贝练习本 · 适合 ${a} 岁 · 第 ${n} 页`,
    key: '参考答案', parents: '家长用', pageN: n => `第 ${n} 页`, sep: '、',
    cats: { math: '数学启蒙', lang: '语言识字', motor: '精细动作', logic: '认知逻辑' },
    shapes: { circle: '圆形', square: '正方形', triangle: '三角形', diamond: '菱形', star: '星星', heart: '爱心' },
    colors: ['红色', '黄色', '蓝色', '绿色', '橙色', '紫色'],
    nth: n => `第${n}个`, left: '左', right: '右', big: '大', small: '小',
    circleBig: '圈出最<b>大</b>的', circleSmall: '圈出最<b>小</b>的', empty: '（空）',
    drawTime: t => `请画出 <b>${t}</b>`,
  },
  en: {
    app: 'Little Learner', sub: 'Ages 1–6 · Level-matched worksheets · Print / Save as PDF',
    age: 'Child’s age', types: 'Worksheet types', typesHint: 'Tap to choose (greyed out = not for this age).',
    settings: 'Print settings', nameL: 'Child’s name (optional)', namePh: 'Printed on every page', pages: 'Pages',
    answers: 'Include answer key (for parents)', gen: 'Make worksheets', re: 'New set', print: 'Print / Save as PDF',
    printHint: 'iPhone: in the print screen, pinch out on the preview → Share → Save to Files for a PDF. Android: choose “Save as PDF” as the printer. Use A4 paper, margins “None”.',
    ageChip: n => `Age ${n}`, ageRange: (a, b) => `${a}–${b}`,
    info: (a, p, ans) => `Age ${a} · ${p} page${p > 1 ? 's' : ''}${ans ? ' + answers' : ''}`,
    name: 'Name', date: 'Date', footer: (a, n) => `Little Learner · Age ${a} · Page ${n}`,
    key: 'Answer key', parents: 'Parents', pageN: n => `Page ${n}`, sep: ', ',
    cats: { math: 'Math', lang: 'Language', motor: 'Fine motor', logic: 'Thinking' },
    shapes: { circle: 'Circle', square: 'Square', triangle: 'Triangle', diamond: 'Diamond', star: 'Star', heart: 'Heart' },
    colors: ['red', 'yellow', 'blue', 'green', 'orange', 'purple'],
    nth: n => `#${n}`, left: 'left', right: 'right', big: 'big', small: 'small',
    circleBig: 'Circle the <b>biggest</b>', circleSmall: 'Circle the <b>smallest</b>', empty: '(none)',
    drawTime: t => `Draw <b>${t}</b>`,
  },
};
let lang = 'zh', L = I18N.zh;
const tr = (zh, en) => (lang === 'en' ? en : zh);

// ---------- content data ----------
const HANZI_4 = '一yī 二èr 三sān 人rén 口kǒu 大dà 小xiǎo 上shàng 下xià 日rì 月yuè 山shān 水shuǐ 火huǒ 木mù 田tián 中zhōng 天tiān 十shí 土tǔ';
const HANZI_5 = '手shǒu 目mù 耳ěr 牛niú 羊yáng 马mǎ 鸟niǎo 云yún 雨yǔ 花huā 草cǎo 我wǒ 你nǐ 他tā 爸bà 妈mā 子zǐ 女nǚ 门mén 不bù 来lái 去qù 出chū 入rù 左zuǒ 右yòu 白bái 石shí 禾hé 竹zhú 米mǐ 飞fēi 车chē 王wáng 文wén 心xīn 个gè 头tóu 足zú 力lì';
const parseHanzi = s => s.split(' ').map(t => [t[0], t.slice(1)]);
const PINYIN = [
  { name: ['单韵母', 'Simple finals'], items: ['a', 'o', 'e', 'i', 'u', 'ü'], age: 5 },
  { name: ['声母（一）', 'Initials (1)'], items: ['b', 'p', 'm', 'f', 'd', 't', 'n', 'l'], age: 5 },
  { name: ['声母（二）', 'Initials (2)'], items: ['g', 'k', 'h', 'j', 'q', 'x'], age: 5 },
  { name: ['声母（三）', 'Initials (3)'], items: ['zh', 'ch', 'sh', 'r', 'z', 'c', 's', 'y', 'w'], age: 6 },
  { name: ['复韵母', 'Compound finals'], items: ['ai', 'ei', 'ui', 'ao', 'ou', 'iu', 'ie', 'üe', 'er'], age: 6 },
  { name: ['鼻韵母', 'Nasal finals'], items: ['an', 'en', 'in', 'un', 'ün', 'ang', 'eng', 'ing', 'ong'], age: 6 },
];
const WORDS = [['🐱', 'cat', '猫'], ['🐶', 'dog', '狗'], ['☀️', 'sun', '太阳'], ['🐷', 'pig', '猪'], ['🚌', 'bus', '公交车'], ['🎩', 'hat', '帽子'],
  ['🐝', 'bee', '蜜蜂'], ['🥚', 'egg', '鸡蛋'], ['🦊', 'fox', '狐狸'], ['🐔', 'hen', '母鸡'], ['🛏️', 'bed', '床'], ['📦', 'box', '盒子'],
  ['🚗', 'car', '汽车'], ['🐮', 'cow', '奶牛'], ['🐜', 'ant', '蚂蚁'], ['👜', 'bag', '包'], ['🖊️', 'pen', '笔'], ['🐟', 'fish', '鱼'],
  ['🍎', 'apple', '苹果'], ['⭐', 'star', '星星'], ['🌙', 'moon', '月亮'], ['🐸', 'frog', '青蛙'], ['🦆', 'duck', '鸭子'], ['🎂', 'cake', '蛋糕']];

// four-line writing rows (pinyin / English); each row: optional label, model, 2 grey copies, empty space
function fourLineSvg(items, labels, slotW = 29) {
  const rowH = 21, x0 = labels ? 18 : 0;
  const out = [`<svg viewBox="0 0 180 ${rowH * items.length}" width="180mm" height="${rowH * items.length}mm" font-family="Andika, Arial, sans-serif">`];
  items.forEach((it, i) => {
    const y = i * rowH + 3;
    out.push([0, 5, 10, 15].map((d, k) => `<line x1="${x0}" x2="180" y1="${y + d}" y2="${y + d}" stroke="${k === 2 ? '#e7a3b8' : '#bbb'}" stroke-width="${k === 2 ? .5 : .35}"/>`).join(''));
    if (labels) out.push(`<text x="8" y="${y + 12}" font-size="12" text-anchor="middle" class="emo">${labels[i]}</text>`);
    for (let j = 0; j < 3; j++) out.push(`<text x="${x0 + 3 + j * slotW}" y="${y + 10}" font-size="11" fill="${j === 0 ? '#222' : '#cfcfcf'}">${it}</text>`);
  });
  out.push('</svg>');
  return out.join('');
}

// ---------- worksheet generators ----------
const GENS = [
  {
    id: 'coloring', name: ['形状涂色', 'Color the Shapes'], cat: 'motor', ages: [1, 3],
    gen(r, age) {
      const n = age <= 2 ? 4 : 6;
      const shapes = sample(r, Object.keys(L.shapes), n), cols = sample(r, range(0, 5), n);
      const cells = shapes.map((s, i) => `<div style="text-align:center">
        <svg viewBox="0 0 80 80" width="${age <= 2 ? 72 : 52}mm" height="${age <= 2 ? 72 : 52}mm">${shapeSvg(s, 40, 41, 32, '#222', 2.2)}</svg>
        <div style="font-size:5.5mm"><span style="display:inline-block;width:5mm;height:5mm;border-radius:50%;background:${COLORS[cols[i]][1]};vertical-align:-0.6mm"></span> ${L.shapes[s]} · ${L.colors[cols[i]]}</div></div>`);
      return { tip: tr('按照下面的提示，给每个图形涂上颜色。', 'Color each shape with the color shown.'), body: `<div class="grid2" style="grid-template-columns:repeat(${age <= 2 ? 2 : 3},1fr)">${cells.join('')}</div>` };
    },
  },
  {
    id: 'traceLines', name: ['描线练习', 'Tracing Lines'], cat: 'motor', ages: [1, 4],
    gen(r, age) {
      const pool = ['straight', 'bumps'].concat(age >= 2 ? ['wave', 'zigzag'] : [], age >= 3 ? ['square'] : [], age >= 4 ? ['loops'] : []);
      const rows = age <= 2 ? 4 : 6, H = age <= 2 ? 52 : 36, A = age <= 2 ? 12 : 8;
      const out = [];
      for (let i = 0; i < rows; i++) {
        const type = i < pool.length ? pool[(i + int(r, 0, pool.length - 1)) % pool.length] : pick(r, pool);
        const tp = tracePoints(type, 24, 156, H / 2, A), pts = tp.map(p => p.map(v => v.toFixed(2)).join(',')).join(' ');
        const [a, b] = sample(r, PICS, 2);
        out.push(`<svg viewBox="0 0 180 ${H}" width="180mm" height="${H}mm">
          <polyline points="${pts}" fill="none" stroke="#9a9a9a" stroke-width="${age <= 2 ? 1.6 : 1.1}" stroke-dasharray="1.6 2.2" stroke-linecap="round"/>
          <circle cx="${tp[0][0]}" cy="${tp[0][1]}" r="1.8" fill="#2fa37a"/>
          <text x="10" y="${H / 2 + 4.5}" font-size="13" text-anchor="middle" class="emo">${a}</text>
          <text x="170" y="${H / 2 + 4.5}" font-size="13" text-anchor="middle" class="emo">${b}</text></svg>`);
      }
      return { tip: tr('从绿点出发，沿着虚线画到另一边。', 'Start at the green dot and follow the dotted line.'), body: out.join('') };
    },
  },
  {
    id: 'matching', name: ['连一连', 'Match Up'], cat: 'logic', ages: [1, 4],
    gen(r, age) {
      const n = age <= 2 ? 3 : age === 3 ? 4 : 5;
      const left = sample(r, ANIMALS, n), right = shuffle(r, left), shadow = age >= 3, size = n <= 3 ? 26 : 19;
      const col = (arr, dotRight, sh) => `<div>${arr.map(e => `<div class="mitem">${dotRight ? '' : '<span class="dot"></span>'}${emo(e, size, sh ? 'shadow' : '')}${dotRight ? '<span class="dot"></span>' : ''}</div>`).join('')}</div>`;
      return {
        tip: shadow ? tr('找一找每个小动物的影子，用线连起来。', 'Draw a line from each animal to its shadow.') : tr('把一样的小动物用线连起来。', 'Draw a line between the matching animals.'),
        body: `<div class="mcol" style="padding:0 12mm">${col(left, true, false)}${col(right, false, shadow)}</div>`,
        answers: left.map(e => `${e}→${L.nth(right.indexOf(e) + 1)}`),
      };
    },
  },
  {
    id: 'sizeCompare', name: ['比大小', 'Big & Small'], cat: 'logic', ages: [1, 3],
    gen(r, age) {
      const rows = 5, k = age <= 2 ? 2 : 3, ans = [], out = [];
      for (let i = 0; i < rows; i++) {
        const e = pick(r, PICS), big = i % 2 === 0;
        const sizes = shuffle(r, k === 2 ? [12, 26] : [10, 17, 26]);
        const target = big ? Math.max(...sizes) : Math.min(...sizes);
        ans.push(`${i + 1}. ${big ? L.big : L.small}: ${L.nth(sizes.indexOf(target) + 1)}`);
        out.push(`<div class="rowline"><span style="font-size:6mm;width:42mm">${big ? L.circleBig : L.circleSmall}</span>
          <span class="items" style="flex:1;justify-content:space-around;align-items:flex-end">${sizes.map(s => emo(e, s)).join('')}</span></div>`);
      }
      return { tip: tr('看一看，按要求圈一圈。', 'Look carefully and circle the right one.'), body: out.join(''), answers: ans };
    },
  },
  {
    id: 'patterns', name: ['找规律', 'Patterns'], cat: 'logic', ages: [2, 6],
    gen(r, age) {
      const units = age <= 3 ? ['AB'] : age === 4 ? ['AB', 'AAB', 'ABB'] : ['ABC', 'AABB', 'ABB', 'ABCC', 'AAB'];
      const rows = age <= 3 ? 4 : 6, sz = age <= 3 ? 14 : 11, out = [], ans = [];
      for (let i = 0; i < rows; i++) {
        const u = pick(r, units), sym = sample(r, PICS, 3), map = c => sym['ABC'.indexOf(c)];
        const len = Math.max(age <= 3 ? 5 : 7, u.length * 2 + 1);
        const seq = range(0, len - 1).map(j => map(u[j % u.length]));
        const correct = seq[len - 1];
        const opts = shuffle(r, Array.from(new Set([correct, ...sym, pick(r, PICS)])).slice(0, 3));
        ans.push(`${i + 1}. ${correct}`);
        out.push(`<div class="rowline"><span class="items">${seq.slice(0, -1).map(e => emo(e, sz)).join('')}<span class="box" style="width:${sz + 2}mm;height:${sz + 2}mm;border-style:dashed"></span></span>
          <span style="white-space:nowrap;border-left:.3mm solid #ddd;padding-left:3mm">${opts.map(e => emo(e, sz * .8)).join(' ')}</span></div>`);
      }
      return { tip: tr('下一个应该是谁？在右边圈出来，或画在方框里。', 'What comes next? Circle it on the right or draw it in the box.'), body: out.join(''), answers: ans };
    },
  },
  {
    id: 'count', name: ['数一数', 'Counting'], cat: 'math', ages: [2, 6],
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
        ans.push(`${i + 1}. ${n}`);
        out.push(`<div class="rowline"><span class="items" style="flex:1">${items}</span><span style="white-space:nowrap">${right}</span></div>`);
      }
      return {
        tip: age <= 3 ? tr('数一数有几个，圈出正确的数字。', 'Count them and circle the right number.') : tr('数一数有几个，把数字写在方框里。', 'Count them and write the number in the box.'),
        body: out.join(''), answers: ans,
      };
    },
  },
  {
    id: 'traceNumbers', name: ['数字描红', 'Number Tracing'], cat: 'motor', ages: [3, 5],
    gen(r, age) {
      const digits = age === 3 ? [1, 2, 3, 4, 5] : sample(r, range(0, 9), 8).sort((a, b) => a - b);
      const out = digits.map(d => `<div class="tracecells">
        <span class="emo" style="width:22mm;font-size:4.2mm;color:#888;text-align:center">${'●'.repeat(d) || '○'}</span>
        ${range(0, 6).map(j => `<div class="tz" style="width:21.5mm;height:${age === 3 ? 30 : 23}mm"><span class="digit ${j === 0 ? '' : j <= 4 ? 'gray' : ''}">${j <= 4 ? d : ''}</span></div>`).join('')}</div>`);
      return { tip: tr('先描灰色的数字，再在空格里自己写一写。', 'Trace the grey numbers, then write your own in the empty boxes.'), body: out.join('') };
    },
  },
  {
    id: 'compare', name: ['比多少', 'More or Less'], cat: 'math', ages: [3, 6],
    gen(r, age) {
      const out = [], ans = [];
      if (age === 3) {
        for (let i = 0; i < 4; i++) {
          let a = int(r, 1, 5), b = int(r, 1, 5); while (a === b) b = int(r, 1, 5);
          const [e1, e2] = sample(r, PICS, 2);
          ans.push(`${i + 1}. ${a > b ? L.left : L.right}`);
          const grp = (n, e) => `<span class="items" style="border:.4mm solid #bbb;border-radius:3mm;padding:3mm;width:72mm;min-height:22mm;justify-content:center">${range(1, n).map(() => emo(e, 12)).join('')}</span>`;
          out.push(`<div class="rowline" style="justify-content:space-around">${grp(a, e1)}${grp(b, e2)}</div>`);
        }
        return { tip: tr('哪一组多？把多的那一组圈起来。', 'Which group has more? Circle it.'), body: out.join(''), answers: ans };
      }
      const cells = [], n = age === 4 ? 6 : 12;
      for (let i = 0; i < n; i++) {
        const max = age === 4 ? 9 : 20;
        let a = int(r, 0, max), b = int(r, 0, max);
        if (r() < .15) b = a;
        let la = a;
        if (age === 6 && i % 2) { const x = int(r, 0, Math.min(a, 10)); la = `${x}+${a - x}`; }
        ans.push(`${i + 1}. ${a > b ? '>' : a < b ? '<' : '='}`);
        if (age === 4) {
          const [e1, e2] = sample(r, PICS, 2);
          cells.push(`<div class="rowline"><span class="items" style="width:70mm">${range(1, a).map(() => emo(e1, 7)).join('') || L.empty}</span><span class="opt" style="width:13mm;height:13mm;border-color:#555"></span><span class="items" style="width:70mm;justify-content:flex-end">${range(1, b).map(() => emo(e2, 7)).join('') || L.empty}</span></div>`);
        } else cells.push(`<div class="eq"><b style="min-width:20mm;text-align:right">${la}</b><span class="opt" style="width:12mm;height:12mm;border-color:#555"></span><b>${b}</b></div>`);
      }
      return {
        tip: tr('在圆圈里填上 “>”、“<” 或 “=”。', 'Write “>”, “<” or “=” in each circle.'),
        body: age === 4 ? cells.join('') : `<div class="grid2">${cells.join('')}</div>`, answers: ans,
      };
    },
  },
  {
    id: 'addSub', name: ['加减法', 'Add & Subtract'], cat: 'math', ages: [4, 6],
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
        return { tip: tr('看图算一算，把答案写在方框里。', 'Use the pictures to work it out. Write the answer in the box.'), body: out.join(''), answers: ans };
      }
      const n = age === 5 ? 20 : 30, max = age === 5 ? 10 : 20, cells = [];
      for (let i = 0; i < n; i++) {
        let a, b; const op = r() < .5 ? '+' : '−';
        if (op === '+') { a = int(r, 0, max); b = int(r, 0, max - a); } else { a = int(r, 1, max); b = int(r, 0, a); }
        ans.push(`${i + 1}. ${op === '+' ? a + b : a - b}`);
        cells.push(`<div class="eq" style="font-size:${age === 5 ? 8 : 7}mm"><span style="min-width:30mm;text-align:right">${a} ${op} ${b} =</span><span class="box"></span></div>`);
      }
      return { tip: tr(`${max} 以内加减法，认真算一算！`, `Adding and subtracting within ${max}.`), body: `<div class="${age === 5 ? 'grid2' : 'grid3'}">${cells.join('')}</div>`, answers: ans };
    },
  },
  {
    id: 'missingNumber', name: ['数字填空', 'Missing Numbers'], cat: 'math', ages: [4, 6],
    gen(r, age) {
      const rows = 10, out = [], ans = [];
      for (let i = 0; i < rows; i++) {
        const step = age === 6 && r() < .4 ? 2 : 1, desc = age === 6 && r() < .35;
        const max = age === 4 ? 10 : 20, len = 6;
        const start = int(r, desc ? step * (len - 1) : 0, desc ? max : max - step * (len - 1));
        const seq = range(0, len - 1).map(j => start + (desc ? -1 : 1) * step * j);
        const blanks = sample(r, range(1, len - 1), age === 4 ? 1 : 2);
        ans.push(`${i + 1}. ${blanks.sort((a, b) => a - b).map(b => seq[b]).join(L.sep)}`);
        out.push(`<div class="eq" style="justify-content:center;gap:3mm">${seq.map((v, j) => blanks.includes(j) ? '<span class="box" style="width:15mm;height:13mm"></span>' : `<span style="display:inline-grid;place-items:center;width:15mm;height:13mm">${v}</span>`).join('<span style="color:#bbb">→</span>')}</div>`);
      }
      return { tip: tr('按顺序想一想，空格里应该填几？', 'Which numbers are missing? Fill in the boxes.'), body: out.join(''), answers: ans };
    },
  },
  {
    id: 'clock', name: ['认识钟表', 'Telling Time'], cat: 'math', ages: [4, 6],
    gen(r, age) {
      const cells = [], ans = [];
      for (let i = 0; i < 6; i++) {
        const h = int(r, 1, 12), m = age === 4 ? 0 : (r() < .5 ? 0 : 30);
        const t = `${h}:${m ? '30' : '00'}`, draw = age === 6 && i >= 3;
        ans.push(`${i + 1}. ${t}`);
        cells.push(`<div style="text-align:center">${clockSvg(h, m, 58, !draw)}
          <div style="font-size:7mm;margin-top:2mm">${draw ? L.drawTime(t) : '<span class="box" style="width:16mm"></span> : <span class="box" style="width:16mm"></span>'}</div></div>`);
      }
      return {
        tip: age === 6 ? tr('读出钟面上的时间；后三个请画上时针和分针。', 'Write the time. On the last three clocks, draw the hands.')
          : tr('短针（红）指几点，长针（蓝）指分钟，写出时间。', 'The short red hand shows the hour, the long blue hand the minutes. Write the time.'),
        body: `<div class="grid2">${cells.join('')}</div>`, answers: ans,
      };
    },
  },
  {
    id: 'maze', name: ['走迷宫', 'Mazes'], cat: 'motor', ages: [3, 6],
    gen(r, age) {
      const [w, h] = { 3: [5, 6], 4: [7, 9], 5: [10, 12], 6: [13, 16] }[age];
      const cs = Math.min(160 / (w + 2), 205 / (h + 2));
      const m = makeMaze(r, w, h), pair = pick(r, [['🐰', '🥕'], ['🐶', '🦴'], ['🐻', '🍯'], ['🐥', '🌽'], ['🐱', '🐟']]);
      return {
        tip: tr(`帮 ${pair[0]} 找到 ${pair[1]}，用笔画出路线吧！`, `Help ${pair[0]} find the ${pair[1]}. Draw the path!`),
        body: `<div style="display:grid;place-items:center;flex:1">${mazeSvg(m, cs, false, ...pair)}</div>`,
        answerSvg: mazeSvg(m, Math.min(60 / (w + 2), 80 / (h + 2)), true),
      };
    },
  },
  {
    id: 'hanzi', name: ['汉字描红', 'Chinese Characters'], cat: 'lang', ages: [4, 6],
    gen(r, age) {
      const pool = parseHanzi(HANZI_4).concat(age >= 5 ? parseHanzi(HANZI_5) : []);
      const out = sample(r, pool, 9).map(([c, py]) => `<div class="tracecells"><span class="py-label">${py}</span>
        ${range(0, 6).map(j => `<div class="tz"><span class="${j === 0 ? '' : 'gray'}">${j <= 3 ? c : ''}</span></div>`).join('')}</div>`);
      return { tip: tr('先看第一个字，再描灰色的字，最后自己写。', 'Look at the first character, trace the grey ones, then write it yourself.'), body: out.join('') };
    },
  },
  {
    id: 'pinyin', name: ['拼音书写', 'Pinyin'], cat: 'lang', ages: [5, 6],
    gen(r, age) {
      const g = pick(r, PINYIN.filter(p => p.age <= age));
      return { tip: tr(`${g.name[0]}：先描再写，注意占格（写在四线三格里）。`, `${g.name[1]}: trace, then write. Keep letters on the lines.`), body: fourLineSvg(g.items) };
    },
  },
  {
    id: 'letters', name: ['字母描写', 'Letters ABC'], cat: 'lang', ages: [3, 6],
    gen(r, age) {
      const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      const n = 9, start = int(r, 0, 26 - n);
      const items = ABC.slice(start, start + n).map(c => (age === 3 ? c : `${c}${c.toLowerCase()}`));
      return { tip: tr('先描灰色的字母，再在后面空白处自己写。', 'Trace the grey letters, then write them on your own.'), body: fourLineSvg(items, null, age === 3 ? 29 : 32) };
    },
  },
  {
    id: 'words', name: ['英文单词', 'Word Tracing'], cat: 'lang', ages: [5, 6],
    gen(r, age) {
      const ws = sample(r, WORDS.filter(w => age >= 6 || w[1].length <= 3), 9);
      return {
        tip: tr('看图读单词，先描再写。', 'Say the word for each picture, then trace and write it.'),
        body: fourLineSvg(ws.map(w => w[1]), ws.map(w => w[0]), 42),
        answers: ws.map(w => `${w[0]} ${w[1]}${lang === 'zh' ? `（${w[2]}）` : ''}`),
      };
    },
  },
];
const gname = g => g.name[lang === 'en' ? 1 : 0];

// ---------- page assembly ----------
function pageHtml(g, res, age, no, name) {
  return `<section class="page" style="--pc:${CATS[g.cat].color}">
    <header class="ph"><div class="ph-title"><span class="badge">${L.cats[g.cat]}</span>${gname(g)}</div>
      <div class="ph-meta">${L.name} <u>${esc(name)}</u>　${L.date} <u></u></div></header>
    <p class="tip">${res.tip}</p>
    <div class="pbody">${res.body}</div>
    <footer class="pf">${L.footer(age, no)}</footer></section>`;
}
function answersHtml(list, age, no) {
  const blocks = list.map(({ no, g, res }) => `<h4>${L.pageN(no)} · ${gname(g)}</h4>` +
    (res.answers ? `<p>${res.answers.map(esc).join('　')}</p>` : '') + (res.answerSvg ? `<div>${res.answerSvg}</div>` : ''));
  return `<section class="page" style="--pc:#777"><header class="ph"><div class="ph-title"><span class="badge">${L.parents}</span>${L.key}</div></header>
    <div class="ans">${blocks.join('')}</div><footer class="pf">${L.footer(age, no)}</footer></section>`;
}

function setLang(l) { lang = I18N[l] ? l : 'zh'; L = I18N[lang]; }

function buildPages({ age, ids, pages, name, withAnswers, seed, lang: l = lang }) {
  setLang(l);
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
const defaultLang = (navigator.language || 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en';
const state = { lang: defaultLang, age: 3, pages: 4, selected: {}, name: '', withAnswers: true, seed: Date.now() >>> 0 };
const store = {
  load() { try { Object.assign(state, JSON.parse(localStorage.getItem('bblx') || '{}')); } catch (e) { /* storage unavailable */ } },
  save() { try { localStorage.setItem('bblx', JSON.stringify({ lang: state.lang, age: state.age, pages: state.pages, selected: state.selected, name: state.name, withAnswers: state.withAnswers })); } catch (e) { /* ignore */ } },
};
const fits = (g, age) => age >= g.ages[0] && age <= g.ages[1];
const DEFAULT_OFF = { zh: ['letters', 'words'], en: ['hanzi', 'pinyin'] };
function selectedIds() {
  const sel = state.selected[state.age] || GENS.filter(g => !DEFAULT_OFF[state.lang].includes(g.id)).map(g => g.id);
  return sel.filter(id => { const g = GENS.find(x => x.id === id); return g && fits(g, state.age); });
}

function renderControls() {
  setLang(state.lang);
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  document.title = L.app;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = L[el.dataset.i18n]; });
  $('#childName').placeholder = L.namePh;
  $('#langs').innerHTML = [['zh', '中文'], ['en', 'English']].map(([k, v]) => `<button class="chip" type="button" data-lang="${k}" aria-pressed="${k === state.lang}">${v}</button>`).join('');
  $('#ages').innerHTML = range(1, 6).map(a => `<button class="chip" type="button" data-age="${a}" aria-pressed="${a === state.age}">${L.ageChip(a)}</button>`).join('');
  const ids = selectedIds();
  $('#cats').innerHTML = Object.entries(CATS).map(([k, c]) => `<div class="cat" style="--cc:${c.color}"><h3>${L.cats[k]}</h3><div class="chips">
    ${GENS.filter(g => g.cat === k).map(g => `<button class="chip" type="button" data-gen="${g.id}" ${fits(g, state.age) ? '' : 'disabled'} aria-pressed="${ids.includes(g.id)}">${gname(g)}<small>${L.ageRange(...g.ages)}</small></button>`).join('')}
  </div></div>`).join('');
  $('#pagesOut').textContent = state.pages;
  $('#childName').value = state.name;
  $('#withAnswers').checked = state.withAnswers;
  $('#genBtn').disabled = !ids.length;
}

function generate() {
  const ids = selectedIds();
  if (!ids.length) return;
  $('#pages').innerHTML = `<div class="zoom">${buildPages({ lang: state.lang, age: state.age, ids, pages: state.pages, name: state.name, withAnswers: state.withAnswers, seed: state.seed })}</div>`;
  $('#previewWrap').hidden = false;
  $('#previewInfo').textContent = L.info(state.age, state.pages, state.withAnswers);
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
  if (t.dataset.lang) {
    state.lang = t.dataset.lang; renderControls();
    if (!$('#previewWrap').hidden) generate(); // same seed → same puzzles, new language
  } else if (t.dataset.age) { state.age = +t.dataset.age; renderControls(); }
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

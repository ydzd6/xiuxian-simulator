// 产物自检：验证 index.html 真的是「零依赖、单文件、可离线双击运行」，并核对内联后的实际规模。
// 用法：node tools/verify.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FILE = path.join(ROOT, 'index.html');

let failed = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => { failed++; console.log(`  ✗ ${msg}`); };
const check = (cond, good, badMsg) => (cond ? ok(good) : bad(badMsg));

console.log('产物自检 index.html');

const html = fs.readFileSync(FILE, 'utf8');
const sizeKB = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);

/* ------------------------------------------------- 1. 单文件 / 无外部依赖 --- */

const externalRefs = [];
const attrRe = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
let m;
while ((m = attrRe.exec(html))) {
  const url = m[1].trim();
  if (/^(data:|#|javascript:)/i.test(url)) continue;
  externalRefs.push(url);
}
check(externalRefs.length === 0, '没有任何外部 src/href 引用（离线可用）',
  `发现外部引用：${externalRefs.join(', ')}`);
check(!/@import/i.test(html), '没有 CSS @import', '存在 @import');
check(!/<script[^>]+\bsrc=/i.test(html), '没有外链 <script src>', '存在外链脚本');
check(/<meta[^>]+name=["']viewport["']/i.test(html), '有 viewport 声明（手机端可读）', '缺少 viewport');

const scriptCount = (html.match(/<script\b/gi) || []).length;
check(scriptCount === 2, `内联脚本块恰好 2 个（实为 ${scriptCount}）`, `脚本块数量异常：${scriptCount}`);

/* ------------------------------------------------- 2. 数据块是合法 JSON --- */

const jsonTag = html.match(/<script id="game-data" type="application\/json">([\s\S]*?)<\/script>/);
check(!!jsonTag, '找到内联 <script id="game-data">', '缺少 game-data 数据块');

let data = null;
if (jsonTag) {
  try {
    data = JSON.parse(jsonTag[1].replace(/\\u003c/g, '<'));
    ok('game-data 是合法 JSON');
  } catch (e) {
    bad(`game-data 不是合法 JSON：${e.message}`);
  }
}
if (data) {
  const evs = data.events || [];
  check(evs.length >= 100, `内联事件数 ${evs.length}（≥100）`, `事件数不足：${evs.length}`);
  const ids = new Set(evs.map((e) => e.id));
  check(ids.size === evs.length, '事件 id 全局唯一', `事件 id 有重复（${evs.length - ids.size} 个）`);
  const deathOpts = evs.reduce((n, e) => n + (e.choices || []).filter((c) => c.effect && c.effect.death).length, 0);
  const repeatable = evs.filter((e) => e.once === false).length;
  console.log(`    事件 ${evs.length}（可重复 ${repeatable}，致命选项 ${deathOpts}）`);
}

/* ------------------------------------------------- 3. 应用脚本：语法与符号 --- */

const appTag = html.match(/<script>\n?([\s\S]*?)<\/script>\s*<\/body>/);
if (!appTag) {
  bad('未找到应用脚本块');
} else {
  const code = appTag[1];
  check(!/^\s*export\s/m.test(code), '核心逻辑已剥离 export（非 module 也能跑）', '残留 export 语句');
  check(!/^\s*import\s+[\w{*]/m.test(code), '没有残留 import 语句', '残留 import 语句');
  try { new Function(code); ok(`应用脚本体语法正确（${(Buffer.byteLength(code, 'utf8') / 1024).toFixed(1)} KB）`); }
  catch (e) { bad(`应用脚本体语法错误：${e.message}`); }

  const missing = ['TUNING', 'BREAKTHROUGH_COST', 'ENDINGS', 'ACHIEVEMENTS', 'condMatch', 'applyEffect']
    .filter((sym) => !new RegExp(`\\b${sym}\\b`).test(code));
  check(missing.length === 0, '平衡参数与判定函数均已内联', `缺少符号：${missing.join(', ')}`);

  // 4. 真跑一遍：只给最小的 DOM 桩，把内联后的真实规模取出来
  const stubEl = (id) => new Proxy({
    id: id || '',
    textContent: id === 'game-data' ? (jsonTag ? jsonTag[1] : '') : '',
    style: {}, classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    addEventListener() {}, appendChild() {}, setAttribute() {},
    querySelector: () => null, querySelectorAll: () => [], getContext: () => null,
  }, { get: (t, k) => (k in t ? t[k] : undefined), set: (t, k, v) => { t[k] = v; return true; } });
  const sandbox = {
    console,
    document: {
      addEventListener() {}, getElementById: (id) => stubEl(id),
      querySelector: () => null, querySelectorAll: () => [], createElement: () => stubEl(),
      body: stubEl(),
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0,
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  try {
    vm.runInContext(`${code}\n;globalThis.__probe = { tuning: TUNING, costs: BREAKTHROUGH_COST, endings: Object.keys(ENDINGS), achs: ACHIEVEMENTS.length, roots: ROOTS.length, origins: ORIGINS.length, sects: SECT_NAMES.length, realms: REALM_NAMES.length, game: typeof createGame };`, ctx, { timeout: 5000 });
    const p = ctx.__probe;
    check(p.game === 'function', '核心逻辑在裸 DOM 桩下可求值，createGame 可用', 'createGame 未定义');
    check(p.endings.length === 6, `结局档位 ${p.endings.length}（${p.endings.join(' / ')}）`, `结局档位异常：${p.endings.length}`);
    check(p.realms === 8, `境界 ${p.realms} 级（凡体→飞升）`, `境界数异常：${p.realms}`);
    check(p.sects === 6, `宗门 ${p.sects} 家`, `宗门数异常：${p.sects}`);
    console.log(`    规模：灵根 ${p.roots}　出身 ${p.origins}　成就 ${p.achs}　突破阈值 [${p.costs.join(', ')}]`);
  } catch (e) {
    bad(`应用脚本无法在最小 DOM 桩下求值：${e.message}`);
  }
}

/* ------------------------------------------------- 5. 存档兜底 --- */

check(/try\s*\{[\s\S]*?localStorage[\s\S]*?catch/.test(html),
  'localStorage 访问有 try/catch 兜底（file:// 下不会白屏）', 'localStorage 未做异常兜底');

console.log(failed === 0
  ? `\n✓ 自检通过　index.html ${sizeKB} KB　单文件 · 零依赖 · 可离线`
  : `\n✗ 自检失败　${failed} 项`);
process.exit(failed === 0 ? 0 : 1);

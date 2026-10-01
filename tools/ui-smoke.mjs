/**
 * 界面层冒烟测试：用一套极简 DOM 桩在 Node 里跑通 index.html 内联脚本，
 * 自动走完「取名 → 抽灵根 → 重抽 → 落定 → 若干事件 → 突破 → 结算 → 图鉴 → 分享图 → 再来一世」，
 * 并额外验证「刷新后继续上一世」的存档读回。
 * 用法：node tools/ui-smoke.mjs [完整周目数]
 *
 * 说明：Chromium 在受限沙箱里无法启动（mojo named pipe 被拒），
 * 本测试不渲染真实像素，只保证 UI 逻辑与事件绑定不会抛错。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const dataTag = html.match(/<script id="game-data" type="application\/json">([\s\S]*?)<\/script>/);
if (!dataTag) throw new Error('index.html 里找不到 game-data');
const allScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (!allScripts.length) throw new Error('index.html 里找不到内联脚本');
const appCode = allScripts[allScripts.length - 1][1];

const N_RUNS = parseInt(process.argv[2] || '40', 10);
const errors = [];
const ctx2d = new Proxy({}, {
  get(_, k) {
    if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() { } });
    if (k === 'measureText') return () => ({ width: 100 });
    return () => { };
  },
  set() { return true; }
});

const storage = (() => {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    clear: () => m.clear(),
    get length() { return m.size; }
  };
})();

let timers = new Map();
let tid = 0;
const setT = (fn, kind) => { const id = ++tid; timers.set(id, { fn, kind }); return id; };
const clrT = id => { timers.delete(id); };
function flush(maxRounds = 5000) {
  let r = 0;
  while (timers.size && r++ < maxRounds) {
    for (const [id, t] of [...timers.entries()]) {
      if (!timers.has(id)) continue;
      if (t.kind === 't') timers.delete(id);
      t.fn();
    }
  }
}

function mkEl(tag, id, cls) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    id: id || '',
    className: cls || '',
    value: '',
    disabled: false,
    href: '',
    download: '',
    src: '',
    width: 0,
    height: 0,
    checked: false,
    style: {},
    children: [],
    parent: null,
    _handlers: {},
    _html: ''
  };
  const set = new Set(String(cls || '').split(/\s+/).filter(Boolean));
  Object.defineProperty(el, 'classList', {
    value: {
      add: (...c) => { c.forEach(x => set.add(x)); el.className = [...set].join(' '); },
      remove: (...c) => { c.forEach(x => set.delete(x)); el.className = [...set].join(' '); },
      contains: c => set.has(c),
      toggle: c => { set.has(c) ? set.delete(c) : set.add(c); }
    }
  });
  Object.defineProperty(el, 'textContent', { get: () => el._text || '', set: v => { el._text = v; } });
  Object.defineProperty(el, 'innerHTML', {
    get: () => el._html,
    set: v => { el._html = v; el.children = []; }
  });
  el.appendChild = c => { c.parent = el; el.children.push(c); return c; };
  el.removeChild = c => { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); };
  el.remove = () => { if (el.parent) el.parent.removeChild(el); };
  el.addEventListener = (t, f) => { (el._handlers[t] = el._handlers[t] || []).push(f); };
  el.querySelectorAll = () => [];
  el.getContext = () => ctx2d;
  el.toDataURL = () => 'data:image/png;base64,STUB';
  el.click = () => {
    if (typeof el.onclick === 'function') el.onclick({ preventDefault() { } });
    (el._handlers.click || []).forEach(f => f({ preventDefault() { } }));
  };
  el.buttons = () => el.children.filter(c => c.tagName === 'BUTTON');
  return el;
}

function makeApp() {
  const registry = new Map();
  for (const m of html.matchAll(/<([a-zA-Z][\w-]*)([^>]*?)>/g)) {
    const attrs = m[2] || '';
    const idm = attrs.match(/\bid="([^"]+)"/);
    if (!idm) continue;
    const clsm = attrs.match(/\bclass="([^"]*)"/);
    registry.set(idm[1], mkEl(m[1], idm[1], clsm ? clsm[1] : ''));
  }
  const doc = {
    body: mkEl('body'),
    getElementById(id) {
      if (!registry.has(id)) registry.set(id, mkEl('div', id, ''));
      return registry.get(id);
    },
    createElement: tag => mkEl(tag),
    querySelectorAll: sel => [...registry.values()].filter(e => e.classList.contains(String(sel).replace(/^\./, ''))),
    addEventListener(type, fn) { doc._domReady = doc._domReady || []; if (type === 'DOMContentLoaded') doc._domReady.push(fn); }
  };
  doc.body.scrollHeight = 3000;
  registry.get('game-data').textContent = dataTag[1];

  const win = {
    innerWidth: 390,
    innerHeight: 844,
    scrollTo() { },
    addEventListener() { },
    document: doc,
    localStorage: storage,
    setTimeout: (fn) => setT(fn, 't'),
    clearTimeout: clrT,
    setInterval: (fn) => setT(fn, 'i'),
    clearInterval: clrT
  };
  const sandbox = {
    window: win, document: doc, localStorage: storage, console,
    setTimeout: win.setTimeout, clearTimeout: clrT,
    setInterval: win.setInterval, clearInterval: clrT,
    Math, JSON, Date, String, Number, Object, Array, Boolean, RegExp, Error, isNaN, parseInt, parseFloat
  };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(appCode, ctx, { filename: 'index-app.js' });
  (doc._domReady || []).forEach(fn => fn());
  flush();
  const $ = id => registry.get(id);
  const active = () => [...registry.values()].find(e => e.classList.contains('on') && /^screen-/.test(e.id));
  return { ctx, doc, registry, $, active, win };
}

function assert(cond, msg) {
  if (!cond) errors.push(msg);
  return cond;
}

/* ------------------------------------------------------------ 主流程 --- */

const app = makeApp();
const $ = app.$;
const log = [];

assert(app.active() && app.active().id === 'screen-title', '启动后应停在标题页，实际：' + (app.active() && app.active().id));

$('name-input').value = '测试者';
$('btn-female').click();
$('btn-start').click();
flush();
assert(app.active().id === 'screen-roll', '取名后应进入抽灵根页，实际：' + app.active().id);
assert($('roll-root').textContent.length > 0, '灵根未渲染');
assert($('roll-origin').textContent.length > 0, '出身未渲染');
assert($('btn-reroll').style.display !== 'none', '首局应显示重开一世按钮');
$('btn-reroll').click();
flush();
assert($('btn-reroll').style.display === 'none', '重抽后应隐藏重开一世按钮');
$('btn-enter').click();
flush();
assert(app.active().id === 'screen-game', '落定后应进入游戏页，实际：' + app.active().id);

const endings = {};
let breaks = 0;

function stepTurn(maxSteps) {
  let steps = 0;
  while (steps++ < maxSteps) {
    const scr = app.active();
    if (!scr || scr.id === 'screen-ending') return 'ending';
    if (scr.id === 'screen-chron') { $('btn-chron-back').click(); flush(); continue; }
    if (scr.id !== 'screen-game') return scr.id;

    const bt = $('btn-breakthrough');
    if (!bt.disabled && Math.random() < 0.55) {
      bt.click(); breaks++; flush(); continue;
    }
    const box = $('result-box');
    if (box.style.display === 'block' && box.buttons().length) {
      box.buttons()[box.buttons().length - 1].click(); flush(); continue;
    }
    const btns = $('choices').buttons();
    if (!btns.length) { flush(); continue; }
    btns[Math.floor(Math.random() * btns.length)].click();
    flush();
  }
  return 'guard';
}

for (let i = 0; i < N_RUNS; i++) {
  if (app.active().id === 'screen-title') {
    $('name-input').value = '道号' + i;
    $('btn-start').click(); flush();
  }
  if (app.active().id === 'screen-roll') { $('btn-enter').click(); flush(); }
  if (app.active().id !== 'screen-game') { errors.push('第 ' + i + ' 周目未进入游戏页：' + app.active().id); break; }

  const r = stepTurn(400);
  if (!assert(r === 'ending', '第 ' + i + ' 周目未走到结算，停在 ' + r)) break;

  const name = $('ending-name').textContent;
  endings[name] = (endings[name] || 0) + 1;
  assert($('ending-title').textContent.length > 0, '结算缺少结局称号');
  assert($('ending-verdict').textContent.length > 0, '结算缺少评语');
  assert($('ending-chron').innerHTML.length > 0, '结算页缺少生平年表');
  assert($('ending-stats').innerHTML.length > 0, '结算页缺少属性面板');

  // 分享图：进入分享页并生成
  $('btn-share').click(); flush();
  assert(app.active().id === 'screen-share', '应进入分享页');
  $('btn-share-make').click(); flush();
  assert($('share-img').src.indexOf('data:image/png') === 0, '分享图未生成 dataURL');
  assert($('btn-download').href.indexOf('data:image/png') === 0, '下载链接未就绪');
  $('btn-share-back').click(); flush();

  // 生平页
  $('btn-chron2').click(); flush();
  assert(app.active().id === 'screen-chron', '应进入生平页');
  $('btn-chron-back').click(); flush();

  // 图鉴
  $('btn-gal2').click(); flush();
  assert(app.active().id === 'screen-gallery', '应进入图鉴页');
  assert($('gal-grid').innerHTML.length > 0, '图鉴未渲染');
  assert($('ach-list').innerHTML.length > 0, '成就列表未渲染');
  assert(/结局 \d\/6/.test($('gal-stat').textContent), '图鉴统计文案异常：' + $('gal-stat').textContent);

  // 再来一世
  $('btn-again').click(); flush();
  assert(app.active().id === 'screen-roll', '再来一世应回到抽灵根页');
}

/* ---------------------------------------------- 存档：刷新后继续上一世 --- */

// 当前停在 screen-roll（第 N 周目待落定）——先落定并走两回合，制造一个未完成的存档
$('btn-enter').click(); flush();
stepTurn(3);
const saved = JSON.parse(storage.getItem('xiuxian.v1') || 'null');
assert(saved && saved.run && !saved.run.over, '中途存档未写入或已判定结束');
assert(saved && saved.profile && Object.keys(saved.profile.endings).length > 0, '存档里的结局图鉴为空');

const app2 = makeApp();
assert(app2.$('btn-continue').style.display === 'block', '刷新后「继续上一世」应可见');
app2.$('btn-continue').click(); flush();
assert(app2.active().id === 'screen-game', '继续上一世应回到游戏页，实际：' + app2.active().id);
assert(app2.$('hud').innerHTML.length > 0, '继续后属性面板未渲染');
const r2 = (() => {
  const a = app2;
  let steps = 0;
  while (steps++ < 400) {
    const scr = a.active();
    if (!scr || scr.id === 'screen-ending') return 'ending';
    if (scr.id !== 'screen-game') return scr.id;
    const box = a.$('result-box');
    if (box.style.display === 'block' && box.buttons().length) { box.buttons()[box.buttons().length - 1].click(); flush(); continue; }
    const btns = a.$('choices').buttons();
    if (!btns.length) { flush(); continue; }
    btns[0].click(); flush();
  }
  return 'guard';
})();
assert(r2 === 'ending', '继续的存档未能走完，停在 ' + r2);

/* ------------------------------------------------------------------ 报告 --- */

const prof = JSON.parse(storage.getItem('xiuxian.v1') || '{}').profile || {};
console.log('界面冒烟测试');
console.log('  完整周目：' + N_RUNS + '　突破操作：' + breaks + ' 次');
console.log('  结局分布：' + Object.entries(endings).map(([k, v]) => k + ' ×' + v).join('　'));
console.log('  存档图鉴：结局 ' + Object.keys(prof.endings || {}).length + '/6　成就 ' +
  Object.keys(prof.achs || {}).length + '/24　共修行 ' + (prof.runs || 0) + ' 世　待过宗门：' + ((prof.sects || []).join('、') || '无'));
if (errors.length) {
  console.error('\ní 界面问题 ' + errors.length + ' 处：');
  errors.slice(0, 30).forEach(e => console.error('  · ' + e));
  process.exit(1);
}
console.log('  ✓ 全程无异常');

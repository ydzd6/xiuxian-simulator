/**
 * 构建脚本：把 src/ 下的样式、数据、逻辑内联成单文件 index.html。
 * 用法：node build.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(ROOT, 'src', 'data');

/* ------------------------------------------------------------ 读取数据 --- */

const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.mjs')).sort();
let events = [];
const sources = [];

for (const f of files) {
  const mod = await import(pathToFileURL(path.join(DATA_DIR, f)).href);
  for (const key of Object.keys(mod)) {
    if (!key.startsWith('EVENTS_')) continue;
    const arr = mod[key];
    if (!Array.isArray(arr)) throw new Error(`${f}: ${key} 不是数组`);
    sources.push({ file: f, key, n: arr.length });
    events = events.concat(arr);
  }
}

/* ------------------------------------------------------------ 校验 --- */

const COND_KEYS = new Set(['realmMin', 'realmMax', 'gender', 'noSect', 'sect', 'luckMin', 'luckMax',
  'mindMin', 'mindMax', 'moMin', 'moMax', 'fameMin', 'fameMax', 'ageMin', 'ageMax', 'cultMin',
  'flagAll', 'flagAny', 'flagNone', 'turnMin', 'turnMax', 'chance']);
const EFF_KEYS = new Set(['cult', 'luck', 'mind', 'mo', 'fame', 'wealth', 'lifespan', 'contribution',
  'age', 'flagAdd', 'flagDel', 'sectJoin', 'sectLeave', 'partner', 'rel', 'realm', 'death', 'log', 'cultBase']);
const SECTS = ['青云剑宗', '丹霞谷', '天音阁', '万魔殿', '散修联盟', '合欢宗'];

const errors = [];
const warns = [];
const seenId = new Map();

events.forEach((e, i) => {
  const tag = e && e.id ? e.id : `#${i}`;
  if (!e || typeof e !== 'object') return errors.push(`${tag}: 不是对象`);
  if (!e.id) errors.push(`${tag}: 缺少 id`);
  if (seenId.has(e.id)) errors.push(`${tag}: id 重复`);
  seenId.set(e.id, true);
  if (!e.title) errors.push(`${tag}: 缺少 title`);
  if (!e.text || e.text.length < 40) errors.push(`${tag}: text 过短或缺失`);
  if (e.text && (e.text.length < 100 || e.text.length > 320)) warns.push(`${tag}: text 长度 ${e.text.length}`);
  if (!Array.isArray(e.choices) || e.choices.length < 2) errors.push(`${tag}: 选项少于 2 个`);
  if (e.choices && e.choices.length > 6) warns.push(`${tag}: 选项 ${e.choices.length} 个`);
  e.cond && Object.keys(e.cond).forEach(k => { if (!COND_KEYS.has(k)) errors.push(`${tag}: cond 未知字段 ${k}`); });
  (e.choices || []).forEach((c, ci) => {
    if (!c.text) errors.push(`${tag}[${ci}]: 缺少选项文字`);
    if (c.text && c.text.length > 22) warns.push(`${tag}[${ci}]: 选项过长 ${c.text.length}`);
    if (!c.result) errors.push(`${tag}[${ci}]: 缺少 result`);
    if (c.result && (c.result.length < 30 || c.result.length > 260)) warns.push(`${tag}[${ci}]: result 长度 ${c.result.length}`);
    if (!c.effect) errors.push(`${tag}[${ci}]: 缺少 effect`);
    if (c.effect) Object.keys(c.effect).forEach(k => { if (!EFF_KEYS.has(k)) errors.push(`${tag}[${ci}]: effect 未知字段 ${k}`); });
    if (c.effect && c.effect.sectJoin && !SECTS.includes(c.effect.sectJoin)) errors.push(`${tag}[${ci}]: sectJoin 未知宗门 ${c.effect.sectJoin}`);
    if (c.effect && c.effect.log && c.effect.log.length > 20) warns.push(`${tag}[${ci}]: log 偏长 ${c.effect.log.length}`);
  });
  if (e.cond && e.cond.sect) {
    for (const s of e.cond.sect) if (s !== '无' && !SECTS.includes(s)) errors.push(`${tag}: cond.sect 未知宗门 ${s}`);
  }
});

const deathCount = events.reduce((n, e) => n + (e.choices || []).filter(c => c.effect && c.effect.death).length, 0);
const repeatable = events.filter(e => e.once === false).length;

console.log('数据来源：');
sources.forEach(s => console.log(`  ${s.file} → ${s.key} × ${s.n}`));
console.log(`事件总数：${events.length}　可重复：${repeatable}　死亡选项：${deathCount}`);
if (warns.length) { console.log(`\n提示 ${warns.length} 条：`); warns.slice(0, 20).forEach(w => console.log('  · ' + w)); }
if (errors.length) {
  console.error(`\n✗ 校验失败，共 ${errors.length} 处：`);
  errors.slice(0, 60).forEach(e => console.error('  · ' + e));
  process.exit(1);
}
console.log('✓ 数据校验通过');

/* ------------------------------------------------------------ 生成 --- */

const template = fs.readFileSync(path.join(ROOT, 'src', 'template.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'src', 'style.css'), 'utf8');
let core = fs.readFileSync(path.join(ROOT, 'src', 'core.mjs'), 'utf8');
const ui = fs.readFileSync(path.join(ROOT, 'src', 'ui.js'), 'utf8');

// 内联时去掉 ESM 的 export 关键字（顶层声明会变成同一作用域的普通声明）
core = core.replace(/^export\s+/gm, '');

const json = JSON.stringify({ events }).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '');
const script = `${core}\n\n/* ===== 界面层 ===== */\n\n${ui}`;

function put(src, token, value) {
  if (src.indexOf(token) < 0) throw new Error('模板缺少占位符 ' + token);
  return src.split(token).join(value);
}

let html = put(template, '<!--STYLE-->', css);
html = put(html, '<!--DATA-->', json);
html = put(html, '<!--SCRIPT-->', script);

const out = path.join(ROOT, 'index.html');
fs.writeFileSync(out, html, 'utf8');
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log(`✓ 已生成 ${out}（${kb} KB）`);

/**
 * 数值平衡参数扫描：对若干组 TUNING 取值各跑 N 局随机策略，打印紧凑对比表。
 * 用法：node tools/sweep.mjs [每组局数]
 *
 * 目标分布（用户指定）：正常人生 20% / 爽文人生 20% / 凡人长寿 10%
 *                      普通修仙者 10% / 陨落 30% / 天魔人生 10%
 * 另外要求八个境界都有人走到，飞升约 2%。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Game, mulberry32, TUNING, BREAKTHROUGH_COST, ENDINGS, REALM_NAMES } from '../src/core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'src', 'data');

let events = [];
for (const f of fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.mjs')).sort()) {
  const mod = await import(pathToFileURL(path.join(DATA_DIR, f)).href);
  for (const k of Object.keys(mod)) if (k.startsWith('EVENTS_')) events.push(...mod[k]);
}

const N = parseInt(process.argv[2] || '1500', 10);

/** 成本表按「累计修为门槛」来设计更容易推理：cum[i] = 从凡体修到 i+1 境所需的总修为 */
const CUM = {
  A: [240, 860, 2010, 3760, 5660, 6260, 7010], // 现状
  B: [240, 860, 2010, 3500, 4600, 5600, 8000],
  C: [240, 860, 2010, 3400, 4400, 5300, 8200],
  D: [240, 860, 1900, 3200, 4200, 5100, 8000],
  E: [240, 860, 2100, 3600, 4900, 5800, 8000],
  F: [240, 860, 2010, 3300, 4300, 5400, 9000]
};

const ORDER = ['mortal', 'longlife', 'common', 'demon', 'power', 'fallen'];
const TARGET = { mortal: 10, longlife: 10, common: 20, demon: 10, power: 20, fallen: 30 };

function runOne(seed) {
  const rng = mulberry32(seed);
  const g = new Game(events, rng);
  g.roll();
  g.nextEvent();
  let guard = 0;
  while (!g.over && guard++ < 500) {
    if (g.canBreakthrough()) g.breakthrough();
    else g.choose(Math.floor(rng() * g.current.choices.length));
    if (!g.over) g.nextEvent();
  }
  return g;
}

function measure() {
  const counts = {};
  const realms = {};
  let turns = 0;
  for (let i = 0; i < N; i++) {
    const g = runOne(1000 + i * 7919);
    counts[g.ending.endingId] = (counts[g.ending.endingId] || 0) + 1;
    realms[g.s.realm] = (realms[g.s.realm] || 0) + 1;
    turns += g.turn;
  }
  const pc = {};
  let dist = 0;
  for (const id of ORDER) {
    pc[id] = (counts[id] || 0) / N * 100;
    dist += Math.abs(pc[id] - TARGET[id]);
  }
  const rp = [];
  for (let r = 0; r <= 7; r++) rp.push((realms[r] || 0) / N * 100);
  return { turns: turns / N, pc, rp, dist };
}

function applyTune(t) {
  const cum = t.cum || CUM[t.curve] || CUM.A;
  let prev = 0;
  for (let i = 0; i < 7; i++) { BREAKTHROUGH_COST[i] = cum[i] - prev; prev = cum[i]; }
  TUNING.passiveBase = t.base != null ? t.base : 14;
  TUNING.passivePerRealm = t.per != null ? t.per : 16;
  TUNING.passiveExp = t.exp != null ? t.exp : 1.35;
  TUNING.turnCap = t.cap != null ? t.cap : 48;
  TUNING.cultCapRatio = t.capRatio != null ? t.capRatio : 0.6;
  TUNING.backfireDeath = t.backfire || 0;
  TUNING.tribulationDeath = t.tribu || 0;
  TUNING.agingIsDeath = !!t.aging;
  TUNING.moAscendDemon = t.moAsc != null ? t.moAsc : 55;
  TUNING.moDemon = t.mo != null ? t.mo : 70;
  TUNING.moDemonRealm = t.moRealm != null ? t.moRealm : 3;
  TUNING.powerRealm = t.powerRealm != null ? t.powerRealm : 5;
  TUNING.powerFame = t.powerFame != null ? t.powerFame : 250;
  TUNING.longlifeAge = t.llAge != null ? t.llAge : 130;
}

const CONFIGS = [
  /* 定稿：与 src/core.mjs 里的 TUNING 默认值一致，用作回归基准（误差 3） */
  { label: '★定稿 声望185+魔念58+寿140', cum: [240, 860, 2150, 3450, 4300, 5200, 7200], powerFame: 185, mo: 58, llAge: 140 },
  { label: 'T1 声望180', cum: [240, 860, 2150, 3450, 4300, 5200, 7200], powerFame: 180, mo: 58, llAge: 140 },
  { label: 'T2 声望175', cum: [240, 860, 2150, 3450, 4300, 5200, 7200], powerFame: 175, mo: 58, llAge: 140 },
  { label: 'T3 寿135', cum: [240, 860, 2150, 3450, 4300, 5200, 7200], powerFame: 185, mo: 58, llAge: 135 },
  { label: 'T4 寿145', cum: [240, 860, 2150, 3450, 4300, 5200, 7200], powerFame: 185, mo: 58, llAge: 145 },
  { label: 'T5 魔念57', cum: [240, 860, 2150, 3450, 4300, 5200, 7200], powerFame: 185, mo: 57, llAge: 140 },
  { label: 'T6 魔念56', cum: [240, 860, 2150, 3450, 4300, 5200, 7200], powerFame: 185, mo: 56, llAge: 140 },
  { label: 'T7 声望180+寿145', cum: [240, 860, 2150, 3450, 4300, 5200, 7200], powerFame: 180, mo: 58, llAge: 145 }
];

const SHORT = { mortal: '普通', longlife: '长寿', common: '正常', demon: '天魔', power: '爽文', fallen: '陨落' };

function fmtRow(label, m) {
  const r = m.rp.map(v => v.toFixed(1).padStart(4)).join('');
  const e = ORDER.map(id => m.pc[id].toFixed(1).padStart(7)).join('');
  return label.padEnd(24) + m.turns.toFixed(1).padStart(5) + ' |' + r + '|' + e + ' ' + m.dist.toFixed(0).padStart(4);
}

const HDR = '配置'.padEnd(24) + '回合  ' + '|凡 炼 筑 金 元 神 劫 仙|' +
  ORDER.map(id => SHORT[id].padStart(6)).join('') + ' 误差';

console.log(`事件总数 ${events.length}　样本/组 ${N}`);
console.log('目标：普通10 长寿10 正常20 天魔10 爽文20 陨落30　且八境界都有人、飞升约2%');
console.log('（全部已关掉「大难不死」，寿元耗尽不算陨落）');
console.log(HDR);

const rows = [];
for (const t of CONFIGS) {
  applyTune(t);
  const m = measure();
  rows.push({ label: t.label, m });
  console.log(fmtRow(t.label, m));
}

console.log('\n按误差排序（越小越接近目标）：');
[...rows].sort((a, b) => a.m.dist - b.m.dist).forEach(x => console.log(fmtRow(x.label, x.m)));
console.log('\n境界名：' + REALM_NAMES.slice(0, 8).join('/'));

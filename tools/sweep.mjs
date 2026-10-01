/**
 * 平衡参数扫描：对若干组 TUNING 取值各跑 N 局随机策略，打印紧凑对比表。
 * 用法：node tools/sweep.mjs [每组局数]
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

const N = parseInt(process.argv[2] || '1200', 10);

const BASE_COSTS = [200, 520, 1000, 1600, 2000, 2400, 2900];

const SHAPE = {
  S1: [1, 2.6, 5, 8, 10, 12, 14.5],
  S2: [1, 2.6, 5, 7.5, 8.5, 9.5, 10.5],
  S3: [1, 2.4, 4.4, 6.4, 8, 9.2, 10.2],
  S4: [1.2, 2.8, 5, 7, 8.2, 9.2, 10]
};

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
  const pc = (id) => (counts[id] || 0) / N * 100;
  const rp = (r) => { let n = 0; for (let i = r; i <= 7; i++) n += realms[i] || 0; return n / N * 100; };
  return { turns: turns / N, rp, pc };
}

function applyTune(t) {
  const shape = SHAPE[t.shape];
  for (let i = 0; i < 7; i++) BREAKTHROUGH_COST[i] = Math.round(BASE_COSTS[i] * (t.scale || 1) * shape[i] / SHAPE.S1[i]);
  TUNING.passiveBase = t.base;
  TUNING.passivePerRealm = t.per;
  TUNING.passiveExp = t.exp;
  TUNING.turnCap = t.cap;
  TUNING.cultCapRatio = t.capRatio != null ? t.capRatio : 0.6;
}

const CONFIGS = [
  { label: 'S1 贵20%(尾重)', shape: 'S1', scale: 1.20, base: 14, per: 16, exp: 1.35, cap: 48 },
  { label: 'S2 贵20%', shape: 'S2', scale: 1.20, base: 14, per: 16, exp: 1.35, cap: 48 },
  { label: 'S2 贵35%', shape: 'S2', scale: 1.35, base: 14, per: 16, exp: 1.35, cap: 48 },
  { label: 'S2 贵50%', shape: 'S2', scale: 1.50, base: 14, per: 16, exp: 1.35, cap: 48 },
  { label: 'S3 贵35%', shape: 'S3', scale: 1.35, base: 14, per: 16, exp: 1.35, cap: 48 },
  { label: 'S3 贵50%', shape: 'S3', scale: 1.50, base: 14, per: 16, exp: 1.35, cap: 48 },
  { label: 'S3 贵65%', shape: 'S3', scale: 1.65, base: 14, per: 16, exp: 1.35, cap: 48 },
  { label: 'S4 贵50%', shape: 'S4', scale: 1.50, base: 14, per: 16, exp: 1.35, cap: 48 }
];

console.log(`样本/组 ${N}`);
console.log('配置'.padEnd(22) + '回合  化神+  渡劫+  飞升+  平民  长寿  正常  天魔  爽文  陨落');
for (const t of CONFIGS) {
  applyTune(t);
  const m = measure();
  const row = [
    m.turns.toFixed(1).padStart(5),
    m.rp(5).toFixed(1).padStart(6),
    m.rp(6).toFixed(1).padStart(6),
    m.rp(7).toFixed(1).padStart(6),
    m.pc('mortal').toFixed(1).padStart(6),
    m.pc('longlife').toFixed(1).padStart(6),
    m.pc('common').toFixed(1).padStart(6),
    m.pc('demon').toFixed(1).padStart(6),
    m.pc('power').toFixed(1).padStart(6),
    m.pc('fallen').toFixed(1).padStart(6)
  ].join(' ');
  console.log(t.label.padEnd(22) + row);
}
console.log('\n境界名：' + REALM_NAMES.slice(0, 8).join('/'));
console.log('结局名：' + ['mortal', 'longlife', 'common', 'demon', 'power', 'fallen'].map(k => k + '=' + ENDINGS[k].name).join(' '));

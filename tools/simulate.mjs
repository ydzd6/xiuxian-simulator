/**
 * 数值平衡模拟器：无界面跑 N 局，统计结局分布、境界分布、事件覆盖率。
 * 用法：node tools/simulate.mjs [局数]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Game, mulberry32, ENDINGS, REALM_NAMES, ACHIEVEMENTS } from '../src/core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'src', 'data');

let events = [];
for (const f of fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.mjs')).sort()) {
  const mod = await import(pathToFileURL(path.join(DATA_DIR, f)).href);
  for (const k of Object.keys(mod)) if (k.startsWith('EVENTS_')) events.push(...mod[k]);
}

const N = parseInt(process.argv[2] || '4000', 10);

const score = (eff) => {
  if (!eff) return 0;
  if (eff.death) return -1e6;
  let v = 0;
  v += (eff.cult || 0) * (eff.cultBase != null ? 34 : 1);
  v += (eff.mind || 0) * 4;
  v += (eff.luck || 0) * 4;
  v -= (eff.mo || 0) * 5;
  v += (eff.fame || 0) * 1.2;
  v += (eff.wealth || 0) * 0.25;
  v += (eff.lifespan || 0) * 2;
  if (eff.realm) v += 3000;
  return v;
};

function runOne(policy, seed) {
  const rng = mulberry32(seed);
  const g = new Game(events, rng);
  g.roll();
  g.nextEvent();
  let guard = 0;
  while (!g.over && guard++ < 400) {
    if (g.canBreakthrough()) {
      g.breakthrough();
    } else {
      const cs = g.current.choices;
      let idx = 0;
      if (policy === 'greedy') {
        let best = -Infinity;
        cs.forEach((c, i) => { const v = score(c.effect); if (v > best) { best = v; idx = i; } });
      } else {
        idx = Math.floor(rng() * cs.length);
      }
      g.choose(idx);
    }
    if (!g.over) g.nextEvent();
  }
  return g;
}

function report(policy) {
  const counts = {};
  const realms = {};
  const ach = {};
  let turns = 0, ageSum = 0, deaths = 0;
  const hit = new Set();
  for (let i = 0; i < N; i++) {
    const g = runOne(policy, 1000 + i * 7919);
    for (const id of Object.keys(g.seen)) if (id.indexOf('filler_') !== 0) hit.add(id);
    counts[g.ending.endingId] = (counts[g.ending.endingId] || 0) + 1;
    realms[g.s.realm] = (realms[g.s.realm] || 0) + 1;
    for (const a of g.runAchievements()) ach[a] = (ach[a] || 0) + 1;
    turns += g.turn;
    ageSum += g.s.age;
    if (g.s.deathCause) deaths++;
  }
  console.log(`\n===== 策略：${policy}　样本 ${N} =====`);
  console.log(`平均回合 ${(turns / N).toFixed(1)}　平均终龄 ${(ageSum / N).toFixed(0)}　横死率 ${(deaths / N * 100).toFixed(1)}%`);
  const order = ['mortal', 'longlife', 'common', 'demon', 'power', 'fallen'];
  console.log('结局分布：');
  for (const id of order) {
    const n = counts[id] || 0;
    const pct = n / N * 100;
    const bar = '█'.repeat(Math.round(pct / 2));
    console.log(`  ${ENDINGS[id].name.padEnd(6, '　')} ${pct.toFixed(1).padStart(5)}%  ${bar}`);
  }
  console.log('境界分布（终局）：');
  for (let r = 0; r <= 7; r++) {
    const n = realms[r] || 0;
    if (!n) continue;
    console.log(`  ${REALM_NAMES[r].padEnd(4, '　')} ${(n / N * 100).toFixed(1).padStart(5)}%`);
  }
  console.log(`事件覆盖：${hit.size} / ${events.length}`);
  const unused = events.filter(e => !hit.has(e.id));
  if (unused.length) console.log('  从未触发：' + unused.slice(0, 40).map(e => e.id).join(' ') + (unused.length > 40 ? ` …共${unused.length}` : ''));
  console.log('成就达成率（前 10 低）：');
  const low = ACHIEVEMENTS.map(a => ({ a, p: (ach[a.id] || 0) / N * 100 })).sort((x, y) => x.p - y.p).slice(0, 10);
  low.forEach(x => console.log(`  ${x.a.name.padEnd(6, '　')} ${x.p.toFixed(1).padStart(5)}%`));
}

console.log(`事件总数 ${events.length}`);
report('random');
report('greedy');

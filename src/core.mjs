/* ==========================================================================
 * 修仙模拟器 · 核心逻辑（纯逻辑，不碰 DOM，可被 Node 直接引入做平衡测试）
 * ========================================================================== */

export const REALM_NAMES = ['凡体', '炼气', '筑基', '金丹', '元婴', '化神', '渡劫', '飞升'];
export const REALM_LIFESPAN = [90, 120, 200, 400, 800, 1500, 3000, 999999];

/** 全部平衡参数集中在这里，方便 tools/simulate.mjs 做参数扫描 */
export const TUNING = {
  /* 各境界突破所需增量。由 tools/sweep.mjs 扫描定稿，对应累计门槛
   * [240, 860, 2150, 3450, 4300, 5200, 7200]。
   * 形状：中段两关（金丹 1290 / 元婴 1300）负责筛人，化神之后数值变小，
   * 但天劫惩罚与最后一道 2000 的飞升关把顶端压回 2% 左右。 */
  costs: [240, 620, 1290, 1300, 850, 900, 2000],
  /** 每回合打坐自然积累的修为基数 */
  passiveBase: 14,
  /** 每高一个境界，打坐收益增加多少 */
  passivePerRealm: 16,
  /** 打坐收益随境界增长的指数：1 为线性，>1 为越到高阶越快 */
  passiveExp: 1.35,
  /** 修为受灵根影响的指数：越小，灵根差距对最终成就的影响越温和 */
  rootExp: 0.7,
  /** 一局最多经历多少个事件 */
  turnCap: 48,
  /** 单次事件最多推进当前境界进度的比例 */
  cultCapRatio: 0.6,

  /* ---- 死亡面：决定「陨落」这一档有多厚 ---- */
  /** 走火入魔（冲关反噬）直接身死的概率 */
  backfireDeath: 0,
  /** 化神之上（含化神）冲关失败遭天劫、身死道消的概率 */
  tribulationDeath: 0,
  /** 寿元耗尽是否算「陨落」（否则按境界评正常人生等） */
  agingIsDeath: false,

  /* ---- 结局判定线：决定六档之间的此消彼长 ---- */
  /** 飞升时魔念超过多少算「天魔人生」 */
  moAscendDemon: 55,
  /** 未飞升者：魔念达到多少且境界不低于 moDemonRealm，算「天魔人生」 */
  moDemon: 58,
  moDemonRealm: 3,
  /** 未飞升者：达到这个境界即算「爽文人生」 */
  powerRealm: 5,
  /** 差一个境界但声望够高，也算「爽文人生」 */
  powerFame: 185,
  /** 筑基且活到这个岁数（但没到金丹），算「凡人长寿」 */
  longlifeAge: 140
};

export const BREAKTHROUGH_COST = TUNING.costs;

/* ---------------------------------------------------------------- 彩蛋 --- */
/* 输入这个名字的人，天地会替他做决定。不要写进任何教程里。 */

export const EASTER_NAME = '养的';

export function isChosenName(name) {
  return String(name == null ? '' : name).trim() === EASTER_NAME;
}

/** 出身综合评分：气运与道心最要紧，声望、灵石次之 */
export function originScore(o) {
  return (o.luck || 0) * 2 + (o.mind || 0) * 2 + (o.fame || 0) * 0.2 + (o.wealth || 0) * 0.02;
}

/** 最强的灵根 / 最优的出身 */
export function bestRoot() { return ROOTS.reduce((a, b) => (b.mult > a.mult ? b : a)); }
export function bestOrigin() { return ORIGINS.reduce((a, b) => (originScore(b) > originScore(a) ? b : a)); }

/** 给一个选项打分，分最高的就是「最优选项」 */
export function choiceScore(s, ch) {
  const e = (ch && ch.effect) || {};
  if (e.death) return -1e9;                       // 死路永远不是最优
  let v = 0;
  if (e.realm != null) v += (e.realm - s.realm) * 1e6;
  if (e.cult) v += e.cult * 12;
  if (e.lifespan) v += e.lifespan * 200;
  if (e.mind) v += e.mind * 40;
  if (e.luck) v += e.luck * 40;
  if (e.fame) v += e.fame * 10;
  if (e.wealth) v += e.wealth * 0.5;
  if (e.mo) v -= e.mo * 60;
  if (e.sectJoin) v += 300;
  if (e.partner) v += 500;
  if (e.contribution) v += e.contribution * 2;
  if (e.rel) for (const k in e.rel) v += e.rel[k] * 4;
  return v;
}

export function bestChoiceIndex(s, ev) {
  const list = (ev && ev.choices) || [];
  let best = 0, bestV = -Infinity;
  for (let i = 0; i < list.length; i++) {
    const v = choiceScore(s, list[i]);
    if (v > bestV) { bestV = v; best = i; }
  }
  return best;
}

export const ROOTS = [
  { name: '天灵根', mult: 1.75, weight: 2, desc: '万中无一的道种，天地灵气自来投怀' },
  { name: '变异雷灵根', mult: 1.55, weight: 4, desc: '掌雷，性烈如火，进境极快' },
  { name: '变异冰灵根', mult: 1.50, weight: 4, desc: '掌冰，心冷眼静，最宜杀伐' },
  { name: '变异剑灵根', mult: 1.50, weight: 4, desc: '生而带锋，见剑即通' },
  { name: '单灵根', mult: 1.35, weight: 12, desc: '一系精纯，百年难遇的上等资质' },
  { name: '双灵根', mult: 1.12, weight: 22, desc: '两系相济，走入内门不算难' },
  { name: '三灵根', mult: 0.95, weight: 26, desc: '资质平平，够用，也只是够用' },
  { name: '四灵根', mult: 0.82, weight: 18, desc: '杂而不精，得比别人多下三倍苦功' },
  { name: '五灵根', mult: 0.70, weight: 10, desc: '世人谓之伪灵根，修仙路上的一根草' }
];

export const ORIGINS = [
  { name: '山村孤儿', weight: 18, luck: 5, mind: 8, wealth: 0, fame: 0, mo: 0, desc: '父母死于一场不知名的瘟疫，你被村人轮流养大。', flags: ['乡野出身'] },
  { name: '没落世家子', weight: 14, luck: 0, mind: 5, wealth: 30, fame: 5, mo: 0, desc: '祖上出过金丹，如今只剩一座漏雨的老宅。', flags: ['旧族遗脉'] },
  { name: '官宦子弟', weight: 12, luck: 0, mind: -5, wealth: 60, fame: 10, mo: 0, desc: '锦衣玉食，却从没自己做过一次决定。', flags: [] },
  { name: '商贾之子', weight: 12, luck: 6, mind: -3, wealth: 90, fame: 0, mo: 0, desc: '家里开着三间铺子，你五岁就会看人脸色。', flags: [] },
  { name: '药农之子', weight: 12, luck: 3, mind: 6, wealth: 10, fame: 0, mo: 0, desc: '跟着爹在山里认了十年草，能闻出药性。', flags: ['识得百草'] },
  { name: '弃婴，被老道收养', weight: 8, luck: 8, mind: 10, wealth: 0, fame: 0, mo: 0, desc: '一个邋遢老道在雪地里把你捡回了破观。', flags: ['玄虚门人'] },
  { name: '边军之后', weight: 10, luck: -3, mind: 4, wealth: 5, fame: 3, mo: 0, desc: '父亲死在北境，留下的刀比你人还高。', flags: ['将门血性'] },
  { name: '皇族旁支', weight: 4, luck: -5, mind: -8, wealth: 150, fame: 25, mo: 0, desc: '姓着国姓，却排不上族谱第三页。', flags: ['天家血脉'] },
  { name: '街头乞儿', weight: 10, luck: 10, mind: 6, wealth: -5, fame: 0, mo: 0, desc: '你在城里活了十一年，靠的是眼力和快腿。', flags: ['市井混大'] }
];

export const SECT_NAMES = ['青云剑宗', '丹霞谷', '天音阁', '万魔殿', '散修联盟', '合欢宗'];

/* ------------------------------------------------------------------ 结局 --- */

export const ENDINGS = {
  fallen: { id: 'fallen', name: '陨落', tier: '死亡', seal: '殁', color: '#6a6a6a', judge: '道途止于半山' },
  mortal: { id: 'mortal', name: '普通修仙者', tier: '普通', seal: '凡', color: '#8a7a63', judge: '来过，活过，然后归于尘土' },
  longlife: { id: 'longlife', name: '凡人长寿', tier: '长寿', seal: '寿', color: '#6f8b6a', judge: '一辈子没修出什么名堂，却活得很长' },
  common: { id: 'common', name: '正常人生', tier: '正常', seal: '道', color: '#5a7a9a', judge: '有一番修行，也有一场归宿' },
  demon: { id: 'demon', name: '天魔人生', tier: '魔道', seal: '魔', color: '#7a3b4a', judge: '走到极高处，只是那人已不再是你' },
  power: { id: 'power', name: '爽文人生', tier: '爽文', seal: '仙', color: '#9a7b2f', judge: '从泥里一路杀到天门之前' }
};

function honorTitle(s) {
  const r = s.realm;
  if (s.mo >= 65 && r >= 4) return r >= 6 ? '万魔之尊' : '血海魔君';
  switch (r) {
    case 0: return '山野凡人';
    case 1: return '炼气散修';
    case 2: return s.sect ? '外门筑基' : '筑基野修';
    case 3: return '金丹真人';
    case 4: return '元婴老祖';
    case 5: return '化神大能';
    case 6: return '渡劫真仙';
    default: return '飞升仙尊';
  }
}

/** 结算：返回 { endingId, title, verdict } */
export function judge(s, opts) {
  opts = opts || {};
  const ascended = !!opts.ascended || s.realm >= 7;
  let id;
  if (s.deathCause) {
    id = 'fallen';
  } else if (ascended) {
    id = s.mo >= TUNING.moAscendDemon ? 'demon' : 'power';
  } else if (s.mo >= TUNING.moDemon && s.realm >= TUNING.moDemonRealm) {
    id = 'demon';
  } else if (s.realm >= TUNING.powerRealm || (s.realm >= TUNING.powerRealm - 1 && s.fame >= TUNING.powerFame)) {
    id = 'power';
  } else if (s.realm >= 3) {
    id = 'common';
  } else if (s.realm >= 2 && s.age >= TUNING.longlifeAge) {
    id = 'longlife';
  } else {
    id = 'mortal';
  }
  let title;
  if (id === 'fallen') {
    title = '身死道消';
  } else if (id === 'longlife') {
    title = s.age >= 180 ? '百岁山民' : '一世凡人';
  } else if (id === 'mortal') {
    title = s.realm >= 2 ? '碌碌小修' : (s.age >= 80 ? '一世凡人' : '半途而废');
  } else {
    title = honorTitle(s);
  }
  if (s.chosen && !s.deathCause) title = '天命所归';   // 彩蛋专属称号
  const e = ENDINGS[id];
  return { endingId: id, title, verdict: e.judge };
}

/* ---------------------------------------------------------------- 成就 --- */

export const ACHIEVEMENTS = [
  { id: 'a_first', name: '初入仙途', desc: '第一次踏入炼气' },
  { id: 'a_root_top', name: '灵根天骄', desc: '测出天灵根' },
  { id: 'a_root_low', name: '五行俱全', desc: '测出五灵根' },
  { id: 'a_sect', name: '有宗可依', desc: '拜入六大宗门之一' },
  { id: 'a_six', name: '六道皆历', desc: '六家宗门全都待过（跨周目累计）' },
  { id: 'a_fame', name: '名动一方', desc: '声望达到 300' },
  { id: 'a_rich', name: '富甲一方', desc: '灵石超过 1000' },
  { id: 'a_gold', name: '金丹大道', desc: '结成金丹' },
  { id: 'a_baby', name: '元婴出窍', desc: '破入元婴' },
  { id: 'a_spirit', name: '化神之境', desc: '踏入化神' },
  { id: 'a_tribu', name: '渡劫临身', desc: '步入渡劫' },
  { id: 'a_ascend', name: '白日飞升', desc: '破开天门，飞升而去' },
  { id: 'a_partner', name: '道侣在侧', desc: '与人结为道侣' },
  { id: 'a_alone', name: '孤身问道', desc: '未结道侣而达化神' },
  { id: 'a_demon', name: '一念成魔', desc: '魔念达到 80' },
  { id: 'a_save', name: '悬崖勒马', desc: '魔念曾过 45，最终压回 20 以下' },
  { id: 'a_long', name: '长命百岁', desc: '活到一百岁' },
  { id: 'a_die', name: '身死道消', desc: '死在了路上' },
  { id: 'a_mortal_end', name: '平凡一生', desc: '得到「普通修仙者」结局' },
  { id: 'a_power_end', name: '爽文主角', desc: '得到「爽文人生」结局' },
  { id: 'a_demon_end', name: '魔道至尊', desc: '得到「天魔人生」结局' },
  { id: 'a_long_end', name: '人瑞', desc: '得到「凡人长寿」结局' },
  { id: 'a_kind', name: '道心澄明', desc: '结局时道心不低于 80' },
  { id: 'a_iron', name: '杀伐果断', desc: '结局时魔念不低于 60 且未堕魔' },
  { id: 'a_chosen', name: '天命所归', desc: '有一个名字，天地格外偏爱' }
];

/* -------------------------------------------------------------- 工具 --- */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ri = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));

export function weightedPick(list, rng) {
  let total = 0;
  for (const it of list) total += it.weight;
  let r = rng() * total;
  for (const it of list) {
    r -= it.weight;
    if (r <= 0) return it;
  }
  return list[list.length - 1];
}

export function condMatch(c, s, turn) {
  if (!c) return true;
  if (c.realmMin != null && s.realm < c.realmMin) return false;
  if (c.realmMax != null && s.realm > c.realmMax) return false;
  if (c.gender && s.gender !== c.gender) return false;
  if (c.noSect && s.sect) return false;
  if (c.sect && !c.sect.includes(s.sect || '无')) return false;
  if (c.luckMin != null && s.luck < c.luckMin) return false;
  if (c.luckMax != null && s.luck > c.luckMax) return false;
  if (c.mindMin != null && s.mind < c.mindMin) return false;
  if (c.mindMax != null && s.mind > c.mindMax) return false;
  if (c.moMin != null && s.mo < c.moMin) return false;
  if (c.moMax != null && s.mo > c.moMax) return false;
  if (c.fameMin != null && s.fame < c.fameMin) return false;
  if (c.fameMax != null && s.fame > c.fameMax) return false;
  if (c.ageMin != null && s.age < c.ageMin) return false;
  if (c.ageMax != null && s.age > c.ageMax) return false;
  if (c.cultMin != null && s.cult < c.cultMin) return false;
  if (c.flagAll && !c.flagAll.every(f => s.flags.includes(f))) return false;
  if (c.flagAny && !c.flagAny.some(f => s.flags.includes(f))) return false;
  if (c.flagNone && c.flagNone.some(f => s.flags.includes(f))) return false;
  if (c.turnMin != null && turn < c.turnMin) return false;
  if (c.turnMax != null && turn > c.turnMax) return false;
  return true;
}

/* -------------------------------------------------- 修为增益的软上限 --- */
/** 单次事件最多推进当前境界进度的一部分，避免一个事件直接跳过一整个大境界 */
export function cultGain(s, raw, rootPower) {
  if (raw <= 0) return raw;
  const cap = Math.max(80, Math.round(BREAKTHROUGH_COST[s.realm] * TUNING.cultCapRatio));
  return Math.min(Math.round(raw * rootPower), cap);
}

/** 每回合天然而然的进境（时间流逝带来的积累） */
export function passiveGain(s) {
  const base = TUNING.passiveBase + TUNING.passivePerRealm * Math.pow(s.realm, TUNING.passiveExp);
  return Math.round(base * Math.pow(s.rootMult, TUNING.rootExp));
}

export function rootPower(s) {
  return Math.pow(s.rootMult, TUNING.rootExp);
}

export function applyEffect(s, eff, rng, notes) {
  if (!eff) return notes;
  const push = (label, v) => { if (v) notes.push({ label, v }); };

  if (eff.cult) {
    const g = cultGain(s, eff.cult, rootPower(s));
    s.cult = Math.max(0, s.cult + g);
    push('修为', g);
  }
  if (eff.luck) { s.luck = clamp(s.luck + eff.luck, 0, 100); push('气运', eff.luck); }
  if (eff.mind) { s.mind = clamp(s.mind + eff.mind, 0, 100); push('道心', eff.mind); }
  if (eff.mo) { s.mo = clamp(s.mo + eff.mo, 0, 100); if (s.mo > (s.moPeak || 0)) s.moPeak = s.mo; push('魔念', eff.mo); }
  if (eff.fame) { s.fame = Math.max(0, s.fame + eff.fame); push('声望', eff.fame); }
  if (eff.wealth) { s.wealth += eff.wealth; push('灵石', eff.wealth); }
  if (eff.lifespan) { s.lifespan = Math.max(s.age + 1, s.lifespan + eff.lifespan); push('寿元', eff.lifespan); }
  if (eff.contribution) { s.contribution = Math.max(0, s.contribution + eff.contribution); push('宗门贡献', eff.contribution); }
  if (eff.flagAdd) for (const f of eff.flagAdd) if (!s.flags.includes(f)) s.flags.push(f);
  if (eff.flagDel) s.flags = s.flags.filter(f => !eff.flagDel.includes(f));
  if (eff.rel) {
    s.rels = s.rels || {};
    for (const k of Object.keys(eff.rel)) {
      s.rels[k] = clamp((s.rels[k] || 0) + eff.rel[k], 0, 100);
      push(k, eff.rel[k]);
    }
  }
  if (eff.partner) { s.partner = eff.partner; s.flags.push('已结道侣'); notes.push({ label: '道侣', text: eff.partner }); }
  if (eff.sectJoin) { s.sect = eff.sectJoin; s.flags.push('已入宗门'); notes.push({ label: '宗门', text: eff.sectJoin }); }
  if (eff.sectLeave) { s.sect = null; s.contribution = 0; notes.push({ label: '宗门', text: '离宗' }); }
  if (eff.realm != null && eff.realm > s.realm) {
    s.realm = eff.realm;
    s.lifespan = Math.max(s.lifespan, REALM_LIFESPAN[s.realm]);
    notes.push({ label: '境界', text: REALM_NAMES[s.realm] });
  }
  if (eff.death) s.deathCause = eff.death;
  return notes;
}

/* ==================================================================== */

export class Game {
  constructor(events, rng) {
    this.events = events;
    this.rng = rng || Math.random;
    this.reset();
  }

  reset() {
    this.s = null;
    this.seen = {};
    this.turn = 0;
    this.chronicle = [];
    this.current = null;
    this.lastResult = null;
    this.over = false;
    this.ending = null;
    this.ascended = false;
    this.rerolled = false;
    this.log = [];
  }

  /* --- 开局随机（彩蛋传入 chosen 时直接给最强配置） --- */
  roll(gender, chosen) {
    const rng = this.rng;
    const root = chosen ? bestRoot() : weightedPick(ROOTS, rng);
    const origin = chosen ? bestOrigin() : weightedPick(ORIGINS, rng);
    const age = chosen ? 12 : ri(rng, 12, 16);
    const jLuck = chosen ? 8 : ri(rng, -8, 8);
    const jMind = chosen ? 8 : ri(rng, -8, 8);
    this.s = {
      name: '无名',
      gender: gender || (rng() < 0.5 ? '男' : '女'),
      origin: origin.name,
      originDesc: origin.desc,
      root: root.name,
      rootMult: root.mult,
      rootDesc: root.desc,
      realm: 0,
      cult: 0,
      age,
      lifespan: REALM_LIFESPAN[0],
      luck: clamp(50 + (origin.luck || 0) + jLuck, 5, 95),
      mind: clamp(50 + (origin.mind || 0) + jMind, 5, 95),
      mo: 0,
      fame: Math.max(0, origin.fame || 0),
      wealth: origin.wealth || 0,
      sect: null,
      contribution: 0,
      flags: (origin.flags || []).slice(),
      rels: {},
      partner: null,
      deathCause: null,
      chosen: !!chosen,
      rootName: root.name,
      originName: origin.name
    };
    return this.s;
  }

  reroll() {
    if (this.rerolled) return false;
    this.rerolled = true;
    return true;
  }

  /* --- 回合 --- */
  defaultYears() {
    const r = this.s.realm;
    return ri(this.rng, 2, 4) + Math.floor(r * 0.5);
  }

  pickEvent() {
    const s = this.s, rng = this.rng;
    // 关键事件：已入炼气却还没拜宗，优先推择宗
    if (!s.sect && s.realm >= 1 && !this.seen['d01_13']) {
      const key = this.events.find(e => e.id === 'd01_13');
      if (key) return key;
    }
    const pool = [];
    for (const e of this.events) {
      if (e.once !== false && this.seen[e.id]) continue;
      if (this.lastEventId === e.id) continue;
      if (!condMatch(e.cond, s, this.turn + 1)) continue;
      if (e.cond && e.cond.chance != null && rng() > e.cond.chance) continue;
      pool.push(e);
    }
    if (!pool.length) return this.filler();
    return weightedPick(pool, rng);
  }

  filler() {
    return {
      id: 'filler_' + (this.turn % 3),
      title: '静修',
      once: false,
      text: '山中无岁月。你在洞府里坐了一段日子，灵气一进一出，如溪水过石。',
      choices: [
        { text: '继续闭关', effect: { cultBase: 1 }, result: '你把心思收得更紧了些，修为长了一线。' },
        { text: '推门出去走走', effect: { luck: 3, cultBase: 0.4 }, result: '山风扑面，你在溪边站了很久，心里松快了些。' }
      ]
    };
  }

  nextEvent() {
    if (this.over) return null;
    const ev = this.pickEvent();
    this.current = ev;
    this.lastResult = null;
    this.seen[ev.id] = (this.seen[ev.id] || 0) + 1;
    this.lastEventId = ev.id;
    return ev;
  }

  /** 选择后结算；返回 { result, notes, ended } */
  choose(index) {
    const ev = this.current;
    const s = this.s;
    const chosen = this.chosen;
    if (chosen) index = bestChoiceIndex(s, ev);          // 彩蛋：你只会看到最优的那条路
    const ch = ev.choices[index] || ev.choices[0];
    let eff = ch.effect || {};
    if (chosen && eff.death) eff = Object.assign({}, eff, { death: null });
    const notes = [];

    // 岁月本身的积累
    const pg = passiveGain(s);
    if (pg > 0) { s.cult += pg; }

    // 静修类事件的修为随境界水涨船高
    if (eff.cultBase != null) {
      const step = TUNING.passiveBase + TUNING.passivePerRealm * Math.pow(s.realm, TUNING.passiveExp);
      const raw = Math.round(eff.cultBase * step * 1.6 * rootPower(s));
      applyEffect(s, Object.assign({}, eff, { cult: raw, cultBase: undefined }), this.rng, notes);
    } else {
      applyEffect(s, eff, this.rng, notes);
    }
    if (pg > 0) notes.unshift({ label: '岁月积累', v: pg });

    this.chronicle.push({ age: s.age, event: ev.title, choice: ch.text, log: eff.log || '' });

    const years = eff.age != null ? eff.age : this.defaultYears();
    s.age += Math.max(0, years);
    s.age = Math.round(s.age);
    this.turn++;

    this.lastResult = { result: ch.result, notes };

    // 彩蛋：修为永远够用，境界自己往上走
    if (chosen) {
      if (s.realm <= 6 && s.cult < BREAKTHROUGH_COST[s.realm]) s.cult = BREAKTHROUGH_COST[s.realm];
      let up = 0;
      while (s.realm <= 6 && s.cult >= BREAKTHROUGH_COST[s.realm]) {
        s.cult -= BREAKTHROUGH_COST[s.realm];
        s.realm += 1; up += 1;
        s.fame += 8 * s.realm;
        s.lifespan = Math.max(s.lifespan, REALM_LIFESPAN[s.realm]);
        notes.push({ label: '境界', text: REALM_NAMES[s.realm] });
        this.chronicle.push({ age: s.age, event: '天授', choice: '破入' + REALM_NAMES[s.realm], log: '破入' + REALM_NAMES[s.realm] });
      }
      if (up) {
        this.lastResult.result = ch.result + '\n\n【天命】你只是顺着心意走了一步，天地却替你推开了一扇门——' +
          REALM_NAMES[s.realm] + '。';
      }
    }

    // 寿元耗尽既可以按境界评结局，也可以直接算「陨落」（由 TUNING.agingIsDeath 决定）
    if (!s.deathCause && TUNING.agingIsDeath && s.age >= s.lifespan) s.deathCause = '寿元耗尽';

    if (s.deathCause) {
      this.chronicle.push({ age: s.age, event: '陨落', choice: s.deathCause, log: s.deathCause });
      this.finish(false);
    } else if (s.realm >= 7) {
      this.ascended = true;
      this.finish(true);
    } else if (s.age >= s.lifespan) {
      this.finish(false, '寿元耗尽');
    } else if (this.turn >= TUNING.turnCap) {
      this.finish(false, '大限将至');
    }
    return { result: this.lastResult, ended: this.over };
  }

  canBreakthrough() {
    const s = this.s;
    return !this.over && s.realm <= 6 && s.cult >= BREAKTHROUGH_COST[s.realm];
  }

  breakthroughChance() {
    const s = this.s;
    // 化神之后是应天劫：每一道都难过，失败要拿寿元去填
    const heaven = s.realm >= 5 ? 0.22 : 0;
    let p = 0.40 + s.mind / 280 + s.luck / 400 + (s.rootMult - 1) * 0.15 - s.mo / 260 - s.realm * 0.05 - heaven;
    return clamp(p, 0.08, 0.93);
  }

  /** 突破会消耗一个回合 */
  breakthrough() {
    const s = this.s;
    const cost = BREAKTHROUGH_COST[s.realm];
    const p = this.breakthroughChance();
    const ok = this.chosen ? true : this.rng() < p;
    const notes = [];
    let text;
    if (ok) {
      s.cult = Math.max(0, s.cult - cost);
      s.realm += 1;
      s.fame += 8 * s.realm;
      s.lifespan = Math.max(s.lifespan, REALM_LIFESPAN[s.realm]);
      text = '灵气自百会灌入，周身经脉一齐轰鸣——你破了' + REALM_NAMES[s.realm] + '。';
      notes.push({ label: '境界', text: REALM_NAMES[s.realm] });
      notes.push({ label: '寿元上限', v: REALM_LIFESPAN[s.realm] - REALM_LIFESPAN[s.realm - 1] });
      this.chronicle.push({ age: s.age, event: '突破', choice: '破入' + REALM_NAMES[s.realm], log: '破入' + REALM_NAMES[s.realm] });
    } else {
      const bad = this.rng() < 0.3;
      s.cult = Math.round(s.cult * (bad ? 0.55 : 0.75));
      s.lifespan = Math.max(s.age + 1, s.lifespan - (bad ? 30 : 12));
      s.mo = clamp(s.mo + (bad ? 12 : 5), 0, 100);
      s.mind = clamp(s.mind - (bad ? 8 : 3), 0, 100);
      text = bad
        ? '真气冲关不成，反噬而上，你一口血喷在蒲团上，经脉里像有针在走。'
        : '只差一线。灵气在关口上散了，你睁开眼，天已经亮了三次。';
      notes.push({ label: '修为', v: -Math.round(cost * 0.25) });
      notes.push({ label: '魔念', v: bad ? 12 : 5 });
      this.chronicle.push({ age: s.age, event: '突破失败', choice: bad ? '走火入魔' : '冲关未成', log: bad ? '冲关反噬' : '冲关未成' });
      // 走火入魔 / 天劫：冲关失败也可能把命留在这道关口上
      if (bad && this.rng() < TUNING.backfireDeath) {
        s.deathCause = '冲关反噬';
        text += ' 这一口血再没止住——你的道途断在了这道关口上。';
      } else if (s.realm >= 5 && this.rng() < TUNING.tribulationDeath) {
        s.deathCause = '天劫加身';
        text += ' 天雷过了七道，第八道落下时，你没有再站起来。';
      }
    }
    s.age += this.defaultYears();
    this.turn++;
    s.cult += passiveGain(s);
    this.lastResult = { result: text, notes };
    if (!s.deathCause && TUNING.agingIsDeath && s.age >= s.lifespan) s.deathCause = '寿元耗尽';
    if (s.deathCause) {
      this.chronicle.push({ age: s.age, event: '陨落', choice: s.deathCause, log: s.deathCause });
      this.finish(false);
    } else if (s.age >= s.lifespan) {
      this.finish(false, '寿元耗尽');
    } else if (this.turn >= TUNING.turnCap) {
      this.finish(false, '大限将至');
    }
    return { result: this.lastResult, ended: this.over };
  }

  /** 彩蛋模式：开局名字命中 EASTER_NAME 时由界面层打开 */
  get chosen() { return !!(this.s && this.s.chosen); }

  finished() { return this.over; }

  finish(ascended, reason) {
    this.over = true;
    const j = judge(this.s, { ascended: ascended || this.ascended });
    this.ending = Object.assign({}, j, { reason: reason || (this.s.deathCause || '') });
  }

  /** 汇总本局达成的成就 id（跨周目统计由外层负责） */
  runAchievements() {
    const s = this.s, out = [];
    const has = id => out.push(id);
    if (s.realm >= 1) has('a_first');
    if (s.root === '天灵根') has('a_root_top');
    if (s.root === '五灵根') has('a_root_low');
    if (s.sect) has('a_sect');
    if (s.fame >= 300) has('a_fame');
    if (s.wealth >= 1000) has('a_rich');
    if (s.realm >= 3) has('a_gold');
    if (s.realm >= 4) has('a_baby');
    if (s.realm >= 5) has('a_spirit');
    if (s.realm >= 6) has('a_tribu');
    if (this.ascended) has('a_ascend');
    if (s.partner) has('a_partner');
    if (!s.partner && s.realm >= 5) has('a_alone');
    if (s.mo >= 80) has('a_demon');
    if ((s.moPeak || 0) >= 45 && s.mo < 20) has('a_save');
    if (s.age >= 100) has('a_long');
    if (s.deathCause) has('a_die');
    if (this.ending) {
      if (this.ending.endingId === 'mortal') has('a_mortal_end');
      if (this.ending.endingId === 'power') has('a_power_end');
      if (this.ending.endingId === 'demon') has('a_demon_end');
      if (this.ending.endingId === 'longlife') has('a_long_end');
    }
    if (s.mind >= 80) has('a_kind');
    if (s.mo >= 60 && s.mo < 70) has('a_iron');
    if (s.chosen) has('a_chosen');
    return out;
  }
}

export function createGame(events, rng) { return new Game(events, rng); }

/** 供模拟器使用的简易可复现随机数 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

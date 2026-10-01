/* ==========================================================================
 * 修仙模拟器 · 界面与存档层
 * ========================================================================== */

(function () {
  'use strict';

  var DATA = JSON.parse(document.getElementById('game-data').textContent);
  var EVENTS = DATA.events;
  var SAVE_KEY = 'xiuxian.v1';
  var GAME = null;
  var RNG = Math.random;

  /* ------------------------------------------------------------ 存档 --- */

  var profile = { endings: {}, achs: {}, sects: [], runs: 0, wins: {} };

  function loadProfile() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && o.profile) {
          profile = Object.assign(profile, o.profile);
          profile.sects = profile.sects || [];
        }
      }
    } catch (e) { /* 忽略 */ }
  }
  function saveProfile() {
    try {
      var o = readRaw() || {};
      o.profile = profile;
      localStorage.setItem(SAVE_KEY, JSON.stringify(o));
    } catch (e) { }
  }
  function readRaw() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; }
  }
  function saveRun() {
    if (!GAME || !GAME.s) return;
    try {
      var o = readRaw() || {};
      o.run = {
        s: GAME.s, seen: GAME.seen, turn: GAME.turn, chronicle: GAME.chronicle,
        over: GAME.over, ending: GAME.ending, ascended: GAME.ascended,
        rerolled: GAME.rerolled, lastEventId: GAME.lastEventId || null,
        currentId: GAME.current ? GAME.current.id : null
      };
      o.profile = profile;
      localStorage.setItem(SAVE_KEY, JSON.stringify(o));
    } catch (e) { }
  }
  function clearRun() {
    try {
      var o = readRaw();
      if (o) { delete o.run; localStorage.setItem(SAVE_KEY, JSON.stringify(o)); }
    } catch (e) { }
  }

  /* ------------------------------------------------------------ 工具 --- */

  function $(id) { return document.getElementById(id); }
  function show(id) {
    var list = document.querySelectorAll('.screen');
    for (var i = 0; i < list.length; i++) list[i].classList.remove('on');
    $(id).classList.add('on');
    window.scrollTo(0, 0);
  }
  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function sign(n) { return (n > 0 ? '+' : '') + n; }

  /* --------------------------------------------------------- 墨点粒子 --- */

  function inkFall() {
    var box = $('inkfall');
    var n = window.innerWidth < 420 ? 12 : 18;
    var html = '';
    for (var i = 0; i < n; i++) {
      var size = (2 + Math.random() * 6).toFixed(1);
      html += '<i style="left:' + (Math.random() * 100).toFixed(1) + 'vw;width:' + size + 'px;height:' + size +
        'px;animation-duration:' + (11 + Math.random() * 14).toFixed(1) + 's;animation-delay:-' +
        (Math.random() * 20).toFixed(1) + 's"></i>';
    }
    box.innerHTML = html;
  }

  /* --------------------------------------------------------- 打字机 --- */

  var typer = null;
  function typewriter(el, text, done) {
    if (typer) { clearInterval(typer.timer); typer = null; }
    el.innerHTML = '';
    var i = 0;
    var span = document.createElement('span');
    var cur = document.createElement('span');
    cur.className = 'cursor';
    cur.textContent = '｜';
    el.appendChild(span);
    el.appendChild(cur);
    var speed = window.innerWidth < 420 ? 22 : 18;
    var state = { timer: null };
    typer = state;
    state.skip = function () {
      clearInterval(state.timer);
      span.textContent = text;
      cur.remove();
      typer = null;
      if (done) done();
    };
    state.timer = setInterval(function () {
      i += 2;
      span.textContent = text.slice(0, i);
      if (i >= text.length) {
        clearInterval(state.timer);
        cur.remove();
        typer = null;
        if (done) done();
      }
    }, speed);
  }
  function skipTyping() { if (typer) { typer.skip(); return true; } return false; }

  /* --------------------------------------------------------- 属性面板 --- */

  function hudHTML(s) {
    var cost = BREAKTHROUGH_COST[s.realm] || 1;
    var pct = s.realm >= 7 ? 100 : Math.min(100, Math.round(s.cult / cost * 100));
    var chips = [];
    if (s.chosen) chips.push('<span class="chip gold"><b>天命</b>所归</span>');
    chips.push('<span class="chip"><b>灵根</b>' + esc(s.root) + '</span>');
    chips.push('<span class="chip"><b>出身</b>' + esc(s.origin) + '</span>');
    chips.push('<span class="chip"><b>气运</b>' + s.luck + '</span>');
    chips.push('<span class="chip"><b>道心</b>' + s.mind + '</span>');
    if (s.mo > 0) chips.push('<span class="chip warn"><b>魔念</b>' + s.mo + '</span>');
    chips.push('<span class="chip"><b>声望</b>' + s.fame + '</span>');
    chips.push('<span class="chip"><b>灵石</b>' + s.wealth + '</span>');
    if (s.sect) chips.push('<span class="chip"><b>宗门</b>' + esc(s.sect) + (s.contribution ? '·' + s.contribution : '') + '</span>');
    else chips.push('<span class="chip"><b>宗门</b>无</span>');
    if (s.partner) chips.push('<span class="chip"><b>道侣</b>' + esc(s.partner) + '</span>');
    var rels = s.rels || {};
    for (var k in rels) {
      if (rels[k] >= 40) chips.push('<span class="chip"><b>' + esc(k) + '</b>' + rels[k] + '</span>');
    }
    return '' +
      '<div class="hud-top">' +
      '<span class="hud-name">' + esc(s.name) + '</span>' +
      '<span class="hud-realm">' + REALM_NAMES[s.realm] + '</span>' +
      '<span class="hud-age">' + s.age + ' 岁 · 寿元 ' + (s.lifespan >= 99999 ? '无尽' : s.lifespan) + '</span>' +
      '</div>' +
      (s.realm >= 7 ? '' : '<div class="cultbar"><i style="width:' + pct + '%"></i></div>') +
      '<div class="chips">' + chips.join('') + '</div>';
  }

  function renderHUD() {
    $('hud').innerHTML = hudHTML(GAME.s);
  }

  /* ------------------------------------------------------------ 流程 --- */

  function boot() {
    loadProfile();
    inkFall();
    bindTitle();
    var raw = readRaw();
    if (raw && raw.run && !raw.run.over) {
      $('btn-continue').style.display = 'block';
      $('continue-info').textContent = raw.run.s.name + ' · ' + REALM_NAMES[raw.run.s.realm] + ' · ' + raw.run.s.age + ' 岁';
      $('continue-info').style.display = 'block';
    }
    if (Object.keys(profile.endings).length) {
      $('btn-gallery').style.display = 'block';
    }
    $('stat-line').textContent = profile.runs
      ? '已修行 ' + profile.runs + ' 世 · 已解锁结局 ' + Object.keys(profile.endings).length + ' / 6'
      : '一世一轮回，结局六种';
  }

  var gender = '男';
  function bindTitle() {
    $('btn-male').onclick = function () { gender = '男'; $('btn-male').classList.add('sel'); $('btn-female').classList.remove('sel'); };
    $('btn-female').onclick = function () { gender = '女'; $('btn-female').classList.add('sel'); $('btn-male').classList.remove('sel'); };
    $('btn-start').onclick = function () {
      var nm = ($('name-input').value || '').trim();
      if (!nm) { toast('请先取一个名字'); return; }
      if (nm.length > 8) { toast('名字太长，取个短些的'); return; }
      runAch = {}; endingCounted = false;
      GAME = new Game(EVENTS, RNG);
      GAME.roll(gender);
      GAME.s.name = nm;
      GAME.s.chosen = isChosenName(nm);
      show('screen-roll');
      renderRoll();
      if (GAME.s.chosen) toast('天 命 所 归');
    };
    $('btn-continue').onclick = function () {
      var raw = readRaw();
      if (!raw || !raw.run) return;
      runAch = {}; endingCounted = !!raw.run.over;
      GAME = new Game(EVENTS, RNG);
      var r = raw.run;
      GAME.s = r.s; GAME.seen = r.seen || {}; GAME.turn = r.turn || 0;
      GAME.chronicle = r.chronicle || []; GAME.over = !!r.over;
      GAME.ending = r.ending || null; GAME.ascended = !!r.ascended;
      GAME.s.chosen = !!GAME.s.chosen || isChosenName(GAME.s.name);
      GAME.rerolled = true; GAME.lastEventId = r.lastEventId || null;
      if (GAME.over) { renderEnding(); show('screen-ending'); return; }
      if (r.currentId) {
        var ev = EVENTS.filter(function (e) { return e.id === r.currentId; })[0];
        GAME.current = ev || GAME.nextEvent();
      } else {
        GAME.nextEvent();
      }
      show('screen-game');
      renderTurn();
    };
    $('btn-gallery').onclick = function () { renderGallery(); show('screen-gallery'); };
    $('btn-gal-back').onclick = function () { boot(); show('screen-title'); };
    $('btn-share-back').onclick = function () { show('screen-ending'); };
    $('btn-share').onclick = function () { show('screen-share'); };
    $('name-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('btn-start').click(); });
  }

  function renderRoll() {
    var s = GAME.s;
    $('roll-root').textContent = s.root;
    $('roll-root-desc').textContent = s.rootDesc + '（修行速度 ×' + s.rootMult.toFixed(2) + '）';
    $('roll-origin').textContent = s.origin;
    $('roll-origin-desc').textContent = s.originDesc;
    $('roll-age').textContent = s.age + ' 岁 · 气运 ' + s.luck + ' · 道心 ' + s.mind;
    $('btn-reroll').style.display = GAME.rerolled ? 'none' : 'block';
    var chosen = !!s.chosen;
    $('chosen-tip').style.display = chosen ? 'block' : 'none';
    $('reroll-note').textContent = chosen
      ? '天地认得这个名字——每道门都只会为你留一条路。'
      : (GAME.rerolled ? '命数已定，重来不得。' : '一生只有一次改命的机会。');
  }

  function bindRoll() {
    $('btn-reroll').onclick = function () {
      if (!GAME.reroll()) return;
      var nm = GAME.s.name, g = GAME.s.gender;
      GAME.roll(g);
      GAME.s.name = nm;
      GAME.s.chosen = isChosenName(nm);
      renderRoll();
      toast('重开一世');
    };
    $('btn-enter').onclick = function () {
      if (!GAME.rerolled) GAME.rerolled = true;
      GAME.turn = 0;
      GAME.nextEvent();
      show('screen-game');
      renderTurn();
    };
  }

  function renderTurn() {
    saveRun();
    renderHUD();
    var ev = GAME.current;
    var s = GAME.s;
    $('event-title').textContent = ev.title;
    $('event-turn').textContent = '第 ' + (GAME.turn + 1) + ' 事 · ' + s.age + ' 岁';
    $('choices').innerHTML = '';
    $('result-box').innerHTML = '';
    $('result-box').style.display = 'none';
    $('event-choices').style.display = 'block';

    typewriter($('event-text'), ev.text, function () { buildChoices(ev); });

    var bt = $('btn-breakthrough');
    if (GAME.s.chosen) {
      bt.style.display = 'none';   // 彩蛋：境界不需要自己破
    } else if (GAME.canBreakthrough()) {
      bt.style.display = 'block';
      bt.textContent = '闭关突破 · 破入' + REALM_NAMES[s.realm + 1] + '（成功率约 ' + Math.round(GAME.breakthroughChance() * 100) + '%）';
      bt.disabled = false;
    } else {
      bt.style.display = 'block';
      bt.disabled = true;
      var need = BREAKTHROUGH_COST[s.realm] || 0;
      bt.textContent = s.realm >= 7 ? '已至飞升之境' : '修为未足（' + s.cult + ' / ' + need + '）';
    }
  }

  function buildChoices(ev) {
    var box = $('choices');
    var chosen = !!(GAME.s && GAME.s.chosen);
    var only = chosen ? bestChoiceIndex(GAME.s, ev) : -1;
    var hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = chosen ? '— 天意只留下这一条路 —' : '— 你要怎么做 —';
    box.appendChild(hint);
    ev.choices.forEach(function (c, i) {
      if (chosen && i !== only) return;
      var b = document.createElement('button');
      b.className = 'btn' + (chosen ? ' chosen' : '');
      b.textContent = c.text;
      b.onclick = function () { doChoose(i); };
      box.appendChild(b);
    });
    var p = document.createElement('button');
    p.className = 'btn ghost';
    p.textContent = '查看生平';
    p.onclick = function () { showChronicle(); };
    box.appendChild(p);
  }

  function doChoose(i) {
    var out = GAME.choose(i);
    renderHUD();
    $('event-choices').style.display = 'none';
    var box = $('result-box');
    var r = out.result;
    var html = '<span class="rtag">' + (GAME.over ? '终' : '应') + '</span>' + esc(r.result);
    var ds = [];
    (r.notes || []).forEach(function (n) {
      if (n.text != null) ds.push('<span class="chip up"><b>' + esc(n.label) + '</b>' + esc(n.text) + '</span>');
      else ds.push('<span class="chip ' + (n.v > 0 ? 'up' : 'down') + '"><b>' + esc(n.label) + '</b>' + sign(n.v) + '</span>');
    });
    if (ds.length) html += '<div class="deltas">' + ds.join('') + '</div>';
    box.innerHTML = html;
    box.style.display = 'block';
    checkAch();
    saveProfile();
    if (GAME.over) {
      var b = document.createElement('button');
      b.className = 'btn primary';
      b.textContent = '回首此生';
      b.onclick = function () { renderEnding(); show('screen-ending'); };
      box.appendChild(b);
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    } else {
      var n = document.createElement('button');
      n.className = 'btn primary';
      n.textContent = '继续';
      n.onclick = function () { GAME.nextEvent(); renderTurn(); };
      box.appendChild(n);
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
  }

  function bindGame() {
    $('btn-breakthrough').onclick = function () {
      if (!GAME.canBreakthrough()) return;
      var out = GAME.breakthrough();
      renderHUD();
      $('event-choices').style.display = 'none';
      var box = $('result-box');
      var html = '<span class="rtag">关</span>' + esc(out.result.result);
      var ds = [];
      (out.result.notes || []).forEach(function (n) {
        if (n.text != null) ds.push('<span class="chip up"><b>' + esc(n.label) + '</b>' + esc(n.text) + '</span>');
        else ds.push('<span class="chip ' + (n.v > 0 ? 'up' : 'down') + '"><b>' + esc(n.label) + '</b>' + sign(n.v) + '</span>');
      });
      if (ds.length) html += '<div class="deltas">' + ds.join('') + '</div>';
      box.innerHTML = html;
      box.style.display = 'block';
      $('btn-breakthrough').disabled = true;
      checkAch();
      saveProfile();
      var n = document.createElement('button');
      n.className = 'btn primary';
      n.textContent = GAME.over ? '回首此生' : '继续';
      n.onclick = function () {
        if (GAME.over) { renderEnding(); show('screen-ending'); }
        else { GAME.nextEvent(); renderTurn(); }
      };
      box.appendChild(n);
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    };
    $('event-text').addEventListener('click', function () { skipTyping(); });
    $('btn-chron-game').onclick = function () { showChronicle(); };
  }

  /* ------------------------------------------------------------ 成就 --- */

  var runAch = {};
  function checkAch() {
    var s = GAME.s;
    if (s.sect && profile.sects.indexOf(s.sect) < 0) { profile.sects.push(s.sect); }
    var got = GAME.runAchievements();
    if (profile.sects.length >= 6 && !profile.achs.a_six) profile.achs.a_six = 1;
    var fresh = [];
    got.forEach(function (id) {
      if (!runAch[id]) { runAch[id] = 1; if (!profile.achs[id]) { profile.achs[id] = 1; fresh.push(id); } }
    });
    if (fresh.length) {
      var names = fresh.map(function (id) {
        var a = ACHIEVEMENTS.filter(function (x) { return x.id === id; })[0];
        return a ? a.name : id;
      });
      toast('成就达成 · ' + names.join('、'));
    }
    saveProfile();
  }

  /* ------------------------------------------------------------ 生平 --- */

  function chronicleHTML() {
    if (!GAME.chronicle.length) return '<div class="row"><span class="txt">尚无可记之事。</span></div>';
    return GAME.chronicle.map(function (c) {
      return '<div class="row"><span class="age">' + c.age + ' 岁</span><span class="txt">' +
        esc(c.event) + ' — ' + esc(c.choice) + (c.log ? ' <em>「' + esc(c.log) + '」</em>' : '') + '</span></div>';
    }).join('');
  }
  function showChronicle() {
    $('chron-body').innerHTML = chronicleHTML();
    show('screen-chron');
  }

  /* ------------------------------------------------------------ 结算 --- */

  var endingCounted = false;
  function renderEnding() {
    var s = GAME.s, e = GAME.ending || { endingId: 'mortal', title: '', verdict: '' };
    var E = ENDINGS[e.endingId];
    if (!endingCounted) {
      endingCounted = true;
      profile.endings[e.endingId] = (profile.endings[e.endingId] || 0) + 1;
      profile.runs += 1;
    }
    var got = GAME.runAchievements();
    got.forEach(function (id) { if (!profile.achs[id]) profile.achs[id] = 1; });
    if (profile.sects.length >= 6) profile.achs.a_six = 1;
    saveProfile();
    clearRun();

    $('ending-tier').textContent = E ? ('· ' + E.tier + ' ·') : '';
    $('ending-name').textContent = E ? E.name : '结局';
    $('ending-name').style.color = E ? E.color : '';
    $('ending-seal').textContent = E ? E.seal : '道';
    $('ending-seal').style.color = E ? E.color : '';
    $('ending-seal').style.borderColor = E ? E.color : '';
    $('ending-title').textContent = e.title || '';
    var why = GAME.s.deathCause ? ('死于' + GAME.s.deathCause)
      : GAME.ascended ? (GAME.s.chosen ? '天门自开，你只是走了进去' : '天门已开，你走了进去')
        : (e.reason ? e.reason : '寿元耗尽');
    $('ending-verdict').textContent = (E ? E.judge : '') + '　——　' + why;
    $('ending-stats').innerHTML = hudHTML(s);
    $('ending-chron').innerHTML = chronicleHTML();
    $('btn-share').style.display = 'block';
  }

  function bindEnding() {
    $('btn-again').onclick = function () {
      runAch = {};
      endingCounted = false;
      var nm = GAME.s.name;
      GAME = new Game(EVENTS, RNG);
      GAME.roll(gender);
      GAME.s.name = nm;
      GAME.s.chosen = isChosenName(nm);
      show('screen-roll');
      renderRoll();
    };
    $('btn-gal2').onclick = function () { renderGallery(); show('screen-gallery'); };
    $('btn-chron2').onclick = function () { showChronicle(); };
    $('btn-chron-back').onclick = function () {
      show(GAME && GAME.over ? 'screen-ending' : 'screen-game');
    };
  }

  /* ------------------------------------------------------------ 图鉴 --- */

  function renderGallery() {
    var order = ['mortal', 'longlife', 'common', 'demon', 'power', 'fallen'];
    $('gal-grid').innerHTML = order.map(function (id) {
      var E = ENDINGS[id];
      var n = profile.endings[id] || 0;
      return '<div class="gal-item' + (n ? ' unlock' : '') + '">' +
        '<span class="g-seal">' + (n ? E.seal : '？') + '</span>' +
        '<span class="g-name">' + (n ? E.name : '未解锁') + '</span>' +
        '<span style="font-size:11.5px">' + (n ? '达成 ' + n + ' 次' : E.tier) + '</span>' +
        '</div>';
    }).join('');
    $('ach-list').innerHTML = ACHIEVEMENTS.map(function (a) {
      var on = !!profile.achs[a.id];
      return '<div class="ach' + (on ? ' on' : '') + '"><span class="dot"></span>' +
        '<span><b style="font-weight:400">' + a.name + '</b> <span class="d">' + a.desc + '</span></span>' +
        '</div>';
    }).join('');
    var total = ACHIEVEMENTS.length;
    var got = ACHIEVEMENTS.filter(function (a) { return profile.achs[a.id]; }).length;
    $('gal-stat').textContent = '结局 ' + Object.keys(profile.endings).length + '/6 · 成就 ' + got + '/' + total +
      ' · 已修行 ' + profile.runs + ' 世' + (profile.sects.length ? ' · 待过：' + profile.sects.join('、') : '');
  }

  /* --------------------------------------------------------- 分享图 --- */

  function drawShare() {
    var s = GAME.s, e = GAME.ending || {};
    var E = ENDINGS[e.endingId] || { name: '结局', tier: '', seal: '道', color: '#1d1a16' };
    var W = 720, H = 1280;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var x = c.getContext('2d');
    var F = '"STKaiti","Kaiti SC","KaiTi","Songti SC","SimSun",serif';

    x.fillStyle = '#efe6d5'; x.fillRect(0, 0, W, H);
    var g = x.createRadialGradient(W * 0.2, H * 0.1, 40, W * 0.2, H * 0.1, H * 0.8);
    g.addColorStop(0, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(190,172,142,0.25)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(29,26,22,0.5)'; x.lineWidth = 3;
    x.strokeRect(34, 34, W - 68, H - 68);
    x.strokeStyle = 'rgba(29,26,22,0.18)'; x.lineWidth = 1;
    x.strokeRect(46, 46, W - 92, H - 92);

    x.textAlign = 'center';
    x.fillStyle = '#1d1a16';
    x.font = '30px ' + F;
    x.fillText('修 仙 模 拟 器', W / 2, 116);
    x.font = '18px ' + F;
    x.fillStyle = '#6d6255';
    x.fillText('一世一轮回 · 结局六种', W / 2, 152);

    x.font = '20px ' + F;
    x.fillStyle = '#453d33';
    x.textAlign = 'left';
    x.fillText('姓名', 76, 226);
    x.fillText('性别', 300, 226);
    x.fillText('岁数', 470, 226);
    x.font = '26px ' + F; x.fillStyle = '#1d1a16';
    x.fillText(s.name, 76, 262);
    x.fillText(s.gender, 300, 262);
    x.fillText(s.age + ' 岁', 470, 262);

    x.font = '20px ' + F; x.fillStyle = '#453d33';
    x.fillText('灵根', 76, 316);
    x.fillText('出身', 300, 316);
    x.font = '22px ' + F; x.fillStyle = '#1d1a16';
    x.fillText(s.root, 76, 350);
    x.fillText(s.origin, 300, 350);

    x.strokeStyle = 'rgba(29,26,22,0.25)'; x.lineWidth = 1;
    x.beginPath(); x.moveTo(70, 386); x.lineTo(W - 70, 386); x.stroke();

    x.textAlign = 'center';
    x.font = '18px ' + F; x.fillStyle = '#6d6255';
    x.fillText('· ' + (E.tier || '') + ' ·', W / 2, 432);
    x.font = '62px ' + F; x.fillStyle = E.color;
    x.fillText(E.name, W / 2, 508);
    x.font = '26px ' + F; x.fillStyle = '#453d33';
    x.fillText(e.title || '', W / 2, 556);

    x.save();
    x.translate(W - 118, 420); x.rotate(0.13);
    x.strokeStyle = '#9c2b23'; x.lineWidth = 4;
    x.strokeRect(-42, -42, 84, 84);
    x.fillStyle = '#9c2b23'; x.font = '46px ' + F;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(E.seal, 0, 4);
    x.restore();
    x.textBaseline = 'alphabetic';

    var rows = [
      ['境界', REALM_NAMES[s.realm]],
      ['道心 / 魔念', s.mind + ' / ' + s.mo],
      ['气运 / 声望', s.luck + ' / ' + s.fame],
      ['灵石 / 宗门', s.wealth + ' / ' + (s.sect || '无')],
      ['道侣', s.partner || '无']
    ];
    var y = 626;
    x.font = '21px ' + F;
    rows.forEach(function (r) {
      x.textAlign = 'left'; x.fillStyle = '#6d6255'; x.fillText(r[0], 84, y);
      x.textAlign = 'right'; x.fillStyle = '#1d1a16'; x.fillText(String(r[1]), W - 84, y);
      x.strokeStyle = 'rgba(29,26,22,0.1)';
      x.beginPath(); x.moveTo(84, y + 14); x.lineTo(W - 84, y + 14); x.stroke();
      y += 52;
    });

    x.textAlign = 'center'; x.fillStyle = '#6d6255'; x.font = '20px ' + F;
    x.fillText('— 生 平 摘 要 —', W / 2, y + 30);
    y += 62;
    x.textAlign = 'left'; x.font = '19px ' + F;
    var lines = GAME.chronicle.filter(function (c) { return c.log; }).slice(-9);
    if (!lines.length) lines = GAME.chronicle.slice(-9);
    lines.forEach(function (c) {
      if (y > H - 116) return;
      x.fillStyle = '#8a7f6e';
      x.fillText(c.age + '岁', 84, y);
      x.fillStyle = '#1d1a16';
      var t = (c.log || (c.event + '：' + c.choice));
      if (t.length > 20) t = t.slice(0, 19) + '…';
      x.fillText(t, 148, y);
      y += 38;
    });

    x.textAlign = 'center'; x.fillStyle = '#6d6255'; x.font = '18px ' + F;
    x.fillText('修仙模拟器 · 网页文字小游戏', W / 2, H - 66);

    return c.toDataURL('image/png');
  }

  function bindShare() {
    $('btn-share-make').onclick = function () {
      var url = drawShare();
      $('share-img').src = url;
      $('share-result').style.display = 'block';
      $('btn-share-make').textContent = '重新生成';
      var a = $('btn-download');
      a.href = url;
      a.download = '修仙模拟器_' + GAME.s.name + '.png';
    };
  }

  /* ------------------------------------------------------------ 启动 --- */

  document.addEventListener('DOMContentLoaded', function () {
    boot();
    bindRoll();
    bindGame();
    bindEnding();
    bindShare();
    show('screen-title');
  });
})();

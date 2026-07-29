/**
 * 页面交互逻辑：迎客 → 起局 → 作答 → 点评 → 历史记录
 */
(function () {
  'use strict';

  var HISTORY_KEY = 'qmdj_history';
  var HISTORY_MAX = 50;

  var state = {
    customer: null,
    chart: null,
    busy: false,
    qaBusy: false,
    qaLog: [],
    deduceBusy: false,
    deduceText: ''
  };

  function $(id) { return document.getElementById(id); }
  function show(id) { $(id).classList.remove('hidden'); }
  function hide(id) { $(id).classList.add('hidden'); }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------- 极简 Markdown 渲染（标题/加粗/列表/段落） ---------- */
  function mdToHtml(md) {
    var lines = escapeHtml(md).split(/\r?\n/);
    var html = [], inList = false;

    function closeList() { if (inList) { html.push('</ul>'); inList = false; } }
    function inline(t) {
      return t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
    }

    lines.forEach(function (line) {
      var t = line.trim();
      if (!t) { closeList(); return; }
      var h = t.match(/^(#{1,4})\s*(.+)$/);
      if (h) { closeList(); var lv = Math.min(h[1].length + 3, 6); html.push('<h' + lv + '>' + inline(h[2]) + '</h' + lv + '>'); return; }
      var li = t.match(/^(?:[-*]|\d+[.、])\s+(.+)$/);
      if (li) {
        if (!inList) { html.push('<ul>'); inList = true; }
        html.push('<li>' + inline(li[1]) + '</li>');
        return;
      }
      closeList();
      html.push('<p>' + inline(t) + '</p>');
    });
    closeList();
    return html.join('\n');
  }

  /* ---------- 北京时间时钟 ---------- */
  function tickClock() {
    var d = Qimen.beijingNow();
    var week = '日一二三四五六'[d.getUTCDay()];
    $('clockDate').textContent = d.getUTCFullYear() + '年' + (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日 星期' + week;
    var p = function (n) { return n < 10 ? '0' + n : n; };
    $('clockTime').textContent = p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds());
  }
  setInterval(tickClock, 1000);
  tickClock();

  /* ---------- 渲染顾客 ---------- */
  function renderCustomer(c) {
    $('customerName').textContent = c.name || '访客';
    $('customerMeta').textContent = [c.gender, c.age ? c.age + '岁' : '', c.identity].filter(Boolean).join(' · ');
    $('customerDemeanor').textContent = c.demeanor || '';
    $('customerQuestion').textContent = '「' + c.question + '」';
    $('customerCategory').textContent = '所问：' + (c.category || '未知');
    $('customerSource').textContent = c.source === 'ai' ? 'AI 顾客' : c.source === 'visitor' ? '访客亲问' : '本地题库';
  }

  /* ---------- 渲染奇门盘 ---------- */
  function renderChart(c) {
    var juCn = '一二三四五六七八九'[c.ju - 1];
    var infoItems = [
      ['起局时间', c.time.text],
      ['四柱', c.siZhu.year + '年 ' + c.siZhu.month + '月 ' + c.siZhu.day + '日 ' + c.siZhu.hour + '时'],
      ['节气', c.jieQi + ' · ' + c.yuan],
      ['遁局', c.dun + '遁' + juCn + '局'],
      ['旬首', c.xunShou + '（' + c.xunYi + '）'],
      ['值符', c.zhiFuStar + ' 落' + c.zhiFuLuo],
      ['值使', c.zhiShiDoor + ' 落' + c.zhiShiLuo],
      ['时空', c.shiKong],
      ['日空', c.riKong],
      ['驿马', c.maXing]
    ];
    $('chartInfo').innerHTML = infoItems.map(function (it) {
      return '<span class="info-item"><em>' + it[0] + '</em>' + escapeHtml(it[1]) + '</span>';
    }).join('');

    var order = [4, 9, 2, 3, 5, 7, 8, 1, 6];
    $('qimenGrid').innerHTML = order.map(function (g) {
      var o = c.gongs[g];
      if (g === 5) {
        return '<div class="gong gong-center">' +
          '<span class="gong-name">' + o.name + '</span>' +
          '<div class="center-ju">' + c.dun + '遁' + juCn + '局</div>' +
          '<div class="center-gan">' + o.diGan + '<i>寄坤</i></div>' +
          '</div>';
      }
      var marks = '';
      if (o.marks.fu) marks += '<i class="mark mark-fu" title="值符落宫">符</i>';
      if (o.marks.shi) marks += '<i class="mark mark-shi" title="值使落宫">使</i>';
      if (o.marks.kong) marks += '<i class="mark mark-kong" title="时旬空">空</i>';
      if (o.marks.ma) marks += '<i class="mark mark-ma" title="驿马">马</i>';
      var starName = o.star === '天芮' ? '芮禽' : o.star;
      return '<div class="gong' + (o.marks.fu ? ' is-fu' : '') + (o.marks.shi ? ' is-shi' : '') + '">' +
        '<span class="gong-name">' + o.name + '</span>' +
        '<span class="gong-marks">' + marks + '</span>' +
        '<div class="gong-row row-shen">' + o.shen + '</div>' +
        '<div class="gong-row row-star"><span>' + starName + '</span><b class="gan">' + o.tianGan.join('') + '</b></div>' +
        '<div class="gong-row row-door"><span>' + o.door + '</span><b class="gan gan-di">' + o.diGan + '</b></div>' +
        '</div>';
    }).join('');
  }

  /* ---------- 起盘过程（本地渲染，无需 AI） ---------- */

  function renderProcess() {
    var box = $('processContent');
    var steps = (state.chart && state.chart.steps) || [];
    box.innerHTML = '<ol class="process-list">' + steps.map(function (s) {
      return '<li><h5>' + escapeHtml(s.t) + '</h5>' +
        s.d.map(function (line) { return '<p>' + escapeHtml(line) + '</p>'; }).join('') +
        '</li>';
    }).join('') + '</ol>';
  }

  function toggleProcess() {
    if (!state.chart) return;
    var box = $('processContent');
    var btn = $('btnProcess');
    var willShow = box.classList.contains('hidden');
    if (willShow && !box.innerHTML) renderProcess();
    box.classList.toggle('hidden');
    btn.textContent = willShow ? '◆ 收起起盘过程' : '◇ 查看起盘过程';
  }

  /* ---------- 本局示范推演 ---------- */

  async function toggleDeduce() {
    if (state.deduceBusy || !state.chart) return;
    var box = $('deduceContent');
    var btn = $('btnDeduce');

    // 已有内容：在展开/收起间切换
    if (state.deduceText) {
      var willShow = box.classList.contains('hidden');
      box.classList.toggle('hidden');
      btn.textContent = willShow ? '⊖ 收起推演' : '⊕ 演示本局推演';
      return;
    }

    if (!AI.isConfigured()) {
      box.classList.remove('hidden');
      box.innerHTML = '<p class="deduce-warn">尚未配置 AI 接口，无法演示推演。请点右上角「设 置」填入 API Key 后重试。</p>';
      return;
    }

    state.deduceBusy = true;
    btn.disabled = true;
    btn.textContent = '师父推演中 ……';
    box.classList.remove('hidden');
    box.innerHTML = '<p class="deduce-loading">师父正就本局逐步推演，稍候……</p>';

    try {
      var text = await AI.deduce(state.customer, Qimen.chartToText(state.chart));
      state.deduceText = text;
      box.innerHTML = '<div class="deduce-body">' + mdToHtml(text) + '</div>';
      btn.textContent = '⊖ 收起推演';
    } catch (err) {
      box.innerHTML = '<p class="deduce-warn">推演失败：' + escapeHtml(err.message) + '</p>';
      btn.textContent = '⊕ 重试演示推演';
    }
    btn.disabled = false;
    state.deduceBusy = false;
  }

  /* ---------- 请教师父 ---------- */

  function appendQaMsg(role, html) {
    var box = $('qaMessages');
    var div = document.createElement('div');
    div.className = 'qa-msg ' + role;
    div.innerHTML = '<span class="qa-who">' + (role === 'student' ? '我' : '师父') + '</span><div class="qa-bubble">' + html + '</div>';
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    return div;
  }

  async function askMaster(question) {
    if (state.qaBusy || !state.chart) return;
    if (!AI.isConfigured()) {
      if (question) appendQaMsg('student', '<p>' + escapeHtml(question) + '</p>');
      appendQaMsg('master', '<p class="qa-warn">尚未配置 AI 接口，师父不在馆中。请点右上角「设 置」填入 API Key 后再来请教。</p>');
      return;
    }
    state.qaBusy = true;
    var input = $('qaInput');
    input.disabled = true;
    $('btnQaSend').disabled = true;
    $('btnQaHint').disabled = true;

    var shownQ = question || '师父，我一时不知从何入手，请给我几条提示。';
    appendQaMsg('student', '<p>' + escapeHtml(shownQ) + '</p>');
    var pending = appendQaMsg('master', '<p class="qa-thinking">师父捻须寻思……</p>');

    try {
      var reply = await AI.consult(state.customer, Qimen.chartToText(state.chart), state.qaLog, question || '');
      pending.querySelector('.qa-bubble').innerHTML = mdToHtml(reply);
      state.qaLog.push({ q: shownQ, a: reply });
    } catch (err) {
      pending.querySelector('.qa-bubble').innerHTML = '<p class="qa-warn">请教失败：' + escapeHtml(err.message) + '</p>';
    }
    $('qaMessages').scrollTop = $('qaMessages').scrollHeight;
    input.disabled = false;
    $('btnQaSend').disabled = false;
    $('btnQaHint').disabled = false;
    state.qaBusy = false;
  }

  function sendQa() {
    var q = $('qaInput').value.trim();
    if (!q) { $('qaInput').focus(); return; }
    // 未配置 AI 时保留输入，便于配置后重发
    if (AI.isConfigured()) $('qaInput').value = '';
    askMaster(q);
  }

  /* ---------- 历史记录 ---------- */
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveHistoryEntry(entry) {
    var list = loadHistory();
    list.unshift(entry);
    if (list.length > HISTORY_MAX) list = list.slice(0, HISTORY_MAX);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  }
  function extractScore(text) {
    var m = text.match(/评分[:：]?\s*(\d+(?:\.\d+)?)\s*\/\s*10/) ||
      text.match(/(\d+(?:\.\d+)?)\s*\/\s*10/) ||
      text.match(/评分[:：]?\s*(\d+(?:\.\d+)?)\s*分/);
    return m ? m[1] : null;
  }
  function renderHistory() {
    var list = loadHistory();
    if (!list.length) {
      $('historyList').innerHTML = '<p class="history-empty">尚无练习记录，去迎一位客人吧。</p>';
      return;
    }
    $('historyList').innerHTML = list.map(function (e) {
      return '<details class="history-item">' +
        '<summary>' +
        '<span class="h-score">' + (e.score != null ? e.score + '分' : '未评') + '</span>' +
        '<span class="h-q">' + escapeHtml((e.customer || '') + '问' + (e.category || '')) + '：' + escapeHtml(e.question || '') + '</span>' +
        '<span class="h-time">' + escapeHtml(e.time || '') + '</span>' +
        '</summary>' +
        '<div class="h-body">' +
        '<h5>盘面</h5><pre class="h-chart">' + escapeHtml(e.chart || '') + '</pre>' +
        (e.qa && e.qa.length
          ? '<h5>请教记录（' + e.qa.length + ' 条）</h5>' + e.qa.map(function (t) {
            return '<p>问：' + escapeHtml(t.q) + '</p>' + mdToHtml(t.a);
          }).join('')
          : '') +
        '<h5>我的断语</h5><p>' + escapeHtml(e.answer || '') + '</p>' +
        (e.deduce ? '<h5>本局示范推演</h5>' + mdToHtml(e.deduce) : '') +
        '<h5>师父点评</h5>' + (e.evaluation ? mdToHtml(e.evaluation) : '<p>（未点评）</p>') +
        '</div></details>';
    }).join('');
  }

  /* ---------- 主流程 ---------- */

  function updateApiHint() {
    $('apiHint').textContent = AI.isConfigured()
      ? '已配置 AI 接口：顾客与点评均由 AI 生成。'
      : '尚未配置 AI 接口，将使用内置题库顾客，且无法点评。点右上角「设 置」填入 API Key 即可启用。';
  }

  async function invite() {
    if (state.busy) return;
    state.busy = true;
    var btn = $('btnInvite');
    btn.disabled = true;
    btn.textContent = '客 人 将 至 ……';

    var customer, notice = '';
    if (AI.isConfigured()) {
      try {
        customer = await AI.generateCustomer();
      } catch (err) {
        customer = AI.randomLocalCustomer();
        notice = 'AI 顾客生成失败（' + err.message + '），本次改用本地题库。';
      }
    } else {
      customer = AI.randomLocalCustomer();
    }

    // 客到之时即时起局
    var chart = Qimen.paiPan(Qimen.beijingNow());

    state.customer = customer;
    state.chart = chart;
    state.qaLog = [];
    state.deduceText = '';

    renderCustomer(customer);
    renderChart(chart);

    hide('welcomeSection');
    show('customerSection');
    show('chartSection');
    show('qaSection');
    show('answerSection');
    hide('evalSection');
    $('qaMessages').innerHTML = '';
    $('qaInput').value = '';
    $('deduceContent').innerHTML = '';
    $('deduceContent').classList.add('hidden');
    $('btnDeduce').textContent = '⊕ 演示本局推演';
    $('processContent').innerHTML = '';
    $('processContent').classList.add('hidden');
    $('btnProcess').textContent = '◇ 查看起盘过程';
    $('answerInput').value = '';
    $('btnSubmit').disabled = false;
    $('btnSubmit').textContent = '呈 递 答 复';

    if (notice) {
      $('customerSource').textContent = '本地题库';
      showEvalNotice(notice, true);
    }

    btn.disabled = false;
    btn.textContent = '迎 客 问 卦';
    state.busy = false;
    $('customerSection').scrollIntoView({ behavior: 'smooth' });
  }

  /* ---------- 访客自行问事 ---------- */

  function inviteCustom() {
    var q = $('customQuestion').value.trim();
    if (!q) { $('customQuestion').focus(); return; }
    if (state.busy) return;
    state.busy = true;

    // 访客亲问：不生成 AI 顾客，直接用输入的问题
    var customer = {
      name: '访客',
      gender: '',
      age: '',
      identity: '',
      demeanor: '',
      category: '自定义',
      question: q,
      source: 'visitor'
    };

    var chart = Qimen.paiPan(Qimen.beijingNow());

    state.customer = customer;
    state.chart = chart;
    state.qaLog = [];
    state.deduceText = '';

    renderCustomer(customer);
    renderChart(chart);

    hide('welcomeSection');
    show('customerSection');
    show('chartSection');
    show('qaSection');
    show('answerSection');
    hide('evalSection');
    $('qaMessages').innerHTML = '';
    $('qaInput').value = '';
    $('deduceContent').innerHTML = '';
    $('deduceContent').classList.add('hidden');
    $('btnDeduce').textContent = '⊕ 演示本局推演';
    $('processContent').innerHTML = '';
    $('processContent').classList.add('hidden');
    $('btnProcess').textContent = '◇ 查看起盘过程';
    $('answerInput').value = '';
    $('btnSubmit').disabled = false;
    $('btnSubmit').textContent = '呈 递 答 复';

    state.busy = false;
    $('customerSection').scrollIntoView({ behavior: 'smooth' });
  }

  function showEvalNotice(text, isWarn) {
    show('evalSection');
    $('evalContent').innerHTML = '<p class="' + (isWarn ? 'eval-warn' : 'eval-loading') + '">' + escapeHtml(text) + '</p>';
  }

  async function submitAnswer() {
    if (state.busy || !state.chart) return;
    var answer = $('answerInput').value.trim();
    if (!answer) {
      $('answerInput').focus();
      $('answerInput').placeholder = '断语不可为空，请先依盘作答……';
      return;
    }

    if (!AI.isConfigured()) {
      showEvalNotice('尚未配置 AI 接口，无法点评。请点右上角「设 置」填入接口地址、API Key 与模型后，再点「呈递答复」。', true);
      return;
    }

    state.busy = true;
    var btn = $('btnSubmit');
    btn.disabled = true;
    btn.textContent = '师 父 批 阅 中 ……';
    showEvalNotice('师父捻须细看盘面，正在批阅你的断语……');

    var chartText = Qimen.chartToText(state.chart);
    try {
      var evalText = await AI.evaluate(state.customer, chartText, answer, state.qaLog);
      $('evalContent').innerHTML = mdToHtml(evalText);

      saveHistoryEntry({
        time: state.chart.time.text,
        customer: state.customer.name,
        category: state.customer.category,
        question: state.customer.question,
        chart: chartText,
        answer: answer,
        evaluation: evalText,
        qa: state.qaLog,
        deduce: state.deduceText || '',
        score: extractScore(evalText)
      });
      btn.textContent = '已 批 阅';
      $('evalSection').scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      showEvalNotice('点评失败：' + err.message + '。可检查设置后重新提交。', true);
      btn.disabled = false;
      btn.textContent = '呈 递 答 复';
    }
    state.busy = false;
  }

  function nextCustomer() {
    state.customer = null;
    state.chart = null;
    state.qaLog = [];
    state.deduceText = '';
    hide('customerSection');
    hide('chartSection');
    hide('qaSection');
    hide('answerSection');
    hide('evalSection');
    show('welcomeSection');
    updateApiHint();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- 设置弹窗 ---------- */
  function openSettings() {
    var s = AI.getSettings();
    $('cfgBaseUrl').value = s.baseUrl;
    $('cfgApiKey').value = s.apiKey;
    $('cfgModel').value = s.model;
    $('testResult').textContent = '';
    show('settingsModal');
  }
  function saveSettingsFromForm() {
    AI.saveSettings({
      baseUrl: $('cfgBaseUrl').value,
      apiKey: $('cfgApiKey').value,
      model: $('cfgModel').value
    });
    hide('settingsModal');
    updateApiHint();
  }
  async function testApi() {
    // 先按当前表单内容临时保存再测试
    AI.saveSettings({
      baseUrl: $('cfgBaseUrl').value,
      apiKey: $('cfgApiKey').value,
      model: $('cfgModel').value
    });
    var el = $('testResult');
    if (!AI.isConfigured()) { el.textContent = '✕ 请先填全接口地址、API Key 与模型名称。'; el.className = 'test-result err'; return; }
    el.textContent = '正在连接……';
    el.className = 'test-result';
    try {
      var reply = await AI.testConnection();
      el.textContent = '✓ 连接成功，模型回复：' + reply.slice(0, 30);
      el.className = 'test-result ok';
    } catch (err) {
      el.textContent = '✕ ' + err.message;
      el.className = 'test-result err';
    }
  }

  /* ---------- 事件绑定 ---------- */
  $('btnInvite').addEventListener('click', invite);
  $('btnCustomInvite').addEventListener('click', inviteCustom);
  $('customQuestion').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.isComposing) inviteCustom();
  });
  $('btnSubmit').addEventListener('click', submitAnswer);
  $('btnNext').addEventListener('click', nextCustomer);

  $('btnQaSend').addEventListener('click', sendQa);
  $('btnQaHint').addEventListener('click', function () { askMaster(''); });
  $('btnDeduce').addEventListener('click', toggleDeduce);
  $('btnProcess').addEventListener('click', toggleProcess);
  $('qaInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.isComposing) sendQa();
  });

  $('btnSettings').addEventListener('click', openSettings);
  $('btnSaveSettings').addEventListener('click', saveSettingsFromForm);
  $('btnTestApi').addEventListener('click', testApi);

  function openGuide() {
    show('guideModal');
    document.querySelector('#guideModal .modal-body').scrollTop = 0;
  }
  $('btnGuide').addEventListener('click', openGuide);
  $('linkGuide').addEventListener('click', function (e) { e.preventDefault(); openGuide(); });

  $('btnHistory').addEventListener('click', function () { renderHistory(); show('historyModal'); });
  $('btnClearHistory').addEventListener('click', function () {
    if (confirm('确定清空全部练习记录？')) {
      localStorage.removeItem(HISTORY_KEY);
      renderHistory();
    }
  });

  document.querySelectorAll('.modal-close').forEach(function (btn) {
    btn.addEventListener('click', function () { hide(btn.dataset.close); });
  });
  document.querySelectorAll('.modal-mask').forEach(function (mask) {
    mask.addEventListener('click', function (e) { if (e.target === mask) mask.classList.add('hidden'); });
  });

  updateApiHint();
})();

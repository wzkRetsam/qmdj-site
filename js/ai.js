/**
 * AI 模块：模拟前来问卦的顾客、对学员断语作出点评。
 * 使用 OpenAI 兼容接口，配置保存在 localStorage，未配置时回落到本地题库。
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'qmdj_settings';

  var CATEGORIES = ['事业', '财运', '婚恋', '健康', '官司诉讼', '出行', '寻人寻物', '学业考试', '合作投资', '宅居风水'];

  // 本地题库（未配置 AI 时使用）
  var LOCAL_CUSTOMERS = [
    { name: '陈掌柜', gender: '男', age: 45, identity: '绸缎庄老板', demeanor: '眉头紧锁，手里的算盘拨得噼啪响。', category: '合作投资', question: '有位老友邀我合伙开新铺面，本钱要押上大半身家。这买卖做得做不得？何时动手为宜？' },
    { name: '林小姐', gender: '女', age: 28, identity: '公司职员', demeanor: '欲言又止，绞着衣角，脸颊微红。', category: '婚恋', question: '我与他相识两年，近来他忽冷忽热，家里又催着相亲。先生给看看，这段姻缘还成不成？' },
    { name: '赵老伯', gender: '男', age: 63, identity: '退休教师', demeanor: '拄着拐杖，神色忧虑，连声叹气。', category: '健康', question: '老伴儿这半月总说胸口闷，医院查了几回也没个准话。您给瞧瞧，这病要紧不要紧，往哪个方向求医好？' },
    { name: '孙经理', gender: '男', age: 37, identity: '互联网公司中层', demeanor: '西装革履，语速极快，不住看表。', category: '事业', question: '公司要裁员重组，我这个位置悬得很。是留下来搏一搏，还是趁早接了猎头的offer跳出去？' },
    { name: '周婶', gender: '女', age: 52, identity: '菜场摊主', demeanor: '风风火火进门，嗓门洪亮，满脸焦急。', category: '寻人寻物', question: '我家那口子前天说去邻县收货，到今儿电话也打不通！先生快给算算，人在哪个方向，平安不平安？' },
    { name: '吴同学', gender: '男', age: 22, identity: '应届毕业生', demeanor: '背着双肩包，局促地搓着手。', category: '学业考试', question: '下月就要考研复试了，初试分数擦线。您看我这回能不能上岸？该不该同时准备找工作？' },
    { name: '郑女士', gender: '女', age: 41, identity: '餐馆老板娘', demeanor: '一身油烟气还未散，坐下便倒苦水。', category: '官司诉讼', question: '房东要涨三成租金，还想赶我走，我一纸诉状告到了法院。这官司我有几分胜算？要不要私了？' },
    { name: '何先生', gender: '男', age: 33, identity: '自由摄影师', demeanor: '风尘仆仆，把车钥匙往桌上一放。', category: '出行', question: '接了个西部拍摄的活儿，路远且要进山，家里人直拦着。这趟出门顺不顺？哪天动身合适？' },
    { name: '钱阿姨', gender: '女', age: 55, identity: '小区住户', demeanor: '压低了声音，凑近了才肯开口。', category: '财运', question: '儿子撺掇我把积蓄拿去买什么基金，说稳赚。我这心里七上八下的，这钱投得投不得？' },
    { name: '罗师傅', gender: '男', age: 48, identity: '装修工头', demeanor: '手上还沾着白灰，性子直爽。', category: '宅居风水', question: '刚接手一处老宅翻新，东家总说宅子不安生，夜里有响动。您给断断，这宅子毛病出在哪一方？' }
  ];

  function getSettings() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var s = raw ? JSON.parse(raw) : {};
      return {
        baseUrl: s.baseUrl || '',
        apiKey: s.apiKey || '',
        model: s.model || ''
      };
    } catch (e) {
      return { baseUrl: '', apiKey: '', model: '' };
    }
  }

  function saveSettings(s) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      baseUrl: (s.baseUrl || '').trim().replace(/\/+$/, ''),
      apiKey: (s.apiKey || '').trim(),
      model: (s.model || '').trim()
    }));
  }

  function isConfigured() {
    var s = getSettings();
    return !!(s.baseUrl && s.apiKey && s.model);
  }

  async function chat(messages, options) {
    var s = getSettings();
    if (!isConfigured()) throw new Error('尚未配置 AI 接口');
    var res = await fetch(s.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + s.apiKey
      },
      body: JSON.stringify({
        model: s.model,
        messages: messages,
        temperature: (options && options.temperature != null) ? options.temperature : 0.8
      })
    });
    if (!res.ok) {
      var detail = '';
      try { detail = (await res.text()).slice(0, 200); } catch (e) { /* 忽略 */ }
      throw new Error('接口请求失败（HTTP ' + res.status + '）' + (detail ? '：' + detail : ''));
    }
    var data = await res.json();
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('接口返回格式异常');
    }
    return data.choices[0].message.content || '';
  }

  // 测试连接
  async function testConnection() {
    var reply = await chat([
      { role: 'user', content: '请只回复两个字：通了' }
    ], { temperature: 0 });
    return reply.trim();
  }

  function randomLocalCustomer() {
    var c = LOCAL_CUSTOMERS[Math.floor(Math.random() * LOCAL_CUSTOMERS.length)];
    return Object.assign({ source: 'local' }, c);
  }

  function parseJsonLoose(text) {
    var t = text.trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim();
    var start = t.indexOf('{'), end = t.lastIndexOf('}');
    if (start >= 0 && end > start) t = t.slice(start, end + 1);
    return JSON.parse(t);
  }

  // AI 生成一位顾客
  async function generateCustomer() {
    var category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    var content = await chat([
      {
        role: 'system',
        content: '你是奇门遁甲占卜练习程序的顾客扮演生成器。你要虚构一位前来找占卜师问事的顾客，人物要鲜活、贴近现实生活，问题要具体、有细节、适合用奇门遁甲占测。只输出一个 JSON 对象，不要输出任何其他文字。字段：name（称呼，如"张先生""刘大姐"）、gender（男/女）、age（数字）、identity（身份职业）、demeanor（一句话描写其神态举止）、category（问事类别）、question（顾客用第一人称说出的问题，60字以内，口语化，含具体处境与想问的事）。'
      },
      {
        role: 'user',
        content: '请生成一位前来问「' + category + '」类问题的顾客。随机种子：' + Math.random().toString(36).slice(2, 8)
      }
    ], { temperature: 1.0 });
    var c = parseJsonLoose(content);
    if (!c.name || !c.question) throw new Error('生成的顾客信息不完整');
    c.category = c.category || category;
    c.source = 'ai';
    return c;
  }

  // 弟子就当前盘面向师父请教（qaHistory: [{q, a}]；question 为空时表示求入手提示）
  async function consult(customer, chartText, qaHistory, question) {
    var messages = [
      {
        role: 'system',
        content: [
          '你是一位精通奇门遁甲的老师父，弟子正在练习为顾客断卦（时家奇门、拆补定局、转盘飞布），他会就当前盘面向你请教。',
          '规矩：',
          '1. 你是指点者而非代答者：可以讲解知识（用神选取、星门神含义、旺衰、格局、空亡驿马等），可以点出盘面上值得注意的要点，但不要直接给出完整断语和最终吉凶结论，把断卦留给弟子。',
          '2. 回答要紧扣本局盘面与顾客所问之事，引用宫位时要与盘面一致，不可臆造。',
          '3. 简明扼要，每次回答不超过 200 字，可用 Markdown 列要点。',
          '4. 若弟子求提示，就给 2-3 条入手方向（如先看何用神、留意哪个宫），同样不下结论。',
          '语气如老师父授徒：点到为止，启发为主。'
        ].join('\n')
      },
      {
        role: 'user',
        content: '【起局盘面】\n' + chartText + '\n\n【顾客所问】\n' +
          customer.name + '（' + (customer.identity || '') + '）问：' + customer.question +
          '\n\n弟子接下来会就此盘向你请教。'
      },
      { role: 'assistant', content: '好，盘面我已看过，你问吧。' }
    ];
    (qaHistory || []).forEach(function (t) {
      messages.push({ role: 'user', content: t.q });
      messages.push({ role: 'assistant', content: t.a });
    });
    messages.push({
      role: 'user',
      content: question || '师父，我一时不知从何入手，请给我几条提示。'
    });
    return chat(messages, { temperature: 0.5 });
  }

  // AI 点评学员断语
  async function evaluate(customer, chartText, answer, qaHistory) {
    var userContent = [
      '【起局盘面】',
      chartText,
      '',
      '【顾客情况】',
      customer.name + '（' + (customer.gender || '') + '，' + (customer.age || '?') + '岁，' + (customer.identity || '') + '），所问类别：' + (customer.category || '未知'),
      '顾客的问题：' + customer.question,
      '',
      '【弟子的答复】',
      answer
    ].join('\n');

    if (qaHistory && qaHistory.length) {
      userContent += '\n\n【答复前弟子曾向你请教】\n' + qaHistory.map(function (t, i) {
        return (i + 1) + '. 问：' + t.q + '\n　你答：' + t.a;
      }).join('\n');
    }

    return chat([
      {
        role: 'system',
        content: [
          '你是一位精通奇门遁甲的老师父，正在指导弟子练习断卦。弟子依照给定的奇门盘（时家奇门、拆补定局、转盘飞布）为顾客断事，你要点评其表现。',
          '要求：',
          '1. 先依盘面给出你自己的简要参考断法：指明该问何事应取何用神，分析用神落宫的星、门、神、旺衰、空亡驿马等，得出吉凶结论与建议。',
          '2. 再逐项点评弟子的答复：用神选取是否得当、断语是否有盘面依据、结论是否合理、对顾客的表达是否清楚妥帖。有错必指出，有可取之处也要肯定。若附有请教记录，顺带点评弟子是否把指点化入了断语（主动请教不扣分，据提示消化运用得好反应肯定）。',
          '3. 按十分制打分，评分标准：用神与思路 5 分、盘面依据 3 分、表达与建议 2 分。',
          '4. 最后给出 2-3 条具体的精进建议。',
          '输出使用 Markdown，结构如下：',
          '## 盘面参考断法',
          '## 弟子答复点评',
          '## 评分',
          '（此节须单独一行写明：评分：X/10）',
          '## 精进建议',
          '语气如老师父授徒：严谨、直言，亦不失温厚。'
        ].join('\n')
      },
      { role: 'user', content: userContent }
    ], { temperature: 0.5 });
  }

  global.AI = {
    CATEGORIES: CATEGORIES,
    getSettings: getSettings,
    saveSettings: saveSettings,
    isConfigured: isConfigured,
    testConnection: testConnection,
    generateCustomer: generateCustomer,
    randomLocalCustomer: randomLocalCustomer,
    consult: consult,
    evaluate: evaluate
  };

})(typeof window !== 'undefined' ? window : globalThis);

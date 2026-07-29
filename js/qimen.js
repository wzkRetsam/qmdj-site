/**
 * 奇门遁甲排盘（时家奇门 · 拆补定局 · 转盘飞布）
 * 所有时间均按北京时间（UTC+8）计算。
 */
(function (global) {
  'use strict';

  var GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  var ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

  // 24 节气，自小寒始（与 sTermInfo 对应）
  var JIEQI = ['小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨',
    '立夏', '小满', '芒种', '夏至', '小暑', '大暑', '立秋', '处暑',
    '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至'];

  // 1900 年为基准的节气分钟偏移（通行历法算法，1900-2100 有效）
  var S_TERM_INFO = [0, 21208, 42467, 63836, 85337, 107014, 128867, 150921,
    173149, 195551, 218072, 240693, 263343, 285989, 308563, 331033,
    353350, 375494, 397447, 419210, 440795, 462224, 483532, 504758];

  // 各节气对应三元局数 [上元, 中元, 下元]
  var JU_TABLE = {
    // 阳遁：冬至 → 芒种
    '冬至': [1, 7, 4], '小寒': [2, 8, 5], '大寒': [3, 9, 6],
    '立春': [8, 5, 2], '雨水': [9, 6, 3], '惊蛰': [1, 7, 4],
    '春分': [3, 9, 6], '清明': [4, 1, 7], '谷雨': [5, 2, 8],
    '立夏': [4, 1, 7], '小满': [5, 2, 8], '芒种': [6, 3, 9],
    // 阴遁：夏至 → 大雪
    '夏至': [9, 3, 6], '小暑': [8, 2, 5], '大暑': [7, 1, 4],
    '立秋': [2, 5, 8], '处暑': [1, 4, 7], '白露': [9, 3, 6],
    '秋分': [7, 1, 4], '寒露': [6, 9, 3], '霜降': [5, 8, 2],
    '立冬': [6, 9, 3], '小雪': [5, 8, 2], '大雪': [4, 7, 1]
  };
  var YANG_TERMS = ['冬至', '小寒', '大寒', '立春', '雨水', '惊蛰',
    '春分', '清明', '谷雨', '立夏', '小满', '芒种'];

  var GONG_NAME = { 1: '坎一', 2: '坤二', 3: '震三', 4: '巽四', 5: '中五', 6: '乾六', 7: '兑七', 8: '艮八', 9: '离九' };
  var GONG_DIR = { 1: '北', 2: '西南', 3: '东', 4: '东南', 5: '中', 6: '西北', 7: '西', 8: '东北', 9: '南' };
  var STAR_HOME = { 1: '天蓬', 2: '天芮', 3: '天冲', 4: '天辅', 5: '天禽', 6: '天心', 7: '天柱', 8: '天任', 9: '天英' };
  var DOOR_HOME = { 1: '休门', 2: '死门', 3: '伤门', 4: '杜门', 6: '开门', 7: '惊门', 8: '生门', 9: '景门' };

  // 外八宫顺时针环（上南下北布局：4 9 2 / 3 5 7 / 8 1 6）
  var CIRCLE = [1, 8, 3, 4, 9, 2, 7, 6];
  // 与 CIRCLE 对应的星、门原始序
  var CIRCLE_STARS = ['天蓬', '天任', '天冲', '天辅', '天英', '天芮', '天柱', '天心'];
  var CIRCLE_DOORS = ['休门', '生门', '伤门', '杜门', '景门', '死门', '惊门', '开门'];
  var GODS = ['值符', '螣蛇', '太阴', '六合', '白虎', '玄武', '九地', '九天'];

  // 地盘布干顺序（六仪三奇）
  var DIPAN_ORDER = ['戊', '己', '庚', '辛', '壬', '癸', '丁', '丙', '乙'];
  // 旬首对应六仪：甲子戊 甲戌己 甲申庚 甲午辛 甲辰壬 甲寅癸
  var XUN_YI = ['戊', '己', '庚', '辛', '壬', '癸'];

  // 地支所属宫（用于标注空亡、驿马落宫）
  var ZHI_GONG = { '子': 1, '丑': 8, '寅': 8, '卯': 3, '辰': 4, '巳': 4, '午': 9, '未': 2, '申': 2, '酉': 7, '戌': 6, '亥': 6 };

  /* ---------- 时间基础 ---------- */

  // 当前北京时间（UTC 字段承载北京钟面时间）
  function beijingNow() {
    return new Date(Date.now() + 8 * 3600 * 1000);
  }

  // 某年第 n 个节气（n: 0 小寒 … 23 冬至）的交节时刻（UTC 字段为北京时间）
  function termDate(year, n) {
    var ms = Date.UTC(1900, 0, 6, 2, 5) + (31556925974.7 * (year - 1900)) + S_TERM_INFO[n] * 60000;
    return new Date(ms);
  }

  // 收集 d 前后三年的全部节气，按时间排序
  function termsAround(d) {
    var y = d.getUTCFullYear();
    var list = [];
    [y - 1, y, y + 1].forEach(function (yy) {
      for (var n = 0; n < 24; n++) {
        list.push({ name: JIEQI[n], n: n, time: termDate(yy, n) });
      }
    });
    list.sort(function (a, b) { return a.time - b.time; });
    return list;
  }

  // d 所处的节气（含中气，用于奇门定局）
  function currentTerm(d) {
    var list = termsAround(d), cur = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].time <= d) cur = list[i]; else break;
    }
    return cur;
  }

  // d 所处的「节」（偶数序，用于月柱）
  function currentJie(d) {
    var list = termsAround(d), cur = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].n % 2 === 0 && list[i].time <= d) cur = list[i];
      if (list[i].time > d) break;
    }
    return cur;
  }

  /* ---------- 干支四柱 ---------- */

  function jdn(y, m, day) {
    var a = Math.floor((14 - m) / 12), y2 = y + 4800 - a, m2 = m + 12 * a - 3;
    return day + Math.floor((153 * m2 + 2) / 5) + 365 * y2 +
      Math.floor(y2 / 4) - Math.floor(y2 / 100) + Math.floor(y2 / 400) - 32045;
  }

  function gzText(i) { return GAN[i % 10] + ZHI[i % 12]; }
  function mod(n, m) { return ((n % m) + m) % m; }

  // 四柱（d 的 UTC 字段为北京时间；23 时后日柱换日）
  function siZhu(d) {
    var y = d.getUTCFullYear(), mo = d.getUTCMonth() + 1, day = d.getUTCDate(), h = d.getUTCHours();

    // 日柱（含晚子时换日）
    var dayDate = d;
    if (h >= 23) dayDate = new Date(d.getTime() + 24 * 3600 * 1000);
    var dayGZ = mod(jdn(dayDate.getUTCFullYear(), dayDate.getUTCMonth() + 1, dayDate.getUTCDate()) + 49, 60);

    // 时柱（五鼠遁）
    var hourBranch = Math.floor(((h + 1) % 24) / 2);
    var hourGZ = mod((dayGZ % 10) % 5 * 12 + hourBranch, 60);

    // 年柱（以立春为界）
    var liChun = termDate(y, 2);
    var yearNum = (d < liChun) ? y - 1 : y;
    var yearGZ = mod(yearNum - 4, 60);

    // 月柱（以节为界，五虎遁）
    var jie = currentJie(d);
    var jieToMonth = { '立春': 0, '惊蛰': 1, '清明': 2, '立夏': 3, '芒种': 4, '小暑': 5, '立秋': 6, '白露': 7, '寒露': 8, '立冬': 9, '大雪': 10, '小寒': 11 };
    var mIdx = jieToMonth[jie.name];
    var firstMonthStem = ((yearGZ % 10) % 5) * 2 + 2;
    var monthGZ10 = mod(firstMonthStem + mIdx, 10);
    var monthGZ12 = mod(2 + mIdx, 12);

    return {
      year: gzText(yearGZ), yearIdx: yearGZ,
      month: GAN[monthGZ10] + ZHI[monthGZ12],
      day: gzText(dayGZ), dayIdx: dayGZ,
      hour: gzText(hourGZ), hourIdx: hourGZ,
      hourBranch: ZHI[hourBranch]
    };
  }

  /* ---------- 定局（拆补法） ---------- */

  function dingJu(d, sz) {
    var term = currentTerm(d);
    var dun = YANG_TERMS.indexOf(term.name) >= 0 ? '阳' : '阴';
    // 符头：日干支所在五日段起始（甲/己日）
    var fuTou = sz.dayIdx - (sz.dayIdx % 5);
    var yuanIdx = mod(fuTou, 12) % 3; // 子午卯酉0上 辰戌丑未1中 寅申巳亥2下
    var yuanName = ['上元', '中元', '下元'][yuanIdx];
    var ju = JU_TABLE[term.name][yuanIdx];
    return { term: term.name, dun: dun, yuan: yuanName, ju: ju, fuTou: gzText(fuTou) };
  }

  /* ---------- 排盘 ---------- */

  function nextGong(p, yang) { return yang ? (p % 9) + 1 : ((p + 7) % 9) + 1; }
  function jiGong(p) { return p === 5 ? 2 : p; } // 中五寄坤二

  function paiPan(dateBeijing) {
    var d = dateBeijing || beijingNow();
    var sz = siZhu(d);
    var ju = dingJu(d, sz);
    var yang = ju.dun === '阳';

    // 一、地盘：自局数宫布六仪三奇，阳顺阴逆
    var diPan = {}; // 宫 -> 干
    var ganGong = {}; // 干 -> 宫
    var p = ju.ju;
    for (var i = 0; i < 9; i++) {
      diPan[p] = DIPAN_ORDER[i];
      ganGong[DIPAN_ORDER[i]] = p;
      p = nextGong(p, yang);
    }

    // 二、旬首与值符值使
    var xunShou = sz.hourIdx - (sz.hourIdx % 10);
    var xunYi = XUN_YI[xunShou / 10];
    var fuGong = ganGong[xunYi];               // 值符原始宫
    var zhiFuStar = STAR_HOME[fuGong];
    var zhiShiDoor = DOOR_HOME[jiGong(fuGong)];

    // 三、时干落宫（甲遁于旬首六仪）
    var hourGan = GAN[sz.hourIdx % 10];
    var targetGan = hourGan === '甲' ? xunYi : hourGan;
    var shiGanGong = ganGong[targetGan];       // 值符（星/神）随时干落此宫

    // 四、九星转盘：值符星带原宫之干转至时干宫，余星依环序随转
    var fromIdx = CIRCLE.indexOf(jiGong(fuGong));
    var toIdx = CIRCLE.indexOf(jiGong(shiGanGong));
    var offset = mod(toIdx - fromIdx, 8);
    var starAt = {}, tianPan = {};
    for (i = 0; i < 8; i++) {
      var dest = CIRCLE[mod(i + offset, 8)];
      var homeGong = CIRCLE[i];
      starAt[dest] = CIRCLE_STARS[i];
      // 天盘干 = 星原宫地盘干；芮禽同宫，携中五宫之干
      tianPan[dest] = (homeGong === 2) ? [diPan[2], diPan[5]] : [diPan[homeGong]];
    }

    // 五、八门：值使门自值符宫起旬首，顺/逆飞宫数至用时
    var steps = sz.hourIdx % 10;
    var shiPos = fuGong;
    for (i = 0; i < steps; i++) shiPos = nextGong(shiPos, yang);
    var shiGong = jiGong(shiPos);
    var doorFrom = CIRCLE.indexOf(jiGong(fuGong));
    var doorTo = CIRCLE.indexOf(shiGong);
    var dOffset = mod(doorTo - doorFrom, 8);
    var doorAt = {};
    for (i = 0; i < 8; i++) doorAt[CIRCLE[mod(i + dOffset, 8)]] = CIRCLE_DOORS[i];

    // 六、八神：自值符落宫布起，阳顺阴逆
    var godStart = CIRCLE.indexOf(jiGong(shiGanGong));
    var godAt = {};
    for (i = 0; i < 8; i++) {
      var gi = yang ? mod(godStart + i, 8) : mod(godStart - i, 8);
      godAt[CIRCLE[gi]] = GODS[i];
    }

    // 七、空亡与驿马
    function kongOf(gzIdx) {
      var xs = gzIdx - (gzIdx % 10), b = xs % 12;
      return [ZHI[mod(b + 10, 12)], ZHI[mod(b + 11, 12)]];
    }
    var shiKong = kongOf(sz.hourIdx);
    var riKong = kongOf(sz.dayIdx);
    var MA = { '寅': '申', '午': '申', '戌': '申', '申': '寅', '子': '寅', '辰': '寅', '巳': '亥', '酉': '亥', '丑': '亥', '亥': '巳', '卯': '巳', '未': '巳' };
    var maXing = MA[sz.hourBranch];

    // 八、汇总各宫
    var gongs = {};
    for (var g = 1; g <= 9; g++) {
      gongs[g] = {
        gong: g,
        name: GONG_NAME[g],
        dir: GONG_DIR[g],
        shen: godAt[g] || '',
        star: starAt[g] || '',
        tianGan: tianPan[g] || [],
        door: doorAt[g] || '',
        diGan: diPan[g],
        marks: {
          fu: g === jiGong(shiGanGong),
          shi: g === shiGong,
          kong: shiKong.some(function (z) { return ZHI_GONG[z] === g; }),
          ma: ZHI_GONG[maXing] === g
        }
      };
    }

    // 九、还原起局过程（用实际数值逐步展示排盘推算）
    var juCn = '一二三四五六七八九'[ju.ju - 1];
    var southOrder = [4, 9, 2, 3, 5, 7, 8, 1, 6];
    var diPanStr = southOrder.map(function (gg) {
      return GONG_NAME[gg] + '宫→' + diPan[gg];
    }).join('　');
    var procSteps = [
      {
        t: '一、按北京时间定四柱',
        d: [
          '以起局时刻的北京时间排四柱，晚子时（23时后）日柱进为次日。',
          '年柱：' + sz.year + '（以立春分年）',
          '月柱：' + sz.month + '（以节气之「节」分月，五虎遁得月干）',
          '日柱：' + sz.day,
          '时柱：' + sz.hour + '（时支' + sz.hourBranch + '，五鼠遁得时干）'
        ]
      },
      {
        t: '二、察节气、定符头三元',
        d: [
          '起局时刻处于「' + ju.term + '」节气之内。',
          '符头：日柱所属甲或己日为 ' + ju.fuTou + '。',
          '按符头地支定元：子午卧酉为上元、辰戌丑未为中元、寅申巳亥为下元 → 本局为' + ju.yuan + '。'
        ]
      },
      {
        t: '三、定阴阳遁与局数',
        d: [
          '冬至至芒种用阳遁，夏至至大雪用阴遁 →「' + ju.term + '」属' + ju.dun + '遁。',
          '以节气配三元查局：' + ju.term + '·' + ju.yuan + ' → ' + ju.dun + '遁' + juCn + '局。'
        ]
      },
      {
        t: '四、布地盘六仪三奇',
        d: [
          '自' + ju.ju + '宫起，按' + (yang ? '阳遁顺行' : '阴遁逆行') + '布六仪三奇（戊己庚辛壬癸丁丙乙）。',
          '地盘：' + diPanStr
        ]
      },
      {
        t: '五、定旬首、值符值使',
        d: [
          '时柱' + sz.hour + '属' + gzText(xunShou) + '旬，旬遁' + xunYi + '（六仪之首）。',
          xunYi + '在地盘' + GONG_NAME[fuGong] + '宫，该宫本位之星「' + STAR_HOME[fuGong] + '」为值符、本位之门「' + DOOR_HOME[jiGong(fuGong)] + '」为值使。'
        ]
      },
      {
        t: '六、飞值符、转天盘九星',
        d: [
          '时干为' + hourGan + (hourGan === '甲' ? '，甲不独用、以旬首' + xunYi + '代之' : '') + '，' + targetGan + '在地盘' + GONG_NAME[jiGong(shiGanGong)] + '宫。',
          '值符星「' + STAR_HOME[fuGong] + '」自' + GONG_NAME[fuGong] + '宫携天盘干转至时干所在' + GONG_NAME[jiGong(shiGanGong)] + '宫（值符落此），余八星携各自天盘干依序随转。'
        ]
      },
      {
        t: '七、飞值使、排八门',
        d: [
          '值使门「' + DOOR_HOME[jiGong(fuGong)] + '」自值符原宫' + GONG_NAME[fuGong] + '宫起，按本时距旬首之数' + steps + '位、' + (yang ? '阳遁顺飞' : '阴遁逆飞') + '，落' + GONG_NAME[shiGong] + '宫。',
          '余门依九宫次序随之布定。'
        ]
      },
      {
        t: '八、排八神',
        d: [
          '八神以值符神起于值符落宫' + GONG_NAME[jiGong(shiGanGong)] + '宫，' + (yang ? '阳遁顺布' : '阴遁逆布') + '：值符、螣蛇、太阴、六合、白虎、玄武、九地、九天。'
        ]
      },
      {
        t: '九、定空亡与驿马',
        d: [
          '时旬空：' + shiKong.join('') + '（' + gzText(xunShou) + '旬所缺之地支）。',
          '日旬空：' + riKong.join('') + '。',
          '驿马：以时支' + sz.hourBranch + '三合局取，得' + maXing + '（落' + GONG_NAME[ZHI_GONG[maXing]] + '宫）。'
        ]
      }
    ];

    return {
      time: {
        text: fmtTime(d),
        date: d
      },
      siZhu: sz,
      jieQi: ju.term, yuan: ju.yuan, dun: ju.dun, ju: ju.ju, fuTou: ju.fuTou,
      xunShou: gzText(xunShou), xunYi: xunYi,
      zhiFuStar: fuGong === 5 ? '天禽(寄坤)' : zhiFuStar,
      zhiFuLuo: GONG_NAME[jiGong(shiGanGong)],
      zhiShiDoor: zhiShiDoor,
      zhiShiLuo: GONG_NAME[shiGong],
      shiKong: shiKong.join(''), riKong: riKong.join(''),
      maXing: maXing,
      steps: procSteps,
      gongs: gongs
    };
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtTime(d) {
    return d.getUTCFullYear() + '年' + (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日 ' +
      pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
  }

  /* ---------- 盘面文字化（供 AI 提示词使用） ---------- */

  function chartToText(c) {
    var lines = [];
    lines.push('起局时间（北京时间）：' + c.time.text);
    lines.push('四柱：' + c.siZhu.year + '年 ' + c.siZhu.month + '月 ' + c.siZhu.day + '日 ' + c.siZhu.hour + '时');
    lines.push('节气：' + c.jieQi + ' · ' + c.yuan + ' · ' + c.dun + '遁' + '一二三四五六七八九'[c.ju - 1] + '局（拆补法）');
    lines.push('旬首：' + c.xunShou + '（遁' + c.xunYi + '）　值符：' + c.zhiFuStar + ' 落' + c.zhiFuLuo + '宫　值使：' + c.zhiShiDoor + ' 落' + c.zhiShiLuo + '宫');
    lines.push('时空亡：' + c.shiKong + '　日空亡：' + c.riKong + '　驿马：' + c.maXing);
    lines.push('九宫盘面（转盘）：');
    [4, 9, 2, 3, 5, 7, 8, 1, 6].forEach(function (g) {
      var o = c.gongs[g];
      if (g === 5) {
        lines.push('　' + o.name + '宫（中）：地盘 ' + o.diGan + '（寄坤二宫）');
        return;
      }
      var marks = [];
      if (o.marks.fu) marks.push('值符落宫');
      if (o.marks.shi) marks.push('值使落宫');
      if (o.marks.kong) marks.push('旬空');
      if (o.marks.ma) marks.push('驿马');
      lines.push('　' + o.name + '宫（' + o.dir + '）：' + o.shen + ' · ' + o.star +
        '+天盘' + o.tianGan.join('') + ' · ' + o.door + '+地盘' + o.diGan +
        (marks.length ? '（' + marks.join('、') + '）' : ''));
    });
    return lines.join('\n');
  }

  global.Qimen = {
    beijingNow: beijingNow,
    paiPan: paiPan,
    chartToText: chartToText,
    fmtTime: fmtTime
  };

})(typeof window !== 'undefined' ? window : globalThis);

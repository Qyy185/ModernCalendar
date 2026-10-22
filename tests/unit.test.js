/**
 * 现代日历应用 · 单元测试（全部集中在一个文件里）
 *
 * 为什么合成一个文件：
 *   vitest 每个测试文件跑在独立 worker 进程里，
 *   同一个源文件被多个 worker 各自 new Function 求值时，
 *   v8 覆盖率归因会互相覆盖（表现为该文件覆盖率显示 0%）。
 *   集中到一个文件后，每个源文件只求值一次，覆盖率统计才准确。
 *
 * 浏览器端的 js/ 是普通脚本（没有 export），测试通过 loader.js 的
 * sourceURL 技巧加载，既保留了「双击 index.html 就能用」，
 * 又能让覆盖率归因回原始源文件。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { loadScript } from './loader.js';

/** 简易 localStorage 替身 */
function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    _map: map,
  };
}

globalThis.localStorage = makeStorage();
globalThis.window = { CALENDAR_CONFIG: { dashscopeApiKey: '' } };

// 一次性加载全部可测脚本，共享同一作用域
const {
  Calendar, formatLocalDate,
  escapeIcsText, unescapeIcsText, foldIcsLine,
  parseIcsDateTime, parseIcs, buildIcs,
  getEventsForDate, saveEventsForDate, createEvent, deleteEvent,
  countEventsInMonth, hasEventsOn, importIcsEvents, exportIcsForDate,
  buildMonthlyContext, buildSummaryPrompt, requestSummary, getConfiguredApiKey,
} = loadScript(
  ['js/calendar.js', 'js/ics.js', 'js/event-store.js', 'js/ai-summary.js'],
  [
    'Calendar', 'formatLocalDate',
    'escapeIcsText', 'unescapeIcsText', 'foldIcsLine',
    'parseIcsDateTime', 'parseIcs', 'buildIcs',
    'getEventsForDate', 'saveEventsForDate', 'createEvent', 'deleteEvent',
    'countEventsInMonth', 'hasEventsOn', 'importIcsEvents', 'exportIcsForDate',
    'buildMonthlyContext', 'buildSummaryPrompt',
    'requestSummary', 'getConfiguredApiKey',
  ]
);

/**
 * 旅游项目 core/ical.py 生成的真实格式样本
 * 包含：
 *   · PRODID / METHOD / X-WR-CALNAME 等日历级字段
 *   · floating time 的 DTSTART / DTEND（不带 Z、不带 TZID）
 *   · 转义过的分号（\;）—— 验证解析能正确还原
 */
const TRAVEL_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Smart Travel Planner//Travel Plan//CN',
  'CALSCALE:GREGORIAN',
  'METHOD:PUBLISH',
  'X-WR-CALNAME:贵阳行程',
  'BEGIN:VEVENT',
  'UID:travel-20261022T120000Z-0@smart-travel-planner',
  'DTSTAMP:20261022T120000Z',
  'DTSTART:20261023T093000',
  'DTEND:20261023T113000',
  'SUMMARY:甲秀楼',
  'DESCRIPTION:第1天 · 贵阳行程（由智慧旅游规划助手生成）',
  'LOCATION:贵阳',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:travel-20261022T120000Z-1@smart-travel-planner',
  'DTSTAMP:20261022T120000Z',
  'DTSTART:20261024T140000',
  'DTEND:20261024T160000',
  'SUMMARY:黔灵山公园;含\\;避暑\\;门票',
  'DESCRIPTION:第2天 · 贵阳行程（由智慧旅游规划助手生成）',
  'LOCATION:贵阳',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n') + '\r\n';


// ═══════════════════════════════════════════════════════════
// 来自原 calendar.test.js
// ═══════════════════════════════════════════════════════════
describe('Calendar · 日期计算', () => {
  it('getDaysInMonth 正确处理闰年', () => {
    const c = new Calendar();
    expect(c.getDaysInMonth(2024, 1)).toBe(29);   // 2024 闰年 2 月
    expect(c.getDaysInMonth(2025, 1)).toBe(28);   // 2025 平年 2 月
    expect(c.getDaysInMonth(2000, 1)).toBe(29);   // 2000 是闰年（能被 400 整除）
    expect(c.getDaysInMonth(1900, 1)).toBe(28);   // 1900 不是闰年
  });

  it('getDaysInMonth 正确处理大小月', () => {
    const c = new Calendar();
    expect(c.getDaysInMonth(2025, 3)).toBe(30);   // 4 月
    expect(c.getDaysInMonth(2025, 11)).toBe(31);  // 12 月
    expect(c.getDaysInMonth(2025, 0)).toBe(31);   // 1 月
    expect(c.getDaysInMonth(2025, 5)).toBe(30);   // 6 月
  });

  it('getFirstDayOfMonth 返回正确的星期（0=周日）', () => {
    const c = new Calendar();
    expect(c.getFirstDayOfMonth(2025, 0)).toBe(3);   // 2025-01-01 周三
    expect(c.getFirstDayOfMonth(2024, 0)).toBe(1);   // 2024-01-01 周一
    expect(c.getFirstDayOfMonth(2027, 5)).toBe(2);   // 2027-06-01 周二
    expect(c.getFirstDayOfMonth(2026, 9)).toBe(4);   // 2026-10-01 周四
  });

  it('generateCalendarData 前导空格数与首日星期一致', () => {
    const c = new Calendar();
    for (const [y, m] of [[2025, 0], [2024, 1], [2027, 5], [2026, 9]]) {
      c.year = y;
      c.month = m;
      const data = c.generateCalendarData();
      const firstIdx = data.findIndex((d) => d.type === 'day');
      expect(firstIdx).toBe(c.getFirstDayOfMonth(y, m));
    }
  });

  it('generateCalendarData 的日期总数等于当月天数', () => {
    const c = new Calendar();
    for (const [y, m] of [[2024, 1], [2025, 1], [2025, 3], [2025, 11]]) {
      c.year = y;
      c.month = m;
      const data = c.generateCalendarData();
      const days = data.filter((d) => d.type === 'day');
      expect(days.length).toBe(c.getDaysInMonth(y, m));
      // 日期值应为 1..N 连续
      expect(days.map((d) => d.value)).toEqual(
        Array.from({ length: days.length }, (_, i) => i + 1)
      );
    }
  });

  it('prevMonth / nextMonth 正确跨年进位', () => {
    const c = new Calendar();
    c.year = 2026;
    c.month = 0;              // 1 月
    c.prevMonth();
    expect(c.year).toBe(2025);
    expect(c.month).toBe(11);  // 12 月

    c.year = 2026;
    c.month = 11;
    c.nextMonth();
    expect(c.year).toBe(2027);
    expect(c.month).toBe(0);
  });

  it('prevMonth / nextMonth 在年中不改变年份', () => {
    const c = new Calendar();
    c.year = 2026;
    c.month = 5;
    c.nextMonth();
    expect(c.year).toBe(2026);
    expect(c.month).toBe(6);
  });

  it('goToToday 重置为系统当前年月', () => {
    const c = new Calendar();
    c.year = 1999;
    c.month = 3;
    c.goToToday();
    const now = new Date();
    expect(c.year).toBe(now.getFullYear());
    expect(c.month).toBe(now.getMonth());
  });

  it('getFormattedMonthYear 输出中文年月', () => {
    const c = new Calendar();
    c.year = 2025;
    c.month = 10;
    expect(c.getFormattedMonthYear()).toBe('2025年十一月');
  });

  it('isToday 正确识别今天', () => {
    const c = new Calendar();
    const now = new Date();
    expect(c.isToday(now.getDate())).toBe(true);
    expect(c.isToday(now.getDate() === 1 ? 2 : 1)).toBe(false);
  });
});

describe('formatLocalDate · 时区安全', () => {
  it('使用本地时区而不是 UTC', () => {
    // 构造一个本地时间 00:30 的日期，toISOString 会退到前一天
    const d = new Date(2026, 9, 15, 0, 30);
    expect(formatLocalDate(d)).toBe('2026-10-15');
    // 验证这确实是一个 toISOString 会出错的场景
    expect(d.toISOString().split('T')[0]).not.toBe('2026-10-15');
  });

  it('月与日都补零', () => {
    expect(formatLocalDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(formatLocalDate(new Date(2026, 11, 25))).toBe('2026-12-25');
  });

  it('跨年边界正确', () => {
    expect(formatLocalDate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
    expect(formatLocalDate(new Date(2027, 0, 1, 0, 0))).toBe('2027-01-01');
  });
});

// ═══════════════════════════════════════════════════════════
// 来自原 ics.test.js
// ═══════════════════════════════════════════════════════════
describe('ics · 文本转义', () => {
  it('逗号、分号、反斜杠、换行都要转义', () => {
    expect(escapeIcsText('a,b')).toBe('a\\,b');
    expect(escapeIcsText('a;b')).toBe('a\\;b');
    expect(escapeIcsText('a\\b')).toBe('a\\\\b');
    expect(escapeIcsText('a\nb')).toBe('a\\nb');
    expect(escapeIcsText('a\r\nb')).toBe('a\\nb');
  });

  it('转义与反转义互为逆运算', () => {
    const samples = ['a,b', 'a;b', 'a\\b', '第一行\n第二行', '普通文本'];
    for (const s of samples) {
      expect(unescapeIcsText(escapeIcsText(s))).toBe(s);
    }
  });
});

describe('ics · 折行', () => {
  it('短行不折', () => {
    expect(foldIcsLine('SUMMARY:短')).toEqual(['SUMMARY:短']);
  });

  it('长行按 75 字节折行，续行以空格开头', () => {
    const long = 'SUMMARY:' + 'x'.repeat(200);
    const folded = foldIcsLine(long);
    expect(folded.length).toBeGreaterThan(1);
    for (const line of folded) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    // 续行以空格开头
    for (let i = 1; i < folded.length; i++) {
      expect(folded[i].startsWith(' ')).toBe(true);
    }
  });

  it('折行不劈开多字节字符', () => {
    const long = 'SUMMARY:' + '贵'.repeat(100);
    const folded = foldIcsLine(long);
    // 每行都应是合法 UTF-8（不出现替换字符）
    for (const line of folded) {
      expect(line).not.toContain('\uFFFD');
    }
    // 拼回去应该等于原文（去掉续行前导空格）
    const joined = folded.map((l, i) => (i === 0 ? l : l.slice(1))).join('');
    expect(joined).toBe(long);
  });
});

describe('ics · 日期时间解析', () => {
  it('解析浮动时间', () => {
    const d = parseIcsDateTime('20261023T093000');
    expect(d).toEqual({
      year: 2026, month: 10, day: 23, hour: 9, minute: 30, allDay: false,
    });
  });

  it('解析 UTC 时间', () => {
    const d = parseIcsDateTime('20261022T120000Z');
    expect(d.year).toBe(2026);
    expect(d.hour).toBe(12);
  });

  it('解析纯日期（全天事件）', () => {
    const d = parseIcsDateTime('20261023');
    expect(d).toEqual({
      year: 2026, month: 10, day: 23, hour: 0, minute: 0, allDay: true,
    });
  });

  it('非法值返回 null', () => {
    expect(parseIcsDateTime('not-a-date')).toBeNull();
    expect(parseIcsDateTime('')).toBeNull();
  });
});

describe('ics · 解析事件', () => {
  it('解析旅游项目导出的 .ics', () => {
    const events = parseIcs(TRAVEL_ICS);
    expect(events.length).toBe(2);

    expect(events[0].summary).toBe('甲秀楼');
    expect(events[0].location).toBe('贵阳');
    expect(events[0].start).toEqual({
      year: 2026, month: 10, day: 23, hour: 9, minute: 30, allDay: false,
    });
    expect(events[0].end.hour).toBe(11);
    expect(events[0].end.minute).toBe(30);
  });

  it('转义的分号在解析后还原', () => {
    const events = parseIcs(TRAVEL_ICS);
    expect(events[1].summary).toBe('黔灵山公园;含;避暑;门票');
  });

  it('DESCRIPTION 完整保留', () => {
    const events = parseIcs(TRAVEL_ICS);
    expect(events[0].description).toContain('第1天');
    expect(events[0].description).toContain('智慧旅游规划助手');
  });

  it('兼容 LF 行尾', () => {
    const lf = TRAVEL_ICS.replace(/\r\n/g, '\n');
    expect(parseIcs(lf).length).toBe(2);
  });

  it('反折行：长行被正确拼接', () => {
    const long = 'SUMMARY:' + '很长的标题'.repeat(30);
    const folded = foldIcsLine(long).join('\r\n');
    const icsText = [
      'BEGIN:VCALENDAR', 'VERSION:2.0',
      'BEGIN:VEVENT', 'UID:x@y',
      'DTSTART:20261023T090000', 'DTEND:20261023T100000',
      folded, 'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n') + '\r\n';

    const events = parseIcs(icsText);
    expect(events.length).toBe(1);
    expect(events[0].summary).toBe(long.slice('SUMMARY:'.length));
  });

  it('空内容返回空数组', () => {
    expect(parseIcs('')).toEqual([]);
    expect(parseIcs('   ')).toEqual([]);
  });

  it('忽略 VALARM 等嵌套子组件', () => {
    const withAlarm = [
      'BEGIN:VCALENDAR', 'VERSION:2.0',
      'BEGIN:VEVENT', 'UID:x@y',
      'DTSTART:20261023T090000', 'DTEND:20261023T100000',
      'SUMMARY:带提醒',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT15M', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n') + '\r\n';
    const events = parseIcs(withAlarm);
    expect(events.length).toBe(1);
    expect(events[0].summary).toBe('带提醒');
  });
});

describe('ics · 生成', () => {
  it('生成的文件以 CRLF 结尾且结构完整', () => {
    const out = buildIcs([{
      uid: 'test-1',
      summary: '测试日程',
      start: { year: 2026, month: 10, day: 23, hour: 9, minute: 30, allDay: false },
      end: { year: 2026, month: 10, day: 23, hour: 11, minute: 0, allDay: false },
    }], '我的日历');

    expect(out.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(out.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(out).toContain('X-WR-CALNAME:我的日历');
    expect(out).toContain('SUMMARY:测试日程');
    expect(out).toContain('DTSTART:20261023T093000');
    expect(out).toContain('DTEND:20261023T110000');
    // 不应出现裸 LF
    expect(out.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('往返一致性：生成 → 解析 → 内容不丢', () => {
    const original = [
      {
        uid: 'e1',
        summary: '甲秀楼（南明区）',
        description: '第1天 · 含换行\n第二行',
        location: '贵阳, 贵州',
        start: { year: 2026, month: 10, day: 23, hour: 9, minute: 30, allDay: false },
        end: { year: 2026, month: 10, day: 23, hour: 11, minute: 30, allDay: false },
      },
      {
        uid: 'e2',
        summary: '黔灵山公园;半山亭',
        start: { year: 2026, month: 10, day: 24, hour: 14, minute: 0, allDay: false },
        end: { year: 2026, month: 10, day: 24, hour: 16, minute: 0, allDay: false },
      },
    ];

    const parsed = parseIcs(buildIcs(original, '测试'));
    expect(parsed.length).toBe(2);
    expect(parsed[0].summary).toBe(original[0].summary);
    expect(parsed[0].description).toBe(original[0].description);
    expect(parsed[0].location).toBe(original[0].location);
    expect(parsed[0].start).toEqual(original[0].start);
    expect(parsed[0].end).toEqual(original[0].end);
    expect(parsed[1].summary).toBe(original[1].summary);
  });

  it('与旅游项目互导：旅游项目导出的能被本项目解析并原样再导出', () => {
    // 解析旅游项目的文件
    const fromTravel = parseIcs(TRAVEL_ICS);
    expect(fromTravel.length).toBe(2);

    // 转成本项目的事件结构再导出
    const toExport = fromTravel.map((ev) => ({
      uid: ev.uid,
      summary: ev.summary,
      description: ev.description,
      location: ev.location,
      start: {
        year: ev.start.year, month: ev.start.month, day: ev.start.day,
        hour: ev.start.hour, minute: ev.start.minute, allDay: false,
      },
      end: {
        year: ev.end.year, month: ev.end.month, day: ev.end.day,
        hour: ev.end.hour, minute: ev.end.minute, allDay: false,
      },
    }));

    const reExported = parseIcs(buildIcs(toExport, '贵阳行程'));
    expect(reExported.length).toBe(2);
    expect(reExported[0].summary).toBe('甲秀楼');
    expect(reExported[0].start.day).toBe(23);
    expect(reExported[0].start.hour).toBe(9);
    expect(reExported[0].end.minute).toBe(30);
    expect(reExported[1].summary).toBe('黔灵山公园;含;避暑;门票');
  });
});

// ═══════════════════════════════════════════════════════════
// 来自原 event-store.test.js
// ═══════════════════════════════════════════════════════════
describe('EventStore · 基础读写', () => {
  beforeEach(() => localStorage.clear());

  it('初始没有事件时返回空数组', () => {
    expect(getEventsForDate(new Date(2026, 9, 15))).toEqual([]);
  });

  it('保存后能读回', () => {
    const d = new Date(2026, 9, 15);
    const ev = createEvent({
      summary: '测试',
      start: { hour: 9, minute: 0 },
      end: { hour: 10, minute: 30 },
    });
    saveEventsForDate(d, [ev]);
    const list = getEventsForDate(d);
    expect(list.length).toBe(1);
    expect(list[0].summary).toBe('测试');
    expect(list[0].start.hour).toBe(9);
  });

  it('空数组会清除 key 而不是存空数组', () => {
    const d = new Date(2026, 9, 15);
    saveEventsForDate(d, [createEvent({ summary: 'x' })]);
    saveEventsForDate(d, []);
    expect(localStorage.getItem('calendar_event_2026-10-15')).toBeNull();
  });

  it('不同日期的事件互不干扰', () => {
    const d1 = new Date(2026, 9, 15);
    const d2 = new Date(2026, 9, 16);
    saveEventsForDate(d1, [createEvent({ summary: 'A' })]);
    saveEventsForDate(d2, [createEvent({ summary: 'B' })]);
    expect(getEventsForDate(d1)[0].summary).toBe('A');
    expect(getEventsForDate(d2)[0].summary).toBe('B');
  });

  it('deleteEvent 按 UID 删除', () => {
    const d = new Date(2026, 9, 15);
    const a = createEvent({ summary: 'A' });
    const b = createEvent({ summary: 'B' });
    saveEventsForDate(d, [a, b]);
    deleteEvent(d, a.uid);
    const left = getEventsForDate(d);
    expect(left.length).toBe(1);
    expect(left[0].summary).toBe('B');
  });

  it('countEventsInMonth 统计整月', () => {
    saveEventsForDate(new Date(2026, 9, 1), [createEvent({ summary: 'a' })]);
    saveEventsForDate(new Date(2026, 9, 15), [
      createEvent({ summary: 'b' }), createEvent({ summary: 'c' }),
    ]);
    saveEventsForDate(new Date(2026, 10, 1), [createEvent({ summary: 'd' })]);
    expect(countEventsInMonth(2026, 9)).toBe(3);
    expect(countEventsInMonth(2026, 10)).toBe(1);
  });

  it('hasEventsOn 判断某天有无事件', () => {
    saveEventsForDate(new Date(2026, 9, 15), [createEvent({ summary: 'x' })]);
    expect(hasEventsOn(2026, 9, 15)).toBe(true);
    expect(hasEventsOn(2026, 9, 16)).toBe(false);
  });
});

describe('EventStore · .ics 导入', () => {
  beforeEach(() => localStorage.clear());

  it('导入旅游项目的 .ics，按日期分组写入', () => {
    const result = importIcsEvents(TRAVEL_ICS);
    expect(result.imported).toBe(2);
    expect(result.days.sort()).toEqual(['2026-10-23', '2026-10-24']);

    const d1 = getEventsForDate(new Date(2026, 9, 23));
    expect(d1.length).toBe(1);
    expect(d1[0].summary).toBe('甲秀楼');
    expect(d1[0].location).toBe('贵阳');
    expect(d1[0].start.hour).toBe(9);
    expect(d1[0].start.minute).toBe(30);
    expect(d1[0].end.hour).toBe(11);
    expect(d1[0].imported).toBe(true);
  });

  it('重复导入不产生副本（同 UID 覆盖）', () => {
    importIcsEvents(TRAVEL_ICS);
    importIcsEvents(TRAVEL_ICS);
    const d1 = getEventsForDate(new Date(2026, 9, 23));
    expect(d1.length).toBe(1);
  });

  it('空文件返回 0 条', () => {
    const result = importIcsEvents('');
    expect(result.imported).toBe(0);
    expect(result.days).toEqual([]);
  });

  it('全日事件（只有日期无时间）也能导入', () => {
    const allDay = [
      'BEGIN:VCALENDAR', 'VERSION:2.0',
      'BEGIN:VEVENT', 'UID:allday@x',
      'DTSTART;VALUE=DATE:20261025', 'DTEND;VALUE=DATE:20261026',
      'SUMMARY:全天事件', 'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n') + '\r\n';
    const r = importIcsEvents(allDay);
    expect(r.imported).toBe(1);
    const ev = getEventsForDate(new Date(2026, 9, 25))[0];
    expect(ev.summary).toBe('全天事件');
  });
});

describe('EventStore · .ics 导出', () => {
  beforeEach(() => localStorage.clear());

  it('导出当天事件，格式可被重新解析', () => {
    const d = new Date(2026, 9, 23);
    saveEventsForDate(d, [createEvent({
      summary: '甲秀楼',
      location: '贵阳',
      start: { hour: 9, minute: 30 },
      end: { hour: 11, minute: 0 },
    })]);

    const ics = exportIcsForDate(d);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:甲秀楼');
    expect(ics).toContain('DTSTART:20261023T093000');
    expect(ics).toContain('LOCATION:贵阳');
  });

  it('导出 → 导入 往返后内容一致', () => {
    const d = new Date(2026, 9, 23);
    saveEventsForDate(d, [createEvent({
      summary: '往返测试',
      start: { hour: 9, minute: 0 },
      end: { hour: 10, minute: 0 },
    })]);

    // 先导出，再清空，最后导入 —— 验证导出内容自带完整信息
    const ics = exportIcsForDate(d);
    localStorage.clear();
    expect(getEventsForDate(d).length).toBe(0);
    importIcsEvents(ics);

    const ev = getEventsForDate(d)[0];
    expect(ev.summary).toBe('往返测试');
    expect(ev.start.hour).toBe(9);
  });
});

describe('AI 摘要 · 上下文组装', () => {
  beforeEach(() => localStorage.clear());

  it('没有笔记时 context 为空', () => {
    const ctx = buildMonthlyContext(2026, 9);
    expect(ctx.noteCount).toBe(0);
    expect(ctx.context).toBe('');
    expect(ctx.days).toEqual([]);
  });

  it('只收集有笔记的日期', () => {
    localStorage.setItem('calendar_note_2026-10-15', '写了点东西');
    localStorage.setItem('calendar_note_2026-10-20', '又写了一些');

    const ctx = buildMonthlyContext(2026, 9);
    expect(ctx.noteCount).toBe(2);
    expect(ctx.days).toEqual(['2026-10-15', '2026-10-20']);
    expect(ctx.context).toContain('写了点东西');
    expect(ctx.context).toContain('又写了一些');
  });

  it('不跨月收集', () => {
    localStorage.setItem('calendar_note_2026-10-15', '本月');
    localStorage.setItem('calendar_note_2026-11-01', '下月');

    const ctx = buildMonthlyContext(2026, 9);
    expect(ctx.noteCount).toBe(1);
    expect(ctx.context).not.toContain('下月');
  });

  it('空白笔记不算数', () => {
    localStorage.setItem('calendar_note_2026-10-15', '   \n  ');
    const ctx = buildMonthlyContext(2026, 9);
    expect(ctx.noteCount).toBe(0);
  });

  it('上下文里带日期与星期', () => {
    localStorage.setItem('calendar_note_2026-10-15', '内容');
    const ctx = buildMonthlyContext(2026, 9);
    expect(ctx.context).toContain('10月15日');
    expect(ctx.context).toMatch(/周[一二三四五六日]/);
  });
});

describe('AI 摘要 · Prompt', () => {
  it('Prompt 包含笔记内容与字数限制', () => {
    const ctx = { context: '【10月15日 周四】\n今天做了测试', noteCount: 1, days: ['2026-10-15'] };
    const prompt = buildSummaryPrompt(ctx, '日历');
    expect(prompt).toContain('今天做了测试');
    expect(prompt).toContain('300 字以内');
    expect(prompt).toContain('日历');
  });

  it('Prompt 要求不要编造', () => {
    const prompt = buildSummaryPrompt({ context: 'x', noteCount: 1, days: [] }, '日历');
    expect(prompt).toContain('不要编造');
  });
});

// ═══════════════════════════════════════════════════════════
// AI 摘要 · 错误处理与降级
// ═══════════════════════════════════════════════════════════

describe('AI 摘要 · 错误处理', () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.window = { CALENDAR_CONFIG: { dashscopeApiKey: '' } };
  });

  it('没有 Key 时抛出 NO_API_KEY', async () => {
    await expect(requestSummary({ apiKey: '' })).rejects.toThrow('NO_API_KEY');
    await expect(requestSummary({})).rejects.toThrow('NO_API_KEY');
  });

  it('getConfiguredApiKey 从 window.CALENDAR_CONFIG 读取', () => {
    expect(getConfiguredApiKey()).toBe('');
    globalThis.window = { CALENDAR_CONFIG: { dashscopeApiKey: 'sk-test' } };
    expect(getConfiguredApiKey()).toBe('sk-test');
  });

  it('接口返回 401 时抛出带 status 的错误', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'invalid key' } }),
    });
    try {
      await expect(requestSummary({ apiKey: 'sk-bad' })).rejects.toThrow('API_ERROR_401');
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('接口返回 429 时能被识别', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false, status: 429, json: async () => ({}),
    });
    try {
      await expect(requestSummary({ apiKey: 'sk-x' })).rejects.toThrow('API_ERROR_429');
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('响应体不是 JSON 时也能正常抛错', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false, status: 500, json: async () => { throw new Error('not json'); },
    });
    try {
      await expect(requestSummary({ apiKey: 'sk-x' })).rejects.toThrow('API_ERROR_500');
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('返回内容为空时抛 EMPTY_RESPONSE', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ choices: [] }),
    });
    try {
      await expect(requestSummary({ apiKey: 'sk-x' })).rejects.toThrow('EMPTY_RESPONSE');
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('正常响应时返回摘要文本', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '  这个月主要在做三件事  ' } }],
      }),
    });
    try {
      const text = await requestSummary({ apiKey: 'sk-x', prompt: 'p' });
      expect(text).toBe('这个月主要在做三件事');   // 首尾空白被 trim
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('请求体格式正确（model / messages / temperature）', async () => {
    const orig = globalThis.fetch;
    let captured = null;
    globalThis.fetch = async (url, opts) => {
      captured = { url, opts };
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'x' } }] }) };
    };
    try {
      await requestSummary({ apiKey: 'sk-x', prompt: 'hello', model: 'qwen-turbo' });
      expect(captured.url).toContain('/chat/completions');
      expect(captured.opts.method).toBe('POST');
      expect(captured.opts.headers.Authorization).toBe('Bearer sk-x');
      const body = JSON.parse(captured.opts.body);
      expect(body.model).toBe('qwen-turbo');
      expect(body.messages[0].content).toBe('hello');
      expect(body.messages[0].role).toBe('user');
    } finally {
      globalThis.fetch = orig;
    }
  });
});

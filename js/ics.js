/**
 * IcsParser —— RFC 5545 日历文件解析与生成
 *
 * 与「智慧旅游规划助手」导出的 .ics 双向兼容：
 *   · 解析：把 .ics 里的 VEVENT 读成事件对象，在日历上显示
 *   · 生成：把本地事件导出成 .ics，导入手机 / 系统日历
 *
 * 实现的规范要点：
 *   1. 行尾必须 CRLF
 *   2. 超过 75 字节的行按规范折行，续行以一个空格开头
 *   3. 文本值里的逗号、分号、反斜杠需要转义
 *   4. DTSTART / DTEND 用 floating time（不带 Z、不带 TZID）时，
 *      按设备本地时区显示 —— 正是旅行日程想要的效果
 *   5. VEVENT 可以嵌套 VALARM，解析时要按 BEGIN/END 配对而非按行序
 */

/** ics 文本转义：逗号、分号、反斜杠、换行 */
function escapeIcsText(value) {
  return String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\n');
}

/** ics 文本反转义 */
function unescapeIcsText(value) {
  return String(value == null ? '' : value)
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/**
 * 按 RFC 5545 折行：单行不超过 75 字节，续行以空格开头
 * 注意按字节算，不是按字符 —— 中文一个字 3 字节
 * @param {string} line - 完整的一行
 * @returns {string[]} 折行后的行数组
 */
function foldIcsLine(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return [line];

  const out = [];
  let rest = line;
  let limit = 75;

  while (new TextEncoder().encode(rest).length > limit) {
    // 按字节切，但不能把一个多字节字符劈开
    let cut = limit;
    while (cut > 0 && new TextEncoder().encode(rest.slice(0, cut)).length > limit) {
      cut--;
    }
    out.push(rest.slice(0, cut));
    rest = ' ' + rest.slice(cut);   // 续行以空格开头，占 1 字节
    limit = 74;                      // 续行首字符是空格
  }
  out.push(rest);
  return out;
}

/**
 * 解析 DTSTART / DTEND 这类日期时间值
 * 支持三种形式：
 *   20261101T093000      本地浮动时间
 *   20261101T093000Z     UTC
 *   20261101             纯日期
 * @param {string} value - 原始值
 * @returns {{year:number, month:number, day:number, hour:number, minute:number, allDay:boolean}|null}
 */
function parseIcsDateTime(value) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(
    String(value || '').trim()
  );
  if (!m) return null;

  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: m[4] ? Number(m[4]) : 0,
    minute: m[5] ? Number(m[5]) : 0,
    allDay: !m[4],
  };
}

/**
 * 解析 .ics 文本为事件数组
 * @param {string} text - .ics 文件内容
 * @returns {Array<{uid:string, summary:string, description:string, location:string, start:Object, end:Object}>}
 */
function parseIcs(text) {
  const content = String(text || '');
  if (!content.trim()) return [];

  // 规范要求 CRLF；兼容 LF / CR
  const rawLines = content.split(/\r\n|\r|\n/);

  // 反折行：续行以空格开头，去掉那个空格后接回上一行
  const lines = [];
  for (const raw of rawLines) {
    if (raw.startsWith(' ') && lines.length) {
      lines[lines.length - 1] += raw.slice(1);
    } else {
      lines.push(raw);
    }
  }

  const events = [];
  let cur = null;
  let depth = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const upper = trimmed.toUpperCase();

    if (upper.startsWith('BEGIN:')) {
      depth++;
      if (upper === 'BEGIN:VEVENT') {
        cur = {
          uid: '', summary: '', description: '', location: '',
          start: null, end: null,
        };
      }
      continue;
    }

    if (upper.startsWith('END:')) {
      depth--;
      if (upper === 'END:VEVENT' && cur) {
        if (cur.start) events.push(cur);
        cur = null;
      }
      continue;
    }

    if (!cur) continue;

    // 拆出「属性名:值」，值里第一个冒号才是分隔符
    const sep = trimmed.indexOf(':');
    if (sep === -1) continue;

    const rawName = trimmed.slice(0, sep);
    const value = trimmed.slice(sep + 1);

    // 属性名可能带参数（如 DTSTART;TZID=Asia/Shanghai:...）
    const name = rawName.split(';')[0].toUpperCase();
    const params = rawName.includes(';')
      ? rawName.slice(rawName.indexOf(';') + 1).split(';')
      : [];

    switch (name) {
      case 'UID':
        cur.uid = value.trim();
        break;
      case 'SUMMARY':
        cur.summary = unescapeIcsText(value);
        break;
      case 'DESCRIPTION':
        cur.description = unescapeIcsText(value);
        break;
      case 'LOCATION':
        cur.location = unescapeIcsText(value);
        break;
      case 'DTSTART': {
        // 带 TZID 的按浮动时间处理即可（本地显示）
        void params;
        cur.start = parseIcsDateTime(value);
        break;
      }
      case 'DTEND': {
        void params;
        cur.end = parseIcsDateTime(value);
        break;
      }
      default:
        break;
    }
  }

  return events;
}

/**
 * 把事件对象数组生成 .ics 文本
 * @param {Array} events - 事件数组
 * @param {string} calendarName - 日历名称
 * @returns {string} .ics 文本（CRLF 行尾）
 */
function buildIcs(events, calendarName) {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Modern Calendar//Modern Calendar//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' + escapeIcsText(calendarName || '现代日历应用'),
  ];

  (events || []).forEach((ev, i) => {
    const s = ev.start || { year: 1970, month: 1, day: 1, hour: 9, minute: 0, allDay: false };
    const e = ev.end || {
      year: s.year, month: s.month, day: s.day,
      hour: s.hour, minute: s.minute, allDay: s.allDay,
    };

    const fmt = (d) => {
      const p = (n, w = 2) => String(n).padStart(w, '0');
      const date = `${p(d.year, 4)}${p(d.month)}${p(d.day)}`;
      if (d.allDay) return date;
      return `${date}T${p(d.hour)}${p(d.minute)}00`;
    };

    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + (ev.uid || `mc-${stamp}-${i}`) + '@modern-calendar');
    lines.push('DTSTAMP:' + stamp);
    lines.push('DTSTART:' + fmt(s));
    lines.push('DTEND:' + fmt(e));
    lines.push('SUMMARY:' + escapeIcsText(ev.summary || ''));
    if (ev.description) {
      lines.push('DESCRIPTION:' + escapeIcsText(ev.description));
    }
    if (ev.location) {
      lines.push('LOCATION:' + escapeIcsText(ev.location));
    }
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');

  return lines
    .flatMap((ln) => foldIcsLine(ln))
    .map((ln) => ln + '\r\n')
    .join('');
}

// 浏览器环境下挂到全局；CommonJS 测试环境走 module.exports。
// 注意：不能用 `typeof module !== 'undefined'` 判断——ESM 测试环境里
// module 存在但不是 CommonJS 模块，赋值会劫持文件内的函数引用。
if (typeof module === 'object' && module !== null && typeof module.require === 'function') {
  module.exports = {
    escapeIcsText,
    unescapeIcsText,
    foldIcsLine,
    parseIcsDateTime,
    parseIcs,
    buildIcs,
  };
}

/**
 * EventStore —— 日历事件的数据层
 *
 * 事件的存放与笔记一样走 localStorage，但用独立的 key 段：
 *   calendar_event_YYYY-MM-DD → 当天的事件数组 JSON
 *
 * 与笔记的区别：
 *   · 笔记是「一天一条文本」
 *   · 事件是「一天多条」，每条有时间段、标题、地点
 *
 * 事件的两种来源：
 *   1. 本地新建（用户手动加）
 *   2. .ics 导入（从旅游项目导出的行程，或手机/系统日历导出的）
 *   两者结构一致，导入时保留原 UID 便于回溯。
 */

/** 存储 key 前缀 */
const EVENT_KEY_PREFIX = 'calendar_event_';

/**
 * 取某天的事件数组
 * @param {Date} date - 目标日期
 * @returns {Array} 事件数组（没有则空数组）
 */
function getEventsForDate(date) {
  const key = EVENT_KEY_PREFIX + formatLocalDate(date);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

/**
 * 保存某天的事件数组
 * @param {Date} date - 目标日期
 * @param {Array} events - 事件数组
 */
function saveEventsForDate(date, events) {
  const key = EVENT_KEY_PREFIX + formatLocalDate(date);
  if (!events || !events.length) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, JSON.stringify(events));
}

/**
 * 新建一个事件
 * @param {Object} opts - {summary, description, location, start:{hour,minute}, end:{hour,minute}}
 * @returns {Object} 事件对象
 */
function createEvent(opts) {
  const o = opts || {};
  return {
    uid: o.uid || ('evt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)),
    summary: o.summary || '',
    description: o.description || '',
    location: o.location || '',
    start: o.start || { hour: 9, minute: 0 },
    end: o.end || { hour: 10, minute: 0 },
    imported: !!o.imported,
  };
}

/**
 * 删除某个事件
 * @param {Date} date - 事件所在日期
 * @param {string} uid - 事件 UID
 */
function deleteEvent(date, uid) {
  const list = getEventsForDate(date);
  const next = list.filter((e) => e.uid !== uid);
  saveEventsForDate(date, next);
}

/**
 * 统计某月的事件总数
 * @param {number} year - 年
 * @param {number} month - 月（0-11）
 * @returns {number} 事件数量
 */
function countEventsInMonth(year, month) {
  const days = new Date(year, month + 1, 0).getDate();
  let total = 0;
  for (let d = 1; d <= days; d++) {
    total += getEventsForDate(new Date(year, month, d)).length;
  }
  return total;
}

/**
 * 判断某天是否有事件
 * @param {number} year - 年
 * @param {number} month - 月（0-11）
 * @param {number} day - 日
 * @returns {boolean} 是否有事件
 */
function hasEventsOn(year, month, day) {
  return getEventsForDate(new Date(year, month, day)).length > 0;
}

/**
 * 导入 .ics 文件内容，把其中的事件按日期写入 localStorage
 * 同 UID 的事件会被覆盖（重复导入不会产生副本）
 *
 * @param {string} text - .ics 文件内容
 * @returns {{imported:number, days:Array<string>, skipped:number}} 导入结果
 */
function importIcsEvents(text) {
  const events = parseIcs(text);
  if (!events.length) {
    return { imported: 0, days: [], skipped: 0 };
  }

  // 按日期分组
  const byDate = new Map();
  for (const ev of events) {
    if (!ev.start) continue;
    const key = formatLocalDate(
      new Date(ev.start.year, ev.start.month - 1, ev.start.day)
    );
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(ev);
  }

  let imported = 0;
  let skipped = 0;
  const days = [];

  for (const [key, list] of byDate) {
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const existing = getEventsForDate(date);

    for (const ev of list) {
      const converted = {
        uid: ev.uid || ('ics-' + key + '-' + Math.random().toString(36).slice(2, 8)),
        summary: ev.summary || '未命名日程',
        description: ev.description || '',
        location: ev.location || '',
        start: { hour: ev.start.hour, minute: ev.start.minute },
        end: ev.end
          ? { hour: ev.end.hour, minute: ev.end.minute }
          : { hour: ev.start.hour + 1, minute: ev.start.minute },
        imported: true,
      };

      const idx = existing.findIndex((x) => x.uid === converted.uid);
      if (idx >= 0) {
        existing[idx] = converted;   // 覆盖同 UID
      } else {
        existing.push(converted);
      }
      imported++;
    }

    saveEventsForDate(date, existing);
    days.push(key);
  }

  skipped = events.length - imported;
  return { imported, days, skipped };
}

/**
 * 把某天的事件导出为 .ics 文本
 * @param {Date} date - 目标日期
 * @param {Array} extraEvents - 需要一并导出的额外事件（可跨日期）
 * @returns {string} .ics 文本
 */
function exportIcsForDate(date, extraEvents) {
  const dayStr = formatLocalDate(date);
  const events = [];

  for (const ev of getEventsForDate(date)) {
    events.push({
      uid: ev.uid,
      summary: ev.summary,
      description: ev.description,
      location: ev.location,
      start: {
        year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(),
        hour: ev.start.hour, minute: ev.start.minute, allDay: false,
      },
      end: {
        year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(),
        hour: ev.end.hour, minute: ev.end.minute, allDay: false,
      },
    });
  }

  for (const ev of extraEvents || []) {
    events.push(ev);
  }

  return buildIcs(events, '现代日历应用 · ' + dayStr);
}

// CommonJS 测试环境导出（ESM 环境下 module 不存在，条件不成立）
if (typeof module === 'object' && module !== null && typeof module.require === 'function') {
  module.exports = {
    EVENT_KEY_PREFIX,
    getEventsForDate,
    saveEventsForDate,
    createEvent,
    deleteEvent,
    countEventsInMonth,
    hasEventsOn,
    importIcsEvents,
    exportIcsForDate,
  };
}

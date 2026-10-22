/**
 * Calendar 类 —— 日历核心逻辑
 * 负责日期计算与月份切换，不涉及任何 DOM 操作，便于独立测试。
 */

/**
 * 将 Date 对象格式化为本地时区的「YYYY-MM-DD」
 *
 * 注意：不能用 toISOString().split('T')[0] —— 那是 UTC 日期。
 * 在东八区，本地 15 日凌晨之前的时间会被算成 14 日，
 * 导致笔记存到错误的日期键上。
 *
 * @param {Date} date - 目标日期
 * @returns {string} 本地日期字符串，如「2025-11-01」
 */
function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 补零：把数字格式化成两位字符串（09:05） */
function pad2(n) {
  return String(n).padStart(2, '0');
}

class Calendar {
  constructor() {
    this.currentDate = new Date();          // 当前系统日期
    this.year = this.currentDate.getFullYear(); // 当前显示年份
    this.month = this.currentDate.getMonth();   // 当前显示月份（0-11）
  }

  /**
   * 获取指定年月的总天数
   * @param {number} year - 年份
   * @param {number} month - 月份（0-11）
   * @returns {number} 当月天数
   */
  getDaysInMonth(year, month) {
    // new Date(year, month + 1, 0) 为下个月第 0 天，即当月最后一天
    return new Date(year, month + 1, 0).getDate();
  }

  /**
   * 获取指定年月第一天的星期（0-6，0 为周日）
   * @param {number} year - 年份
   * @param {number} month - 月份（0-11）
   * @returns {number} 星期几
   */
  getFirstDayOfMonth(year, month) {
    return new Date(year, month, 1).getDay();
  }

  /**
   * 生成当月日历数据（空白格子 + 有效日期）
   * @returns {Array} 日历数据数组
   */
  generateCalendarData() {
    const daysInMonth = this.getDaysInMonth(this.year, this.month);
    const firstDay = this.getFirstDayOfMonth(this.year, this.month);
    const calendarData = [];

    // 月份第一天前的空白格子
    for (let i = 0; i < firstDay; i++) {
      calendarData.push({ type: 'empty' });
    }

    // 当月有效日期（含是否为今日标识）
    for (let day = 1; day <= daysInMonth; day++) {
      calendarData.push({
        type: 'day',
        value: day,
        isToday: this.isToday(day),
      });
    }
    return calendarData;
  }

  /**
   * 判断指定日期是否为今日
   * @param {number} day - 日期（1-31）
   * @returns {boolean} 是否为今日
   */
  isToday(day) {
    const today = new Date();
    return (
      today.getFullYear() === this.year &&
      today.getMonth() === this.month &&
      today.getDate() === day
    );
  }

  /** 切换至上一月（跨年时同步回退年份） */
  prevMonth() {
    this.month--;
    if (this.month < 0) {
      this.month = 11;
      this.year--;
    }
  }

  /** 切换至下一月（跨年时同步递增年份） */
  nextMonth() {
    this.month++;
    if (this.month > 11) {
      this.month = 0;
      this.year++;
    }
  }

  /** 跳转回今日 */
  goToToday() {
    this.currentDate = new Date();
    this.year = this.currentDate.getFullYear();
    this.month = this.currentDate.getMonth();
  }

  /**
   * 格式化年月（如「2025 年十一月」）
   * @returns {string} 年月字符串
   */
  getFormattedMonthYear() {
    const months = ['一月', '二月', '三月', '四月', '五月', '六月',
      '七月', '八月', '九月', '十月', '十一月', '十二月'];
    return `${this.year}年${months[this.month]}`;
  }
}

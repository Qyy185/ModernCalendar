/**
 * ViewManager —— 月 / 周 / 日 三种视图
 *
 * 月视图是主视图，网格由 CalendarRenderer 渲染。
 * 周视图：一行 7 天，每格列出当天的事件。
 * 日视图：单日详情，事件按时间轴排列。
 *
 * 三种视图共享同一个「当前选中日期」，切换视图不丢状态。
 */

class ViewManager {
  constructor(calendar, renderer) {
    this.calendar = calendar;
    this.renderer = renderer;

    this.mode = 'month';
    this.gridEl = document.getElementById('calendar-grid');
    this.weekEl = document.getElementById('week-view');
    this.dayEl = document.getElementById('day-view');
    this.titleEl = document.getElementById('calendar-title');
    this.subtitleEl = document.getElementById('calendar-subtitle');
    this.prevLabel = document.getElementById('prev-label');
    this.nextLabel = document.getElementById('next-label');
    this.prevBtn = document.getElementById('prev-period');
    this.nextBtn = document.getElementById('next-period');
    this.buttons = Array.from(
      document.querySelectorAll('.nav-item[data-view], .view-btn')
    );

    // 周视图与日视图需要独立的「焦点日期」
    this.focusDate = new Date(
      this.calendar.year, this.calendar.month, 1
    );

    this.bind();
  }

  /** 绑定视图切换按钮 */
  /**
   * 绑定视图切换按钮
   *
   * 切换前要把焦点对齐到「当前选中日期」——
   * 用户在月视图点了 15 号，切到周视图时应该看到 15 号所在的那一周。
   * 焦点日期由外部通过 setSelectedDate 同步进来。
   */
  bind() {
    this.buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.onBeforeSwitch) this.onBeforeSwitch();
        this.setMode(btn.dataset.view);
      });
    });
  }

  /**
   * 切换视图
   * @param {string} mode - 'month' | 'week' | 'day'
   */
  setMode(mode) {
    if (!['month', 'week', 'day'].includes(mode)) return;
    this.mode = mode;

    this.buttons.forEach((b) => {
      b.classList.toggle('active', b.dataset.view === mode);
    });

    this.gridEl.classList.toggle('hidden', mode !== 'month');
    this.weekEl.classList.toggle('hidden', mode !== 'week');
    this.dayEl.classList.toggle('hidden', mode !== 'day');

    // 日视图只显示一天，不需要七列星期标题
    const weekdayHeader = document.getElementById('weekday-header');
    if (weekdayHeader) {
      weekdayHeader.classList.toggle('hidden', mode === 'day');
    }

    this.updateNavLabels();
    this.render();
  }

  /**
   * 同步焦点日期到当前选中日期
   *
   * 为什么要单独一个方法：
   *   用户在月视图点了 15 号，切到周视图时应该看到 15 号所在的那一周，
   *   而不是视图自己记着的旧焦点日期。
   *   否则会出现「刚点完日期切视图，内容跳到别处」的割裂感。
   *
   * @param {Date} date - 当前选中日期
   */
  syncFocus(date) {
    if (!date) return;
    this.focusDate = new Date(
      date.getFullYear(), date.getMonth(), date.getDate()
    );
  }

  /** 更新上一/下一 的文案，随视图变化 */
  updateNavLabels() {
    const labels = {
      month: ['上一月', '下一月'],
      week: ['上一周', '下一周'],
      day: ['前一天', '后一天'],
    };
    const [prev, next] = labels[this.mode];
    if (this.prevLabel) this.prevLabel.textContent = prev;
    if (this.nextLabel) this.nextLabel.textContent = next;
    // 侧边栏方案里按钮只有图标，语义靠 title 传达
    if (this.prevBtn) this.prevBtn.title = prev;
    if (this.nextBtn) this.nextBtn.title = next;
  }

  /** 渲染当前视图 */
  render() {
    if (this.mode === 'month') {
      this.renderer.render();
    } else if (this.mode === 'week') {
      this.renderWeek();
    } else {
      this.renderDay();
    }
    this.updateTitle();
  }

  /** 更新标题与副标题 */
  updateTitle() {
    if (this.mode === 'month') {
      this.titleEl.textContent = this.calendar.getFormattedMonthYear();
      this.subtitleEl.textContent = '';
      return;
    }

    if (this.mode === 'week') {
      const { start, end } = this.getWeekRange();
      this.titleEl.textContent = `${this.formatCn(start)} - ${this.formatCn(end)}`;
      const count = this.countEventsInRange(start, end);
      this.subtitleEl.textContent = count ? `${count} 个日程` : '';
      return;
    }

    this.titleEl.textContent = this.formatCn(this.focusDate);
    const events = getEventsForDate(this.focusDate);
    this.subtitleEl.textContent = events.length ? `${events.length} 个日程` : '';
  }

  /**
   * 取焦点日期所在周（周一起始）的起止
   * @returns {{start:Date, end:Date}}
   */
  getWeekRange() {
    const d = new Date(this.focusDate);
    const day = d.getDay();          // 0=周日
    const offset = day === 0 ? -6 : 1 - day;   // 归到周一
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return { start, end };
  }

  /** 统计区间内的事件总数 */
  countEventsInRange(start, end) {
    let total = 0;
    const cur = new Date(start);
    while (cur <= end) {
      total += getEventsForDate(cur).length;
      cur.setDate(cur.getDate() + 1);
    }
    return total;
  }

  /** 渲染周视图 */
  renderWeek() {
    const { start } = this.getWeekRange();
    const weekNames = ['一', '二', '三', '四', '五', '六', '日'];

    let html = '<div class="week-grid">';
    for (let i = 0; i < 7; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const events = getEventsForDate(d).slice().sort((a, b) => {
        return (a.start.hour * 60 + a.start.minute)
          - (b.start.hour * 60 + b.start.minute);
      });
      const isToday =
        d.getFullYear() === new Date().getFullYear() &&
        d.getMonth() === new Date().getMonth() &&
        d.getDate() === new Date().getDate();
      const isSelected = formatLocalDate(d) === formatLocalDate(this.focusDate);

      html += '<div class="week-col' + (isToday ? ' is-today' : '')
        + (isSelected ? ' is-selected' : '') + '" data-date="' + formatLocalDate(d) + '">';
      html += '<div class="week-col-head">';
      html += '<span class="dow">周' + weekNames[i] + '</span>';
      html += '<span class="dnum">' + d.getDate() + '</span>';
      html += '</div>';

      if (events.length) {
        html += '<div class="week-col-events">';
        for (const ev of events.slice(0, 4)) {
          html += '<div class="day-event-chip" title="'
            + escapeHtml(ev.summary) + '">'
            + '<span class="chip-time">'
            + pad2(ev.start.hour) + ':' + pad2(ev.start.minute) + '</span>'
            + '<span class="chip-title">' + escapeHtml(ev.summary) + '</span></div>';
        }
        if (events.length > 4) {
          html += '<div class="week-more">+' + (events.length - 4) + ' 更多</div>';
        }
        html += '</div>';
      } else {
        html += '<div class="week-empty">—</div>';
      }
      html += '</div>';
    }
    html += '</div>';
    this.weekEl.innerHTML = html;

    // 点击某天 → 切到日视图
    this.weekEl.querySelectorAll('.week-col').forEach((cell) => {
      cell.addEventListener('click', () => {
        const [y, m, dd] = cell.dataset.date.split('-').map(Number);
        this.focusDate = new Date(y, m - 1, dd);
        this.calendar.year = y;
        this.calendar.month = m - 1;
        this.setMode('day');
      });
    });
  }

  /** 渲染日视图 */
  renderDay() {
    const d = this.focusDate;
    const events = getEventsForDate(d).slice().sort((a, b) => {
      return (a.start.hour * 60 + a.start.minute) - (b.start.hour * 60 + b.start.minute);
    });

    let html = '';
    if (!events.length) {
      html += '<div class="day-empty">当天没有安排日程</div>';
    } else {
      html += '<div class="day-timeline">';
      for (const ev of events) {
        html += '<div class="day-event">';
        html += '<div class="day-event-time">' +
          pad2(ev.start.hour) + ':' + pad2(ev.start.minute) +
          '<span class="day-event-dash">-</span>' +
          pad2(ev.end.hour) + ':' + pad2(ev.end.minute) +
          '</div>';
        html += '<div class="day-event-body">';
        html += '<div class="day-event-title">' + escapeHtml(ev.summary) + '</div>';
        if (ev.location) {
          html += '<div class="day-event-loc"><i class="fa fa-map-marker-alt mr-1"></i>' +
            escapeHtml(ev.location) + '</div>';
        }
        if (ev.description) {
          html += '<div class="day-event-desc">' + escapeHtml(ev.description) + '</div>';
        }
        if (ev.imported) {
          html += '<div class="day-event-tag">导入</div>';
        }
        html += '</div></div>';
      }
      html += '</div>';
    }
    this.dayEl.innerHTML = html;
  }

  /**
   * 前进 / 后退一个周期
   * @param {number} delta - -1 上一期，+1 下一期
   */
  shift(delta) {
    if (this.mode === 'month') {
      if (delta < 0) this.calendar.prevMonth();
      else this.calendar.nextMonth();
      this.focusDate = new Date(this.calendar.year, this.calendar.month, 1);
    } else if (this.mode === 'week') {
      this.focusDate = new Date(
        this.focusDate.getFullYear(),
        this.focusDate.getMonth(),
        this.focusDate.getDate() + delta * 7
      );
      this.calendar.year = this.focusDate.getFullYear();
      this.calendar.month = this.focusDate.getMonth();
    } else {
      this.focusDate = new Date(
        this.focusDate.getFullYear(),
        this.focusDate.getMonth(),
        this.focusDate.getDate() + delta
      );
      this.calendar.year = this.focusDate.getFullYear();
      this.calendar.month = this.focusDate.getMonth();
    }
    this.render();
  }

  /** 回到今天 */
  goToday() {
    this.calendar.goToToday();
    this.focusDate = new Date(
      this.calendar.year, this.calendar.month, this.calendar.currentDate.getDate()
    );
    this.render();
  }

  /**
   * 格式化为「2026年10月22日 星期四」
   * @param {Date} d - 日期
   * @returns {string} 格式化文本
   */
  formatCn(d) {
    const w = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 星期' + w;
  }
}

/** HTML 转义，防止事件标题里的特殊字符破坏结构 */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// CommonJS 测试环境导出
if (typeof module === 'object' && module !== null && typeof module.require === 'function') {
  module.exports = { ViewManager, pad2, escapeHtml };
}

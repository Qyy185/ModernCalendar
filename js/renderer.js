/**
 * CalendarRenderer 类 —— 界面渲染与交互
 * 负责日历网格生成、日期选中高亮、笔记的读取与自动保存。
 */
class CalendarRenderer {
  constructor(calendar, container) {
    this.calendar = calendar;
    this.container = container;
    this.titleElement = document.getElementById('calendar-title');
    this.selectedDayEl = null;  // 当前选中的日期元素
    this.noteTimer = null;      // 笔记自动保存定时器
    this.bindNoteAutoSave();
  }

  /** 渲染入口：更新标题 + 网格 + 高亮选中日期 */
  render() {
    this.updateTitle();
    this.renderCalendarGrid();
    this.highlightSavedSelectedDate();
  }

  /** 更新日历标题（显示当前年月） */
  updateTitle() {
    this.titleElement.textContent = this.calendar.getFormattedMonthYear();
  }

  /** 渲染日历网格 */
  renderCalendarGrid() {
    // 清除旧高亮（选中 / 跳转）
    document.querySelectorAll('.is-selected, .is-jumped').forEach((el) => {
      el.classList.remove('is-selected', 'is-jumped');
    });
    this.selectedDayEl = null;

    const calendarData = this.calendar.generateCalendarData();
    this.container.innerHTML = '';

    calendarData.forEach((day) => {
      const dayEl = document.createElement('div');
      dayEl.className = 'day-cell';

      if (day.type === 'empty') {
        dayEl.classList.add('is-empty');
      } else {
        const dateObj = new Date(this.calendar.year, this.calendar.month, day.value);
        const events = getEventsForDate(dateObj)
          .slice()
          .sort((a, b) => (a.start.hour * 60 + a.start.minute)
            - (b.start.hour * 60 + b.start.minute));

        // 日期数字
        const num = document.createElement('span');
        num.className = 'day-num';
        num.textContent = day.value;
        dayEl.appendChild(num);

        // 格子内直接显示日程条（Google 日历的做法）：
        // 不用点进去才知道当天有什么
        const maxChips = this.maxChips();
        events.slice(0, maxChips).forEach((ev) => {
          const chip = document.createElement('div');
          chip.className = 'day-event-chip';
          chip.title = `${pad2(ev.start.hour)}:${pad2(ev.start.minute)} `
            + `${ev.summary}${ev.location ? ' · ' + ev.location : ''}`;

          const t = document.createElement('span');
          t.className = 'chip-time';
          t.textContent = `${pad2(ev.start.hour)}:${pad2(ev.start.minute)}`;
          chip.appendChild(t);

          const title = document.createElement('span');
          title.className = 'chip-title';
          title.textContent = ev.summary;
          chip.appendChild(title);

          dayEl.appendChild(chip);
        });

        if (events.length > maxChips) {
          const more = document.createElement('div');
          more.className = 'day-more';
          more.textContent = `+${events.length - maxChips} 更多`;
          dayEl.appendChild(more);
        }

        dayEl.dataset.day = day.value;

        if (day.isToday) {
          dayEl.classList.add('is-today');
        } else {
          dayEl.addEventListener('click', () => this.handleDayClick(day.value, dayEl));
        }
      }
      this.container.appendChild(dayEl);
    });
  }

  /**
   * 格子内最多显示几条日程
   * 视口越宽格子越高，能显示的越多
   * @returns {number} 条数上限
   */
  maxChips() {
    const w = window.innerWidth;
    if (w < 760) return 1;
    if (w < 1100) return 2;
    return 3;
  }

  /**
   * 处理日期点击：切换选中、加载对应笔记
   * @param {number} day - 日期值
   * @param {HTMLElement} dayEl - 日期元素
   */
  handleDayClick(day, dayEl) {
    // 切换前先保存当前笔记，避免被下一次切换覆盖
    this.saveCurrentNote();

    if (this.selectedDayEl) {
      this.selectedDayEl.classList.remove('is-selected');
    }
    dayEl.classList.add('is-selected');
    this.selectedDayEl = dayEl;

    const selectedDate = new Date(this.calendar.year, this.calendar.month, day);
    const note = this.getNoteForDate(selectedDate);
    document.getElementById('notes-area').value = note || '';

    this.setSelectedDate(selectedDate);

    // 通知外部：选中日期变了（更新右侧栏的日期标签与日程列表）
    this.onSelectDate && this.onSelectDate(selectedDate);
  }

  /** 绑定笔记自动保存：输入停止 1 秒后写入 localStorage */
  bindNoteAutoSave() {
    const notesArea = document.getElementById('notes-area');
    notesArea.addEventListener('input', () => {
      // 清除上一次定时器，避免快速输入时多次触发
      if (this.noteTimer) clearTimeout(this.noteTimer);
      this.noteTimer = setTimeout(() => {
        this.saveCurrentNote();
      }, 1000);
    });
  }

  /** 保存当前笔记到 localStorage */
  saveCurrentNote() {
    const selectedDate = this.getSelectedDate();
    if (!selectedDate) return;
    const dateStr = formatLocalDate(selectedDate);
    const noteContent = document.getElementById('notes-area').value.trim();
    localStorage.setItem(`calendar_note_${dateStr}`, noteContent);
  }

  /**
   * 读取指定日期的笔记
   * @param {Date} date - 目标日期
   * @returns {string|null} 笔记内容
   */
  getNoteForDate(date) {
    const dateStr = formatLocalDate(date);
    return localStorage.getItem(`calendar_note_${dateStr}`);
  }

  /**
   * 保存选中日期到 localStorage
   *
   * 存本地日期串「YYYY-MM-DD」而不是 ISO 时间戳：
   * ISO 串是 UTC，读回来按本地时区取 getDate() 会偏移一天，
   * 导致「回今天」后选中的日期对不上。
   *
   * @param {Date} date - 选中日期
   */
  setSelectedDate(date) {
    localStorage.setItem('calendar_selected_date', formatLocalDate(date));
  }

  /**
   * 读取 localStorage 中保存的选中日期
   * @returns {Date|null} 选中日期
   */
  getSelectedDate() {
    const dateStr = localStorage.getItem('calendar_selected_date');
    if (!dateStr) return null;
    // 兼容早期版本存的 ISO 时间戳
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date(dateStr);
  }

  /** 高亮上次保存的选中日期（仅当它落在当前显示月份内） */
  highlightSavedSelectedDate() {
    const selectedDate = this.getSelectedDate();
    if (!selectedDate) return;

    if (
      selectedDate.getFullYear() === this.calendar.year &&
      selectedDate.getMonth() === this.calendar.month
    ) {
      const day = selectedDate.getDate();
      this.selectedDayEl = document.querySelector(`.calendar-day[data-day="${day}"]`);
      if (this.selectedDayEl) {
        this.selectedDayEl.classList.add('is-selected');
        const note = this.getNoteForDate(selectedDate);
        document.getElementById('notes-area').value = note || '';
      }
    }
  }
}

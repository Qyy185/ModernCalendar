/**
 * DateJump 类 —— 日期跳转控制
 * 负责模态框交互与目标日期合法性校验。
 */
class DateJump {
  constructor(calendar, renderer) {
    this.calendar = calendar;
    this.renderer = renderer;

    this.modal = document.getElementById('jump-modal');
    this.yearInput = document.getElementById('jump-year');
    this.monthInput = document.getElementById('jump-month');
    this.dayInput = document.getElementById('jump-day');
    this.errorElement = document.getElementById('jump-error');

    this.bindEvents();
  }

  /** 绑定弹窗打开 / 关闭 / 确认跳转事件 */
  bindEvents() {
    document.getElementById('jump-btn').addEventListener('click', () => this.openModal());
    document.getElementById('jump-cancel').addEventListener('click', () => this.closeModal());
    document.getElementById('jump-confirm').addEventListener('click', () => this.handleJump());

    // 点击遮罩层关闭弹窗
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.closeModal();
    });

    // ESC 关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeModal();
    });
  }

  /** 打开弹窗并预填当前年月 */
  openModal() {
    this.yearInput.value = this.calendar.year;
    this.monthInput.value = this.calendar.month + 1;
    this.dayInput.value = 1;
    this.errorElement.textContent = '';

    this.modal.classList.remove('hidden');
    this.modal.classList.add('opacity-100', 'pointer-events-auto');
    this.yearInput.focus();
  }

  /** 关闭弹窗 */
  closeModal() {
    this.modal.classList.add('hidden');
    this.modal.classList.remove('opacity-100', 'pointer-events-auto');
  }

  /**
   * 校验日期是否真实存在
   * 先做范围校验，再做有效性校验（如 2 月 30 日）
   * @returns {boolean} 是否合法
   */
  validateDate(year, month, day) {
    if (year < 1900 || year > 2100) {
      this.showError('年份需在 1900 - 2100 之间');
      return false;
    }
    if (month < 1 || month > 12) {
      this.showError('月份需在 1 - 12 之间');
      return false;
    }
    if (day < 1 || day > 31) {
      this.showError('日期需在 1 - 31 之间');
      return false;
    }

    // 有效性校验：构造 Date 后反向对比各字段
    const d = new Date(year, month - 1, day);
    if (
      d.getFullYear() !== year ||
      d.getMonth() !== month - 1 ||
      d.getDate() !== day
    ) {
      this.showError('该日期不存在');
      return false;
    }
    return true;
  }

  /** 显示错误提示 */
  showError(message) {
    this.errorElement.textContent = message;
    this.errorElement.classList.remove('hidden');
  }

  /** 清除错误提示 */
  clearError() {
    this.errorElement.textContent = '';
    this.errorElement.classList.add('hidden');
  }

  /** 确认跳转：校验通过则更新日历并高亮目标日期 */
  handleJump() {
    const year = parseInt(this.yearInput.value, 10);
    const month = parseInt(this.monthInput.value, 10);
    const day = parseInt(this.dayInput.value, 10);

    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
      this.showError('请输入完整的日期');
      return;
    }
    if (!this.validateDate(year, month, day)) return;

    this.clearError();

    // 保存当前笔记后再切换，避免丢失
    this.renderer.saveCurrentNote();

    this.calendar.year = year;
    this.calendar.month = month - 1;
    this.renderer.render();

    // 找到目标日期元素并加上跳转标记 + 震动反馈
    const targetEl = document.querySelector(`.calendar-day[data-day="${day}"]`);
    if (targetEl) {
      targetEl.classList.add('is-jumped', 'is-selected');
      targetEl.classList.add('shake');
      this.renderer.selectedDayEl = targetEl;

      const targetDate = new Date(year, month - 1, day);
      const note = this.renderer.getNoteForDate(targetDate);
      document.getElementById('notes-area').value = note || '';
      this.renderer.setSelectedDate(targetDate);

      // 通知外部：跳转改变了选中日期（同步右侧栏与视图焦点）
      this.renderer.onSelectDate && this.renderer.onSelectDate(targetDate);
    }

    this.closeModal();
  }
}

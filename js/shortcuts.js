/**
 * ShortcutManager —— 键盘快捷键
 *
 * 设计原则：
 *   1. 输入框、文本域里不拦截（否则打字会触发动作）
 *   2. 弹窗打开时只响应 Esc
 *   3. 快捷键集中在一处注册，方便对照面板上的说明
 */
class ShortcutManager {
  /**
   * @param {Object} actions - {today, setView, shift, newEvent, openSearch}
   */
  constructor(actions) {
    this.actions = actions || {};
    this.panel = document.getElementById('shortcut-panel');
    this.closeBtn = document.getElementById('shortcut-close');
    this.openBtn = document.getElementById('shortcut-btn');

    if (this.openBtn) {
      this.openBtn.addEventListener('click', () => this.toggle());
    }
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }
    if (this.panel) {
      this.panel.addEventListener('click', (e) => {
        if (e.target === this.panel) this.close();
      });
    }

    document.addEventListener('keydown', (e) => this.onKeyDown(e));
  }

  /** 打开 / 关闭快捷键面板 */
  toggle() {
    if (!this.panel) return;
    if (this.panel.classList.contains('hidden')) {
      this.panel.classList.remove('hidden');
    } else {
      this.close();
    }
  }

  /** 关闭面板 */
  close() {
    if (this.panel) this.panel.classList.add('hidden');
  }

  /** 当前是否有弹窗处于打开状态（此时只响应 Esc） */
  hasOpenModal() {
    const modals = document.querySelectorAll('.modal, .overlay');
    for (const m of modals) {
      if (!m.classList.contains('hidden')) return true;
    }
    return false;
  }

  /** 判断焦点是否在可输入元素里 */
  isTyping(target) {
    if (!target) return false;
    const tag = (target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return true;
    return target.isContentEditable === true;
  }

  /**
   * 处理按键
   * @param {KeyboardEvent} e - 键盘事件
   */
  onKeyDown(e) {
    // 弹窗打开时只处理 Esc
    if (this.hasOpenModal()) {
      if (e.key === 'Escape') {
        const open = document.querySelectorAll('.modal:not(.hidden), .overlay:not(.hidden)');
        for (const m of open) m.classList.add('hidden');
      }
      return;
    }

    // 输入中不拦截
    if (this.isTyping(e.target)) {
      if (e.key === 'Escape' && e.target.blur) e.target.blur();
      return;
    }

    // ⌘/Ctrl + 组合键交给浏览器
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const key = e.key;

    switch (key) {
      case 't':
      case 'T':
        this.actions.today && this.actions.today();
        break;
      case 'm':
      case 'M':
        this.actions.setView && this.actions.setView('month');
        break;
      case 'w':
      case 'W':
        this.actions.setView && this.actions.setView('week');
        break;
      case 'd':
      case 'D':
        this.actions.setView && this.actions.setView('day');
        break;
      case 'n':
      case 'N':
        this.actions.newEvent && this.actions.newEvent();
        break;
      case '/':
        e.preventDefault();
        this.actions.openSearch && this.actions.openSearch();
        break;
      case '?':
        this.toggle();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.actions.shift && this.actions.shift(-1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.actions.shift && this.actions.shift(1);
        break;
      default:
        return;
    }

    if (key !== 'ArrowLeft' && key !== 'ArrowRight') e.preventDefault();
  }
}

// Node 测试环境导出
if (typeof module === 'object' && module !== null && typeof module.require === 'function') {
  module.exports = { ShortcutManager };
}

/**
 * ThemeManager —— 深色 / 浅色模式
 *
 * 实现方式：用 CSS 变量集中管理颜色，切换时只改 <html> 的 data-theme 属性。
 * 选 CSS 变量而不是 Tailwind 的 dark: 变体，有两个原因：
 *   1. Tailwind CDN 版是运行时扫描 DOM 生成样式的，
 *      dark: 变体需要 darkMode 配置 + 类名切换，两套机制混用容易出优先级问题
 *   2. 变量方案让「新增一个自定义组件」时只需要读变量，不用关心当前主题
 *
 * 用户偏好存 localStorage，刷新后保持。
 */

const THEME_KEY = 'calendar_theme';
const THEMES = ['light', 'dark'];

class ThemeManager {
  constructor() {
    this.toggleBtn = document.getElementById('theme-toggle');
    this.iconEl = document.getElementById('theme-icon');
    this.current = this.load();
    this.apply();
    this.bind();
  }

  /** 读取保存过的主题，没有则跟系统偏好 */
  load() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (THEMES.includes(saved)) return saved;
    } catch (e) {
      // localStorage 不可用（隐私模式等），忽略
    }
    const prefersDark = window.matchMedia
      && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  }

  /** 应用主题到 DOM */
  apply() {
    document.documentElement.setAttribute('data-theme', this.current);

    if (this.iconEl) {
      this.iconEl.classList.toggle('fa-moon', this.current === 'light');
      this.iconEl.classList.toggle('fa-sun', this.current === 'dark');
    }

    if (this.toggleBtn) {
      const dark = this.current === 'dark';
      this.toggleBtn.title = dark ? '切换到浅色模式' : '切换到深色模式';
      // 按钮上的文字也跟着变，让人知道点一下会切到什么
      const label = this.toggleBtn.querySelector('span');
      if (label) label.textContent = dark ? '浅色模式' : '深色模式';
    }
  }

  /** 保存偏好 */
  persist() {
    try {
      localStorage.setItem(THEME_KEY, this.current);
    } catch (e) {
      // 忽略写入失败
    }
  }

  /** 绑定切换按钮 */
  bind() {
    if (!this.toggleBtn) return;
    this.toggleBtn.addEventListener('click', () => {
      this.current = this.current === 'light' ? 'dark' : 'light';
      this.apply();
      this.persist();
    });
  }

  /** 供外部查询当前主题 */
  isDark() {
    return this.current === 'dark';
  }
}

// CommonJS 测试环境导出
if (typeof module === 'object' && module !== null && typeof module.require === 'function') {
  module.exports = { THEME_KEY, THEMES, ThemeManager };
}

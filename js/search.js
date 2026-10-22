/**
 * SearchController —— 搜索笔记与日程
 *
 * 数据都在 localStorage 里，搜索直接扫全量：
 *   · 笔记键：calendar_note_YYYY-MM-DD
 *   · 日程键：calendar_event_YYYY-MM-DD
 * 一年份的量级（几千条）全扫一遍也就几毫秒，不需要建索引。
 */
class SearchController {
  constructor() {
    this.panel = document.getElementById('search-panel');
    this.input = document.getElementById('search-input');
    this.results = document.getElementById('search-results');
    this.openBtn = document.getElementById('search-btn');
    this.closeBtn = document.getElementById('search-close');
    this.onJump = null;   // 外部注入：跳到某个日期

    if (this.openBtn) this.openBtn.addEventListener('click', () => this.open());
    if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.close());

    if (this.panel) {
      this.panel.addEventListener('click', (e) => {
        if (e.target === this.panel) this.close();
      });
    }

    if (this.input) {
      this.input.addEventListener('input', () => this.search(this.input.value));
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.panel.classList.contains('hidden')) {
        this.close();
      }
    });
  }

  /** 打开搜索面板 */
  open() {
    if (!this.panel) return;
    this.panel.classList.remove('hidden');
    this.input.value = '';
    this.results.innerHTML = '<p class="empty-tip">输入关键词开始搜索</p>';
    this.input.focus();
  }

  /** 关闭搜索面板 */
  close() {
    if (!this.panel) return;
    this.panel.classList.add('hidden');
  }

  /** 当前是否打开 */
  isOpen() {
    return this.panel && !this.panel.classList.contains('hidden');
  }

  /**
   * 扫描 localStorage，找出匹配的笔记与日程
   * @param {string} keyword - 关键词
   * @returns {Array} 命中项数组
   */
  static scan(keyword) {
    const kw = String(keyword || '').trim().toLowerCase();
    if (!kw) return [];

    const hits = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      if (key.indexOf('calendar_note_') === 0) {
        const value = localStorage.getItem(key) || '';
        if (value.toLowerCase().indexOf(kw) === -1) continue;
        const date = key.slice('calendar_note_'.length);
        hits.push({
          type: 'note',
          date,
          title: date,
          snippet: value,
        });
      } else if (key.indexOf('calendar_event_') === 0) {
        const date = key.slice('calendar_event_'.length);
        let list = [];
        try {
          list = JSON.parse(localStorage.getItem(key) || '[]');
        } catch (e) {
          list = [];
        }
        for (const ev of list) {
          const hay = `${ev.summary || ''} ${ev.description || ''} ${ev.location || ''}`
            .toLowerCase();
          if (hay.indexOf(kw) === -1) continue;
          hits.push({
            type: 'event',
            date,
            title: ev.summary || '未命名日程',
            snippet: [
              `${pad2(ev.start.hour)}:${pad2(ev.start.minute)} - `
              + `${pad2(ev.end.hour)}:${pad2(ev.end.minute)}`,
              ev.location,
              ev.description,
            ].filter(Boolean).join(' · '),
          });
        }
      }
    }

    // 笔记在前按日期倒序，日程按日期倒序
    hits.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return hits;
  }

  /**
   * 执行搜索并渲染结果
   * @param {string} keyword - 关键词
   */
  search(keyword) {
    const kw = String(keyword || '').trim();
    if (!kw) {
      this.results.innerHTML = '<p class="empty-tip">输入关键词开始搜索</p>';
      return;
    }

    const hits = SearchController.scan(kw);

    if (!hits.length) {
      this.results.innerHTML =
        `<p class="empty-tip">没有找到与「${escapeHtml(kw)}」相关的内容</p>`;
      return;
    }

    let html = `<p class="hint" style="padding:4px 12px 8px">找到 ${hits.length} 条结果</p>`;
    for (const hit of hits) {
      const isNote = hit.type === 'note';
      html += '<div class="search-hit" data-type="' + hit.type
        + '" data-date="' + escapeHtml(hit.date) + '">';
      html += '<div class="search-hit-icon ' + (isNote ? 'note' : 'event') + '">'
        + '<i class="fa ' + (isNote ? 'fa-sticky-note' : 'fa-calendar-day') + '"></i></div>';
      html += '<div class="search-hit-body">';
      html += '<div class="search-hit-title">' + escapeHtml(hit.title) + '</div>';
      html += '<div class="search-hit-snippet">' + escapeHtml(hit.snippet) + '</div>';
      html += '</div>';
      html += '<div class="search-hit-date">' + escapeHtml(hit.date) + '</div>';
      html += '</div>';
    }
    this.results.innerHTML = html;

    // 点击结果 → 跳到那天
    this.results.querySelectorAll('.search-hit').forEach((el) => {
      el.addEventListener('click', () => {
        const [y, m, d] = el.dataset.date.split('-').map(Number);
        this.close();
        if (this.onJump) this.onJump(new Date(y, m - 1, d));
      });
    });
  }
}

// Node 测试环境导出
if (typeof module === 'object' && module !== null && typeof module.require === 'function') {
  module.exports = { SearchController };
}

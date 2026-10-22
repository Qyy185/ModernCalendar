/**
 * 应用主入口 —— 初始化各模块并绑定工具栏事件
 */
document.addEventListener('DOMContentLoaded', () => {
  const calendar = new Calendar();
  const renderer = new CalendarRenderer(
    calendar,
    document.getElementById('calendar-grid')
  );
  const dateJump = new DateJump(calendar, renderer);

  const notesArea = document.getElementById('notes-area');

  // ── 首次渲染
  renderer.render();
  updateCurrentDate();

  // ── 工具栏：上一月 / 下一月 / 今天
  document.getElementById('prev-month').addEventListener('click', () => {
    renderer.saveCurrentNote();
    calendar.prevMonth();
    renderer.render();
  });

  document.getElementById('next-month').addEventListener('click', () => {
    renderer.saveCurrentNote();
    calendar.nextMonth();
    renderer.render();
  });

  document.getElementById('today-btn').addEventListener('click', () => {
    renderer.saveCurrentNote();
    calendar.goToToday();
    renderer.render();
  });

  // ── 文件操作：保存 / 打开 / 清空
  document.getElementById('save-btn').addEventListener('click', () => {
    const selectedDate = renderer.getSelectedDate();
    const dateStr = selectedDate
      ? formatLocalDate(selectedDate)
      : formatLocalDate(new Date());
    FileHandler.saveTextToFile(notesArea.value, `${dateStr}_笔记.txt`);
  });

  document.getElementById('open-btn').addEventListener('click', () => {
    FileHandler.loadTextFromFile((content) => {
      notesArea.value = content;
      renderer.saveCurrentNote();
    });
  });

  document.getElementById('clear-btn').addEventListener('click', () => {
    const selectedDate = renderer.getSelectedDate();
    if (!selectedDate) {
      notesArea.value = '';
      return;
    }
    const dateStr = formatLocalDate(selectedDate);
    if (window.confirm(`确定清空 ${dateStr} 的笔记吗？此操作不可恢复。`)) {
      notesArea.value = '';
      localStorage.removeItem(`calendar_note_${dateStr}`);
    }
  });

  // ── 页面关闭前强制保存，防止最后 1 秒内的输入丢失
  window.addEventListener('beforeunload', () => {
    renderer.saveCurrentNote();
  });

  /**
   * 更新顶部与底部的当前日期显示
   */
  function updateCurrentDate() {
    const text = new Date().toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
    document.getElementById('current-date').textContent = text;
    document.getElementById('footer-date').textContent = text;
  }

  // 暴露到全局，便于在控制台调试
  window.calendarApp = { calendar, renderer, dateJump };
});

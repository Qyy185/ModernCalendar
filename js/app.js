/**
 * 应用主入口 —— 初始化各模块并绑定交互
 */
document.addEventListener('DOMContentLoaded', () => {
  const calendar = new Calendar();
  const renderer = new CalendarRenderer(
    calendar,
    document.getElementById('calendar-grid')
  );
  const dateJump = new DateJump(calendar, renderer);
  const theme = new ThemeManager();
  const views = new ViewManager(calendar, renderer);
  const aiSummary = new AiSummaryController(calendar);
  const search = new SearchController();
  const shortcuts = new ShortcutManager({});

  const notesArea = document.getElementById('notes-area');
  const eventList = document.getElementById('event-list');
  const noteDateLabel = document.getElementById('note-date-label');
  const eventDateLabel = document.getElementById('event-date-label');
  const mobileTitle = document.getElementById('mobile-title');

  // ── 当前选中的日期（全局唯一来源）
  let selectedDate = new Date(
    calendar.year, calendar.month, calendar.currentDate.getDate()
  );

  /**
   * 渲染右侧「日程」列表
   * @param {Date} date - 目标日期
   */
  function renderEventList(date) {
    if (!eventList) return;
    const events = getEventsForDate(date).slice().sort((a, b) => {
      return (a.start.hour * 60 + a.start.minute)
        - (b.start.hour * 60 + b.start.minute);
    });

    if (!events.length) {
      eventList.innerHTML = '<p class="empty-tip">当天暂无日程</p>';
      return;
    }

    let html = '';
    for (const ev of events) {
      html += '<div class="event-item" data-uid="' + escapeHtml(ev.uid) + '">';
      html += '<div class="event-time">'
        + pad2(ev.start.hour) + ':' + pad2(ev.start.minute)
        + '<span class="event-dash">-</span>'
        + pad2(ev.end.hour) + ':' + pad2(ev.end.minute) + '</div>';
      html += '<div class="event-body">';
      html += '<div class="event-title">' + escapeHtml(ev.summary) + '</div>';
      if (ev.location) {
        html += '<div class="event-loc"><i class="fa fa-map-marker-alt mr-1"></i>'
          + escapeHtml(ev.location) + '</div>';
      }
      if (ev.imported) {
        html += '<div class="event-tag">导入</div>';
      }
      html += '</div>';
      html += '<button class="event-del" data-uid="' + escapeHtml(ev.uid)
        + '" title="删除该日程"><i class="fa fa-times"></i></button>';
      html += '</div>';
    }
    eventList.innerHTML = html;

    eventList.querySelectorAll('.event-del').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const uid = btn.dataset.uid;
        if (!window.confirm('确定删除这条日程吗？')) return;
        deleteEvent(selectedDate, uid);
        renderEventList(selectedDate);
        views.render();
      });
    });
  }

  /**
   * 选中日期变化时的统一处理
   * @param {Date} date - 新选中的日期
   */
  function onSelectDate(date) {
    selectedDate = date;
    const cn = views.formatCn(date);
    if (noteDateLabel) noteDateLabel.textContent = cn.replace(' 星期', ' 周');
    if (eventDateLabel) eventDateLabel.textContent = cn.replace(' 星期', ' 周');
    if (mobileTitle) mobileTitle.textContent = cn;
    renderEventList(date);
  }

  renderer.onSelectDate = onSelectDate;

  // 切视图前把视图焦点对齐到当前选中日期
  views.onBeforeSwitch = () => views.syncFocus(selectedDate);

  // ── 演示数据模式：?demo=1
  // 仅用于生成 README 里的界面截图，正常使用不会触发。
  if (/[?&]demo=1\b/.test(location.search)) {
    seedDemoData();
  }

  // ── 首次渲染
  views.render();
  updateCurrentDate();
  onSelectDate(selectedDate);

  // 恢复上次选中的日期
  const saved = renderer.getSelectedDate();
  if (saved) {
    calendar.year = saved.getFullYear();
    calendar.month = saved.getMonth();
    views.focusDate = saved;
    views.render();
    onSelectDate(saved);
    notesArea.value = renderer.getNoteForDate(saved) || '';
  }

  /**
   * 灌入演示数据（仅 ?demo=1 时调用）
   * 覆盖当前月份，日期相对「今天」计算，任何时候打开都有内容
   */
  function seedDemoData() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    const at = (day) => new Date(y, m, day);
    const mk = (day, items) => saveEventsForDate(at(day), items);

    localStorage.clear();

    mk(15, [
      createEvent({
        summary: '甲秀楼', location: '贵州省贵阳市',
        start: { hour: 9, minute: 30 }, end: { hour: 11, minute: 30 },
      }),
      createEvent({
        summary: '黔灵山公园', location: '贵阳市观山湖区',
        start: { hour: 14, minute: 0 }, end: { hour: 16, minute: 0 },
      }),
    ]);
    mk(17, [
      createEvent({
        summary: '青岩古镇', location: '贵阳市花溪区',
        start: { hour: 9, minute: 0 }, end: { hour: 12, minute: 0 },
      }),
    ]);
    mk(20, [
      createEvent({
        summary: '项目评审', location: '线上会议',
        start: { hour: 14, minute: 0 }, end: { hour: 15, minute: 30 },
      }),
      createEvent({
        summary: '知识库切片调优', location: '图书馆',
        start: { hour: 19, minute: 0 }, end: { hour: 21, minute: 0 },
      }),
    ]);
    mk(now.getDate(), [
      createEvent({
        summary: '秋招现场：校招双选会', location: '西校区体育馆',
        start: { hour: 8, minute: 30 }, end: { hour: 11, minute: 30 },
      }),
      createEvent({
        summary: 'GitHub 仓库整理', location: '图书馆',
        start: { hour: 14, minute: 0 }, end: { hour: 16, minute: 0 },
      }),
    ]);

    localStorage.setItem(
      `calendar_note_${formatLocalDate(at(15))}`,
      '完成课程设计报告初稿\n优化了日历网格的渲染'
    );
    localStorage.setItem(
      `calendar_note_${formatLocalDate(at(18))}`,
      '整理了知识库切片策略的笔记'
    );
    localStorage.setItem(
      `calendar_note_${formatLocalDate(now)}`,
      '秋招准备：打印简历、加 GitHub 链接'
    );
  }

  // ── 视图切换由 ViewManager 内部统一处理（views.js 的 bind()）
  //    这里不再重复绑定，否则一次点击会触发两次 setMode

  // ── 上一期 / 下一期 / 今天
  document.getElementById('prev-period').addEventListener('click', () => {
    renderer.saveCurrentNote();
    views.shift(-1);
    onSelectDate(views.focusDate);
  });

  document.getElementById('next-period').addEventListener('click', () => {
    renderer.saveCurrentNote();
    views.shift(1);
    onSelectDate(views.focusDate);
  });

  document.getElementById('today-btn').addEventListener('click', () => {
    renderer.saveCurrentNote();
    views.goToday();
    onSelectDate(views.focusDate);
  });

  // ── 笔记文件操作
  document.getElementById('save-btn').addEventListener('click', () => {
    const dateStr = formatLocalDate(selectedDate);
    FileHandler.saveTextToFile(notesArea.value, `${dateStr}_笔记.txt`);
  });

  document.getElementById('open-btn').addEventListener('click', () => {
    FileHandler.loadTextFromFile((content) => {
      notesArea.value = content;
      renderer.saveCurrentNote();
    });
  });

  document.getElementById('clear-btn').addEventListener('click', () => {
    const dateStr = formatLocalDate(selectedDate);
    if (window.confirm(`确定清空 ${dateStr} 的笔记吗？此操作不可恢复。`)) {
      notesArea.value = '';
      localStorage.removeItem(`calendar_note_${dateStr}`);
    }
  });

  // ── .ics 日程
  document.getElementById('import-ics-btn').addEventListener('click', () => {
    FileHandler.loadIcsFile((content, filename) => {
      const result = importIcsEvents(content);
      if (!result.imported) {
        window.alert('这个文件里没有解析到日程，请确认是 .ics 格式。');
        return;
      }
      const dayMsg = result.days.length === 1
        ? result.days[0]
        : `${result.days.length} 天`;
      window.alert(
        `已导入 ${result.imported} 条日程（${dayMsg}）\n来自文件：${filename || '未命名'}`
      );
      views.render();
      onSelectDate(selectedDate);
    });
  });

  document.getElementById('export-ics-btn').addEventListener('click', () => {
    const events = getEventsForDate(selectedDate);
    if (!events.length) {
      window.alert('当天没有日程可以导出。');
      return;
    }
    const ics = exportIcsForDate(selectedDate);
    const dateStr = formatLocalDate(selectedDate);
    FileHandler.saveIcsFile(ics, `日程-${dateStr}.ics`);
  });

  // ── 新增日程
  const eventModal = document.getElementById('event-modal');
  const eventTitle = document.getElementById('event-title');
  const eventStart = document.getElementById('event-start');
  const eventEnd = document.getElementById('event-end');
  const eventLocation = document.getElementById('event-location');
  const eventError = document.getElementById('event-error');

  function openEventModal() {
    eventTitle.value = '';
    eventStart.value = '09:00';
    eventEnd.value = '10:30';
    eventLocation.value = '';
    eventError.classList.add('hidden');
    eventModal.classList.remove('hidden');
    eventTitle.focus();
  }

  function closeEventModal() {
    eventModal.classList.add('hidden');
  }

  document.getElementById('add-event-btn').addEventListener('click', openEventModal);
  const mobileAddBtn = document.getElementById('mobile-add-btn');
  if (mobileAddBtn) mobileAddBtn.addEventListener('click', openEventModal);
  document.getElementById('event-cancel').addEventListener('click', closeEventModal);
  document.getElementById('event-cancel-2').addEventListener('click', closeEventModal);

  document.getElementById('event-save').addEventListener('click', () => {
    const title = eventTitle.value.trim();
    if (!title) {
      eventError.textContent = '请填写标题';
      eventError.classList.remove('hidden');
      return;
    }

    const parseTime = (v) => {
      const [h, m] = String(v || '00:00').split(':').map(Number);
      return { hour: h || 0, minute: m || 0 };
    };

    const start = parseTime(eventStart.value);
    const end = parseTime(eventEnd.value);
    if (end.hour * 60 + end.minute <= start.hour * 60 + start.minute) {
      eventError.textContent = '结束时间要晚于开始时间';
      eventError.classList.remove('hidden');
      return;
    }

    const list = getEventsForDate(selectedDate);
    list.push(createEvent({
      summary: title,
      location: eventLocation.value.trim(),
      start,
      end,
    }));
    saveEventsForDate(selectedDate, list);

    closeEventModal();
    renderEventList(selectedDate);
    views.render();
  });

  // ── 移动端侧边栏抽屉
  const sidebar = document.getElementById('sidebar');
  const menuToggle = document.getElementById('menu-toggle');
  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
    document.querySelector('.main-area').addEventListener('click', () => {
      sidebar.classList.remove('open');
    });
  }

  // ── 搜索：点结果跳到那天
  search.onJump = (date) => {
    calendar.year = date.getFullYear();
    calendar.month = date.getMonth();
    views.focusDate = date;
    views.syncFocus(date);
    views.setMode('day');
    onSelectDate(date);
    notesArea.value = renderer.getNoteForDate(date) || '';
  };

  // ── 键盘快捷键
  shortcuts.actions = {
    today: () => {
      renderer.saveCurrentNote();
      views.goToday();
      onSelectDate(views.focusDate);
    },
    setView: (mode) => {
      views.syncFocus(selectedDate);
      views.setMode(mode);
    },
    shift: (delta) => {
      renderer.saveCurrentNote();
      views.shift(delta);
      onSelectDate(views.focusDate);
    },
    newEvent: openEventModal,
    openSearch: () => search.open(),
  };

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
    const el = document.getElementById('current-date');
    if (el) el.textContent = text;
  }

  // 暴露到全局，便于在控制台调试
  window.calendarApp = {
    calendar, renderer, dateJump, theme, views, aiSummary, search, shortcuts,
    getSelectedDate: () => selectedDate,
  };
});

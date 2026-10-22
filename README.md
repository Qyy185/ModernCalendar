# 现代日历应用 · Modern Calendar

> 齐齐哈尔大学 · 软件开发课程设计（2025.09.25 – 2025.11.25）
> 团队：张桓浩 / 邹晔铖 / 吴奇
> 技术栈：原生 JavaScript（ES6 Class）+ Tailwind CSS v3 + Font Awesome + localStorage

一个零依赖、零构建的现代日历应用。打开 `index.html` 就能用，不需要服务器、不需要 `npm install`、不需要打包。

![界面截图](docs/screenshot-desktop.png)

---

## 功能

| 模块 | 说明 |
|---|---|
| **月视图日历** | 自动高亮今日；上/下月切换；一键回到今天；跨年自动进位 |
| **日期跳转** | 输入年/月/日跳转到任意日期，非法日期（如 2 月 30 日）会被拦截并提示 |
| **按日笔记** | 选中日期写笔记，**停止输入 1 秒自动保存**；可导出为 `.txt`、可导入回填 |
| **本地持久化** | `localStorage` 存储，刷新不丢；二次确认后才可清空 |
| **响应式** | 320px 手机到 1920px 桌面自适应，小屏自动改为上下布局 |

---

## 运行

```bash
# 方式一：直接双击 index.html
#   ⚠️ file:// 协议下所有功能都正常（本项目不依赖任何网络请求）

# 方式二：起个本地服务（推荐，避免个别浏览器的 file:// 限制）
python -m http.server 8080
# 然后访问 http://localhost:8080/
```

> Tailwind 与 Font Awesome 走 CDN，若要完全离线，可把两个库下载到本地并改 `index.html` 的引用路径。

---

## 架构

四个职责单一的类，通过实例关联协作，改一处不影响另一处：

```
┌─────────────────────────────────────────────────┐
│  app.js                                          │
│  ├─ Calendar          日期计算（纯逻辑，无 DOM）  │
│  ├─ CalendarRenderer  渲染 + 交互 + 笔记持久化   │
│  ├─ FileHandler       导入导出（静态方法）        │
│  └─ DateJump          跳转控制 + 日期合法性校验   │
└─────────────────────────────────────────────────┘
```

| 文件 | 行数 | 职责 |
|---|---|---|
| `js/calendar.js` | 约 110 | 日期计算：天数、首日星期、月份切换、网格数据生成 |
| `js/renderer.js` | 约 170 | 日历网格渲染、选中高亮、笔记读写、自动保存定时器 |
| `js/file-handler.js` | 约 45 | Blob 导出 txt、FileReader 导入 txt |
| `js/date-jump.js` | 约 140 | 模态框交互、日期合法性校验、跳转执行 |
| `js/app.js` | 约 100 | 初始化、工具栏事件绑定、页面卸载前兜底保存 |
| `css/style.css` | 约 90 | 按钮微动效、日期格子状态样式、震动反馈、滚动条 |

---

## 数据结构

无后端，全部落在浏览器 `localStorage`（约 5MB 容量）：

| Key | 类型 | 说明 |
|---|---|---|
| `calendar_selected_date` | string | 上次选中的日期，`YYYY-MM-DD`（本地时区） |
| `calendar_note_YYYY-MM-DD` | string | 指定日期的笔记内容，日期在 key 中 |

---

## 踩过的坑

这个项目最有价值的部分不是代码，是这几个问题的解法。

### 1. 日期计算：月份 0-based 与闰年

**现象**：2024 年 2 月显示 28 天，11 月显示 31 天，2025 年 1 月 1 日（周三）显示成周二。

**原因**：`new Date(year, month, 0)` 取的是**上个月最后一天**，不是当月；且 `Date` 的月份参数从 0 开始。

**解法**：
```js
getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();  // 下个月第 0 天 = 当月最后一天
}
getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}
```
两个方法都要求传入 **0-based** 的月份参数，全项目统一，避免混用。

### 2. 时区：用 `toISOString()` 存日期会差一天

**现象**：本地 15 号写的笔记，键名却变成了 `2026-10-14`。

**原因**：`toISOString()` 返回的是 **UTC** 时间。东八区本地时间 00:00–08:00 之前，UTC 还是前一天。

**解法**：统一用本地时区格式化。
```js
function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
```
选中日期也存本地日期串而非 ISO 时间戳，否则读回来再取 `getDate()` 同样会偏。

### 3. 自动保存冲突：快速切日期会丢笔记

**现象**：输入笔记后立刻点另一个日期，前一天的笔记没保存就被覆盖。

**原因**：自动保存用了 1 秒 `setTimeout` 延时，切日期时上一个定时器还没触发。

**解法**（三重保险）：
1. 切换日期前**主动**调 `saveCurrentNote()`，不等定时器
2. 输入时先 `clearTimeout` 再重设，避免多次触发
3. `beforeunload` 时强制保存一次，防止关页面前最后 1 秒的输入丢失

### 4. Tailwind 类名冲突：选中态不显示

**现象**：给日期格子加上 `bg-orange-100` 后，橙色背景不生效，仍然是白色。

**原因**：Tailwind 的 `bg-white` 和 `bg-orange-100` 特异性相同，**谁生效取决于样式表里的顺序**，与类名书写顺序无关。而 Tailwind CDN 版是运行时注入 `<style>`，位置在自定义 CSS 之后。

**解法**：日期格子的状态样式**一律用自定义类**（`is-today` / `is-selected` / `is-jumped`），
不用 Tailwind 工具类管背景和边框。

### 5. 响应式：320px 下工具栏挤成一团

**现象**：小屏按钮重叠、格子文字溢出、笔记区高度不够。

**解法**：工具栏加 `flex-wrap`；日期格子加 `min-w-[40px]`；笔记区高度改 `h-[300px] md:h-[400px] lg:h-96`。

---

## 兼容性

- 浏览器：Chrome / Firefox / Edge / Safari 功能与样式一致
- 设备：1920px、1366px、768px、375px、320px 均适配
- 性能：日历切换响应 < 200ms；自动保存无感知；10KB 文件导入导出 < 500ms

---

## 已知不足

- 仅单条纯文本笔记，无富文本、事件提醒、重复事件
- 仅月视图，无周/日视图
- `localStorage` 不跨设备同步，清除浏览器数据即丢失
- 文件导入无大小限制，超大文件可能卡顿

---

## 后续可做

- 接入 IndexedDB + 云同步，解决跨设备问题
- 加周/日视图切换
- 笔记富文本化（加粗、图片）
- 暗色模式

---

## 许可

MIT License · 仅用于学习交流

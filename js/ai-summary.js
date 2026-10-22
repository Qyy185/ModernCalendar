/**
 * AiSummary —— AI 月度摘要
 *
 * 把当月所有笔记整理成一份上下文，交给通义千问（DashScope OpenAI 兼容接口）
 * 生成月度回顾。
 *
 * 设计要点：
 *   1. **Key 不写死在代码里**：从 window.CALENDAR_CONFIG.dashscopeApiKey 读，
 *      页面可通过 <script> 注入。没有 Key 时优雅降级，给出配置提示而不是报错。
 *   2. **失败不阻塞**：网络错误、限流、Key 无效都给出可读提示，界面不崩。
 *   3. **只发送有笔记的日期**：空日期不进上下文，省 token 也避免模型胡说。
 *   4. **可测试**：核心逻辑（组装上下文、解析响应）与网络调用分离，
 *      前者能直接跑单元测试。
 */

/** 默认的 DashScope 接口地址（OpenAI 兼容模式） */
const DEFAULT_API_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

/** 使用的模型 */
const DEFAULT_MODEL = 'qwen-plus';

/**
 * 组装月度摘要的提示词上下文
 * @param {number} year - 年
 * @param {number} month - 月（0-11）
 * @param {Function} [getNote] - 取某日笔记的函数，默认读 localStorage
 * @returns {{context:string, noteCount:number, days:Array<string>}}
 */
function buildMonthlyContext(year, month, getNote) {
  const read = getNote || ((d) => {
    try {
      return localStorage.getItem('calendar_note_' + formatLocalDate(d)) || '';
    } catch (e) {
      return '';
    }
  });

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lines = [];
  const days = [];
  let noteCount = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const note = (read(date) || '').trim();
    if (!note) continue;
    noteCount++;
    days.push(formatLocalDate(date));
    const w = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
    lines.push(`【${month + 1}月${d}日 周${w}】\n${note}`);
  }

  return {
    context: lines.join('\n\n'),
    noteCount,
    days,
  };
}

/**
 * 组装送给模型的 Prompt
 * @param {Object} ctx - buildMonthlyContext 的返回值
 * @param {string} [modelName] - 项目名，用于让摘要更贴合
 * @returns {string} Prompt 文本
 */
function buildSummaryPrompt(ctx, modelName) {
  const name = modelName || '日历';
  return [
    '你是一个个人记录助手，请阅读下面这份' + name + '笔记，生成一份简短的月度回顾。',
    '',
    '要求：',
    '1. 用中文输出，控制在 300 字以内',
    '2. 概括这个月主要在忙什么、分成哪几件事',
    '3. 指出反复出现的主题或习惯',
    '4. 如果内容零散或信息不足，就如实说明，不要编造',
    '5. 不要加标题、不要用 Markdown 语法，直接给一段连贯的文字',
    '',
    '以下是笔记内容：',
    '---',
    ctx.context,
    '---',
  ].join('\n');
}

/**
 * 调用 DashScope 生成摘要
 * @param {Object} options - {apiKey, apiBase, model, prompt, signal}
 * @returns {Promise<string>} 生成的摘要文本
 */
async function requestSummary(options) {
  const o = options || {};
  const apiKey = o.apiKey;
  if (!apiKey) {
    throw new Error('NO_API_KEY');
  }

  const apiBase = o.apiBase || DEFAULT_API_BASE;
  const model = o.model || DEFAULT_MODEL;

  const res = await fetch(apiBase + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: o.prompt }],
      temperature: 0.6,
    }),
    signal: o.signal,
  });

  if (!res.ok) {
    let detail = '';
    try {
      const data = await res.json();
      detail = (data && data.error && data.error.message) || '';
    } catch (e) {
      // 响应体不是 JSON，忽略
    }
    const err = new Error('API_ERROR_' + res.status);
    err.status = res.status;
    err.detail = detail;
    throw err;
  }

  const data = await res.json();
  const content = data && data.choices && data.choices[0]
    ? data.choices[0].message && data.choices[0].message.content
    : '';
  if (!content) {
    throw new Error('EMPTY_RESPONSE');
  }
  return String(content).trim();
}

/**
 * 从页面配置里取 API Key
 * 约定：window.CALENDAR_CONFIG = { dashscopeApiKey: 'sk-xxx' }
 * @returns {string} API Key（可能为空）
 */
function getConfiguredApiKey() {
  const cfg = typeof window !== 'undefined' ? window.CALENDAR_CONFIG : null;
  return (cfg && cfg.dashscopeApiKey) || '';
}

/**
 * AiSummaryController —— 界面控制
 */
class AiSummaryController {
  constructor(calendar) {
    this.calendar = calendar;
    this.btn = document.getElementById('ai-summary-btn');
    this.resultEl = document.getElementById('ai-summary-result');
    this.hintEl = document.getElementById('ai-summary-hint');
    this.busy = false;

    if (this.btn) this.btn.addEventListener('click', () => this.run());
  }

  /** 显示提示 */
  showHint(text) {
    if (!this.hintEl) return;
    this.hintEl.textContent = text;
    this.hintEl.classList.remove('hidden');
  }

  /** 清除提示 */
  clearHint() {
    if (!this.hintEl) return;
    this.hintEl.textContent = '';
    this.hintEl.classList.add('hidden');
  }

  /** 显示结果 */
  showResult(text) {
    if (!this.resultEl) return;
    this.resultEl.textContent = text;
    this.resultEl.classList.remove('hidden');
  }

  /** 清除结果 */
  clearResult() {
    if (!this.resultEl) return;
    this.resultEl.textContent = '';
    this.resultEl.classList.add('hidden');
  }

  /** 执行一次摘要生成 */
  async run() {
    if (this.busy) return;
    this.busy = true;
    this.clearHint();
    this.clearResult();

    const originalLabel = this.btn ? this.btn.innerHTML : '';
    if (this.btn) {
      this.btn.disabled = true;
      this.btn.innerHTML =
        '<i class="fa fa-spinner fa-spin mr-2"></i>生成中...';
    }

    try {
      const ctx = buildMonthlyContext(this.calendar.year, this.calendar.month);

      if (!ctx.noteCount) {
        this.showHint('本月还没有笔记，先写几条再来试试');
        return;
      }

      const apiKey = getConfiguredApiKey();
      if (!apiKey) {
        this.showHint(
          '未配置模型 Key：在 index.html 的 </body> 前添加 ' +
          '<script>window.CALENDAR_CONFIG = { dashscopeApiKey: "sk-你的Key" };</script>'
        );
        return;
      }

      const prompt = buildSummaryPrompt(ctx, '日历');
      const text = await requestSummary({ apiKey, prompt });
      this.showResult(text);
    } catch (err) {
      const msg = String((err && err.message) || '');
      if (msg === 'NO_API_KEY') {
        this.showHint('未配置模型 Key，无法生成摘要');
      } else if (msg.indexOf('API_ERROR_401') === 0 || msg.indexOf('API_ERROR_403') === 0) {
        this.showHint('模型 Key 无效或已过期，请检查配置');
      } else if (msg.indexOf('API_ERROR_429') === 0) {
        this.showHint('请求过于频繁，请稍后再试');
      } else if (msg === 'EMPTY_RESPONSE') {
        this.showHint('模型没有返回内容，请重试');
      } else {
        this.showHint('生成失败：' + (msg || '网络异常') + '（检查网络或 Key）');
      }
    } finally {
      this.busy = false;
      if (this.btn) {
        this.btn.disabled = false;
        this.btn.innerHTML = originalLabel;
      }
    }
  }
}

// CommonJS 测试环境导出
if (typeof module === 'object' && module !== null && typeof module.require === 'function') {
  module.exports = {
    DEFAULT_API_BASE,
    DEFAULT_MODEL,
    buildMonthlyContext,
    buildSummaryPrompt,
    requestSummary,
    getConfiguredApiKey,
    AiSummaryController,
  };
}

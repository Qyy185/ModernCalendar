/**
 * FileHandler 类 —— 文件导入导出工具
 * 纯静态方法，无需实例化。
 */
class FileHandler {
  /**
   * 将文本导出为本地文件
   * @param {string} text - 文件内容
   * @param {string} filename - 目标文件名（含日期，如「2025-11-01_笔记.txt」）
   * @param {string} [mime] - MIME 类型，默认纯文本
   */
  static saveTextToFile(text, filename, mime) {
    const blob = new Blob([text], {
      type: mime || 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // 释放临时 URL，避免内存泄漏
    URL.revokeObjectURL(url);
  }

  /**
   * 读取用户选择的本地文件
   * @param {Function} callback - 回调函数，接收读取到的文本
   * @param {string} [accept] - 文件选择器的 accept 属性
   */
  static loadTextFromFile(callback, accept) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept || '.txt,text/plain';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        callback(e.target.result, file.name);
      };
      reader.readAsText(file, 'utf-8');
    });
    input.click();
  }

  /**
   * 导出 .ics 日历文件
   * @param {string} icsText - .ics 内容
   * @param {string} filename - 目标文件名
   */
  static saveIcsFile(icsText, filename) {
    this.saveTextToFile(icsText, filename, 'text/calendar;charset=utf-8');
  }

  /**
   * 读取用户选择的 .ics 文件
   * @param {Function} callback - 回调 (text, filename)
   */
  static loadIcsFile(callback) {
    this.loadTextFromFile(callback, '.ics,text/calendar');
  }
}

/**
 * FileHandler 类 —— 文件导入导出工具
 * 纯静态方法，无需实例化。
 */
class FileHandler {
  /**
   * 将文本导出为本地 .txt 文件
   * @param {string} text - 文件内容
   * @param {string} filename - 目标文件名（含日期，如「2025-11-01_笔记.txt」）
   */
  static saveTextToFile(text, filename) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
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
   * 读取用户选择的本地 .txt 文件
   * @param {Function} callback - 回调函数，接收读取到的文本
   */
  static loadTextFromFile(callback) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,text/plain';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        callback(e.target.result);
      };
      reader.readAsText(file, 'utf-8');
    });
    input.click();
  }
}

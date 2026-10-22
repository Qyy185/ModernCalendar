/**
 * 测试加载器 —— 在 Node 里加载浏览器端的普通脚本
 *
 * 为什么要这么绕：
 *   js/ 下的文件是给浏览器用 <script src> 加载的普通脚本，
 *   里面不能用 export（浏览器会报语法错误），
 *   也就没法直接 import 进测试。
 *
 * 解决方式：
 *   用 vm.runInThisContext 逐个执行，每个文件是一个独立的 Script，
 *   拥有自己的 filename —— 这样 v8 覆盖率能把执行到的代码
 *   准确归因回原始源文件。
 *
 *   为什么不用 new Function 把多个文件拼起来求值：
 *   拼起来只有一个函数体，也就只有一个 sourceURL，
 *   v8 覆盖率只会归因到最后一个文件，其他文件全部显示 0%。
 *
 *   共享作用域：vm.runInThisContext 在当前全局上下文里执行，
 *   函数声明会成为全局属性，跨文件可见 —— 与浏览器里
 *   多个 <script> 标签共享全局作用域的行为一致。
 *   class 声明是词法作用域，跨脚本不可见，所以每个文件末尾
 *   显式把自己要导出的名字挂到 globalThis 上。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 加载一个或多个浏览器端脚本，返回其顶层声明
 *
 * @param {string[]} relPaths - 相对项目根的路径列表，如 ['js/calendar.js']
 * @param {string[]} names - 需要取出的顶层名字
 * @returns {Object} 顶层声明组成的对象
 */
export function loadScript(relPaths, names) {
  const paths = Array.isArray(relPaths) ? relPaths : [relPaths];

  const result = {};

  paths.forEach((rel, idx) => {
    const abs = resolve(join(__dirname, '..', rel));
    const src = readFileSync(abs, 'utf-8');
    const filename = pathToFileURL(abs).href;

    // 该文件里要导出的名字（顶层函数/类声明）
    const mine = names.filter((n) => new RegExp(
      `(?:function|class|const|let|var)\\s+${n}\\b`
    ).test(src));

    // 末尾把要导出的名字挂到全局，供后续脚本与测试取用
    const tail = mine.length
      ? `\nglobalThis.__mod_${idx} = { ${mine.join(', ')} };`
      : '';

    const script = new vm.Script(src + tail, { filename });
    script.runInThisContext();

    if (mine.length) {
      Object.assign(result, globalThis[`__mod_${idx}`]);
      delete globalThis[`__mod_${idx}`];
    }
  });

  return result;
}

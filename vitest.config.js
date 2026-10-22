import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 把 vite 的缓存目录放在项目内，避免系统临时目录权限问题
  cacheDir: './node_modules/.vite',

  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['js/**/*.js'],
      exclude: [
        'js/app.js',          // 入口文件依赖 DOM，放到浏览器端测
        'js/renderer.js',     // 强依赖 DOM
        'js/date-jump.js',    // 强依赖 DOM
        'js/views.js',        // 强依赖 DOM
        'js/theme.js',        // 依赖 DOM
        'js/file-handler.js', // 依赖 DOM
        'js/shortcuts.js',    // 键盘事件依赖 DOM，纯逻辑部分已单独测
        'js/search.js',       // 渲染依赖 DOM，scan 纯逻辑已单独测
      ],
    },
  },
});

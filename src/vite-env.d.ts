/// <reference types="vite/client" />

/**
 * vite 注入的 import.meta.env。
 *
 * 仓库原本没有 vite/client 的类型声明，所以 App.tsx 只能用
 * (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV
 * 绕过——绕过的代价是类型系统（与 esbuild）都看不出它是常量，生产构建无法裁剪
 * if (DEV_BUILD) 分支。这里补上官方声明，DEV_BUILD 才能写成直接读取。
 *
 * vite/client 定义了 import.meta.env.DEV / PROD / MODE / BASE_URL 等。
 */

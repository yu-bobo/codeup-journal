import type { JournalApi } from '../../preload/index'

/**
 * 安全获取 preload 注入的 API；未注入时给出可操作的中文提示
 */
export function getApi(): JournalApi {
  const api = window.api
  if (!api) {
    throw new Error(
      '应用桥接未加载（window.api 为空）。请关闭所有本应用窗口后，在项目目录重新执行 pnpm dev；不要只用浏览器打开 localhost:5173。'
    )
  }
  return api
}

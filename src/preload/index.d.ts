import type { JournalApi } from './index'

declare global {
  interface Window {
    api: JournalApi
  }
}

export {}

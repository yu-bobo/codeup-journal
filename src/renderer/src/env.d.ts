import type { JournalApi } from '../../preload/index'

declare global {
  interface Window {
    api: JournalApi
  }
}

export {}

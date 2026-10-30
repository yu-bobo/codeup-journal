import React from 'react'
import ReactDOM from 'react-dom/client'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import App from './App'
import { ThemeProvider, applyTheme, readStoredTheme } from './theme'
import './styles.css'

dayjs.locale('zh-cn')

// 首屏前同步 data-theme，避免闪白/闪青
applyTheme(readStoredTheme())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
)

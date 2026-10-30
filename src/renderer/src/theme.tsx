import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import { ConfigProvider, theme as antTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'

export type AppTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'codeup-journal.theme'

/**
 * 读取本地主题；无效值回退到 light
 */
export function readStoredTheme(): AppTheme {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    if (v === 'dark' || v === 'light') return v
  } catch {
    // ignore
  }
  return 'light'
}

/**
 * 写入主题到 document 与 localStorage
 */
export function applyTheme(theme: AppTheme): void {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // ignore
  }
}

interface ThemeContextValue {
  theme: AppTheme
  toggleTheme: () => void
  setTheme: (t: AppTheme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * 读取当前亮/暗主题与切换方法
 */
export function useAppTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useAppTheme must be used within ThemeProvider')
  return ctx
}

function buildAntdTheme(mode: AppTheme) {
  const isDark = mode === 'dark'
  return {
    algorithm: isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    token: {
      colorPrimary: isDark ? '#7a9bb8' : '#3b7ddd',
      colorInfo: isDark ? '#8aa4bb' : '#5b8fef',
      colorLink: isDark ? '#a8c2d6' : '#2a5fb0',
      borderRadius: 12,
      fontFamily:
        '"Segoe UI Variable", "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
      colorBgContainer: isDark ? 'rgba(36, 46, 60, 0.72)' : 'rgba(255, 255, 255, 0.78)',
      colorBgElevated: isDark ? 'rgba(28, 36, 48, 0.94)' : 'rgba(255, 255, 255, 0.96)',
      colorBorder: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(210, 222, 240, 0.95)',
      colorBorderSecondary: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(59, 125, 221, 0.08)',
      colorText: isDark ? '#e6ebf2' : '#152033',
      colorTextSecondary: isDark ? '#93a1b3' : '#5c6b80'
    },
    components: {
      Button: {
        primaryShadow: isDark
          ? '0 4px 16px rgba(122, 155, 184, 0.28)'
          : '0 4px 16px rgba(59, 125, 221, 0.28)',
        defaultBg: isDark ? 'rgba(36, 46, 60, 0.72)' : 'rgba(255, 255, 255, 0.78)',
        defaultBorderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(210, 222, 240, 0.95)'
      },
      Menu: {
        itemBg: 'transparent',
        itemSelectedBg: isDark ? 'rgba(122, 155, 184, 0.22)' : '#3b7ddd',
        itemSelectedColor: isDark ? '#d7e6f5' : '#ffffff',
        itemColor: isDark ? '#e6ebf2' : '#152033',
        itemHoverColor: isDark ? '#a8c2d6' : '#2a5fb0'
      },
      Table: {
        headerBg: isDark ? 'rgba(36, 46, 60, 0.92)' : 'rgba(240, 246, 255, 0.95)',
        headerColor: isDark ? '#e6ebf2' : '#152033',
        rowHoverBg: isDark ? 'rgba(122, 155, 184, 0.12)' : 'rgba(59, 125, 221, 0.07)',
        borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(59, 125, 221, 0.08)',
        colorBgContainer: 'transparent'
      },
      Select: {
        optionSelectedBg: isDark ? 'rgba(122, 155, 184, 0.18)' : 'rgba(59, 125, 221, 0.12)',
        optionActiveBg: isDark ? 'rgba(122, 155, 184, 0.12)' : 'rgba(59, 125, 221, 0.07)'
      },
      Modal: {
        contentBg: isDark ? 'rgba(28, 36, 48, 0.96)' : 'rgba(255, 255, 255, 0.97)',
        headerBg: 'transparent'
      },
      Segmented: {
        trackBg: isDark ? 'rgba(20, 28, 38, 0.7)' : 'rgba(232, 240, 252, 0.9)',
        itemSelectedBg: isDark ? 'rgba(30, 40, 52, 0.9)' : '#ffffff'
      }
    }
  }
}

/**
 * 应用主题 Provider：同步 document + Ant Design
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AppTheme>(() => readStoredTheme())

  useEffect(() => {
    applyTheme(mode)
  }, [mode])

  const setTheme = useCallback((t: AppTheme) => {
    setMode(t)
  }, [])

  const toggleTheme = useCallback(() => {
    setMode((prev) => (prev === 'light' ? 'dark' : 'light'))
  }, [])

  const value = useMemo(
    () => ({ theme: mode, toggleTheme, setTheme }),
    [mode, toggleTheme, setTheme]
  )

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider locale={zhCN} theme={buildAntdTheme(mode)}>
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  )
}

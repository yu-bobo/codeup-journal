import { useCallback, useEffect, useState } from 'react'
import { Button, Menu, Select, Space, Tooltip, message } from 'antd'
import {
  DatabaseOutlined,
  FileTextOutlined,
  HistoryOutlined,
  MoonOutlined,
  ReloadOutlined,
  SettingOutlined,
  SunOutlined,
  UserOutlined
} from '@ant-design/icons'
import type { Account } from '@shared/types'
import { getApi } from './api'
import { WindowControls } from './components/WindowControls'
import { useAppTheme } from './theme'
import AccountsPage from './pages/AccountsPage'
import ReposPage from './pages/ReposPage'
import CommitsPage from './pages/CommitsPage'
import ReportsPage from './pages/ReportsPage'
import SettingsPage from './pages/SettingsPage'

type TabKey = 'accounts' | 'repos' | 'commits' | 'reports' | 'settings'

/**
 * 应用壳：顶栏账号切换 + 侧栏导航
 */
export default function App() {
  const { theme, toggleTheme } = useAppTheme()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('accounts')
  const [syncing, setSyncing] = useState(false)

  const refresh = useCallback(async () => {
    const list = await getApi().accounts.list()
    const active = await getApi().accounts.getActive()
    setAccounts(list)
    setActiveId(active)
    if (!active && list[0]) {
      await getApi().accounts.setActive(list[0].id)
      setActiveId(list[0].id)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const activeAccount = accounts.find((a) => a.id === activeId) || null

  const onSwitch = async (id: string) => {
    await getApi().accounts.setActive(id)
    setActiveId(id)
    message.success('已切换账号')
  }

  const onSync = async () => {
    if (!activeId) {
      message.warning('请先添加并选择账号')
      return
    }
    setSyncing(true)
    try {
      const result = await getApi().sync.run(activeId)
      if (result.errors.length) {
        message.warning(
          `同步完成：新增 ${result.inserted}，有 ${result.errors.length} 个错误（见同步日志）`
        )
      } else {
        message.success(`同步完成：拉取 ${result.fetched}，新增 ${result.inserted}`)
      }
    } catch (e: any) {
      message.error(e?.message || String(e))
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="app-shell">
      <div className="app-ambient" aria-hidden>
        <div className="app-ambient-orb" />
        <div className="app-ambient-grid" />
      </div>
      <header className="app-header">
        <div className="app-brand">
          <h1 className="app-brand-mark">Codeup 提交日志</h1>
          <p className="app-brand-sub">Commit Journal</p>
        </div>
        <div className="app-header-actions">
          <Space>
            <Tooltip title={theme === 'light' ? '切换暗色' : '切换亮色'}>
              <Button
                className="theme-toggle"
                icon={theme === 'light' ? <MoonOutlined /> : <SunOutlined />}
                onClick={toggleTheme}
                aria-label={theme === 'light' ? '切换暗色' : '切换亮色'}
              />
            </Tooltip>
            <Select
              style={{ width: 220 }}
              placeholder="选择账号"
              value={activeId ?? undefined}
              onChange={(v) => void onSwitch(v)}
              options={accounts.map((a) => ({
                value: a.id,
                label: a.name
              }))}
              popupMatchSelectWidth={false}
            />
            <Button
              className="sync-btn"
              icon={<ReloadOutlined />}
              loading={syncing}
              onClick={() => void onSync()}
              type="primary"
            >
              立即同步
            </Button>
          </Space>
          <WindowControls />
        </div>
      </header>
      <div className="app-body">
        <aside className="app-sider">
          <Menu
            mode="inline"
            selectedKeys={[tab]}
            onClick={({ key }) => setTab(key as TabKey)}
            items={[
              { key: 'accounts', icon: <UserOutlined />, label: '账号' },
              { key: 'repos', icon: <DatabaseOutlined />, label: '仓库' },
              { key: 'commits', icon: <HistoryOutlined />, label: '提交' },
              { key: 'reports', icon: <FileTextOutlined />, label: '报告' },
              { key: 'settings', icon: <SettingOutlined />, label: '设置' }
            ]}
          />
        </aside>
        <main className="app-content" key={tab}>
          {tab === 'accounts' && (
            <AccountsPage accounts={accounts} activeId={activeId} onChanged={refresh} />
          )}
          {tab === 'repos' && <ReposPage account={activeAccount} onChanged={refresh} />}
          {tab === 'commits' && <CommitsPage account={activeAccount} />}
          {tab === 'reports' && <ReportsPage account={activeAccount} />}
          {tab === 'settings' && <SettingsPage />}
        </main>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { BorderOutlined, CloseOutlined, MinusOutlined, SwitcherOutlined } from '@ant-design/icons'
import { getApi } from '../api'

/**
 * 自定义窗口最小化 / 最大化 / 关闭按钮（可显示 pointer 光标）
 */
export function WindowControls() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const api = getApi()
    void api.window.isMaximized().then(setMaximized)
    return api.window.onMaximizedChange(setMaximized)
  }, [])

  return (
    <div className="window-controls">
      <button
        type="button"
        className="window-ctrl"
        aria-label="最小化"
        title="最小化"
        onClick={() => void getApi().window.minimize()}
      >
        <MinusOutlined />
      </button>
      <button
        type="button"
        className="window-ctrl"
        aria-label={maximized ? '还原' : '最大化'}
        title={maximized ? '还原' : '最大化'}
        onClick={() => void getApi().window.toggleMaximize()}
      >
        {maximized ? <SwitcherOutlined /> : <BorderOutlined />}
      </button>
      <button
        type="button"
        className="window-ctrl window-ctrl-close"
        aria-label="关闭"
        title="关闭"
        onClick={() => void getApi().window.close()}
      >
        <CloseOutlined />
      </button>
    </div>
  )
}

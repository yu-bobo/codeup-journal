import { getDataRoot } from './paths'
import { loadSettings } from './settings'
import {
  buildHttpMcpConfigJson,
  clampMcpPort,
  DEFAULT_MCP_PORT,
  getMcpEndpointUrl,
  getMcpLastError,
  getMcpListenPort,
  isMcpHttpRunning,
  MCP_SERVER_KEY
} from './mcp/httpServer'

export interface McpConfigStatus {
  enabled: boolean
  port: number
  running: boolean
  listenPort: number | null
  endpointUrl: string
  dataRoot: string
  serverKey: string
  lastError: string | null
  // 通用客户端 mcp.json 片段（HTTP）
  configJson: string
  defaultPort: number
}

export function getMcpConfigStatus(): McpConfigStatus {
  const s = loadSettings()
  const port = clampMcpPort(s.mcpPort)
  const running = isMcpHttpRunning()
  const listenPort = getMcpListenPort()
  const effectivePort = listenPort ?? port
  return {
    enabled: s.mcpEnabled,
    port,
    running,
    listenPort,
    endpointUrl: getMcpEndpointUrl(effectivePort),
    dataRoot: getDataRoot(),
    serverKey: MCP_SERVER_KEY,
    lastError: getMcpLastError(),
    configJson: buildHttpMcpConfigJson(effectivePort),
    defaultPort: DEFAULT_MCP_PORT
  }
}

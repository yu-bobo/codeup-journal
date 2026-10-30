import { createServer as createHttpServer, type Server } from 'http'
import express from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createJournalMcpServer } from './createServer'

export const DEFAULT_MCP_PORT = 39281
export const MCP_SERVER_KEY = 'codeup-journal'

let httpServer: Server | null = null
let listeningPort: number | null = null
let lastError: string | null = null

export function clampMcpPort(port?: number): number {
  const n = Number(port)
  if (!Number.isFinite(n)) return DEFAULT_MCP_PORT
  return Math.min(65535, Math.max(1024, Math.round(n)))
}

export function getMcpEndpointUrl(port = listeningPort ?? DEFAULT_MCP_PORT): string {
  return `http://127.0.0.1:${port}/mcp`
}

export function isMcpHttpRunning(): boolean {
  return httpServer != null && listeningPort != null
}

export function getMcpListenPort(): number | null {
  return listeningPort
}

export function getMcpLastError(): string | null {
  return lastError
}

export function buildHttpMcpConfigJson(port: number): string {
  return JSON.stringify(
    {
      mcpServers: {
        [MCP_SERVER_KEY]: {
          type: 'http',
          url: getMcpEndpointUrl(port)
        }
      }
    },
    null,
    2
  )
}

async function handleMcpPost(
  req: express.Request,
  res: express.Response
): Promise<void> {
  try {
    const server = createJournalMcpServer()
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    })
    res.on('close', () => {
      void transport.close()
    })
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } catch (error) {
    console.error('[mcp-http] request error:', error)
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null
      })
    }
  }
}

/**
 * 在 127.0.0.1 启动 Streamable HTTP MCP；已在跑则先停再启
 */
export async function startMcpHttpServer(port: number): Promise<void> {
  const nextPort = clampMcpPort(port)
  await stopMcpHttpServer()
  lastError = null

  const app = express()
  app.use(express.json({ limit: '4mb' }))

  app.get('/health', (_req, res) => {
    res.json({ ok: true, name: MCP_SERVER_KEY, port: nextPort })
  })

  app.post('/mcp', (req, res) => {
    void handleMcpPost(req, res)
  })

  app.get('/mcp', (_req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed; use POST for Streamable HTTP (stateless JSON)'
      },
      id: null
    })
  })

  await new Promise<void>((resolve, reject) => {
    const server = createHttpServer(app)
    const onError = (err: NodeJS.ErrnoException) => {
      lastError = err.code === 'EADDRINUSE' ? `端口 ${nextPort} 已被占用` : err.message
      httpServer = null
      listeningPort = null
      reject(err)
    }
    server.once('error', onError)
    server.listen(nextPort, '127.0.0.1', () => {
      server.off('error', onError)
      httpServer = server
      listeningPort = nextPort
      console.log(`[mcp-http] listening ${getMcpEndpointUrl(nextPort)}`)
      resolve()
    })
  })
}

export async function stopMcpHttpServer(): Promise<void> {
  const server = httpServer
  httpServer = null
  listeningPort = null
  if (!server) return
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
}

/**
 * 按设置启停；失败不抛到启动流程外，写入 lastError
 */
export async function applyMcpHttpFromSettings(opts: {
  enabled: boolean
  port: number
}): Promise<void> {
  if (!opts.enabled) {
    await stopMcpHttpServer()
    lastError = null
    return
  }
  try {
    await startMcpHttpServer(opts.port)
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e)
    console.error('[mcp-http] start failed:', lastError)
  }
}

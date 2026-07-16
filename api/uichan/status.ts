import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardApiOrigin } from '../../server/httpSecurity'
import { getProductAnalyzerConfig, type ProductAnalyzerConfig } from '../../server/productAnalyzerGateway'

type AnalyzerStatus =
  | {
      status: 'ok'
      httpStatus: number
      health: unknown
    }
  | {
      status: 'not_configured'
      httpStatus: null
      error: string
    }
  | {
      status: 'error'
      httpStatus: number | null
      error: string
      health?: unknown
    }

const safeOrigin = (raw: string | null) => {
  if (!raw) return null
  try {
    return new URL(raw).origin
  } catch {
    return 'invalid-url'
  }
}

const readJson = async (response: Response): Promise<unknown> => {
  const text = await response.text()
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

const safeHealthSummary = (raw: unknown) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const source = raw as Record<string, unknown>
  const summary: Record<string, unknown> = {}
  for (const key of ['status', 'ready', 'model_loaded', 'engine', 'model']) {
    const value = source[key]
    if (typeof value === 'string' || typeof value === 'boolean') summary[key] = value
  }
  return Object.keys(summary).length ? summary : undefined
}

const checkAnalyzer = async (config: ProductAnalyzerConfig): Promise<AnalyzerStatus> => {
  if (!config.endpoint || !config.healthUrl) {
    return {
      status: 'not_configured',
      httpStatus: null,
      error: 'PRODUCT_ANALYZER_API_URL is not configured.',
    }
  }
  if (config.configurationError) {
    return {
      status: 'error',
      httpStatus: null,
      error: config.configurationError,
    }
  }

  try {
    const response = await fetch(config.healthUrl, {
      headers: { ...config.headers, Accept: 'application/json' },
      signal: AbortSignal.timeout(Math.min(config.timeoutMs, 10_000)),
    })
    const body = await readJson(response)
    if (!response.ok) {
      return {
        status: 'error',
        httpStatus: response.status,
        error: `Health check failed with HTTP ${response.status}.`,
        health: safeHealthSummary(body),
      }
    }
    return {
      status: 'ok',
      httpStatus: response.status,
      health: safeHealthSummary(body),
    }
  } catch (error) {
    return {
      status: 'error',
      httpStatus: null,
      error: error instanceof Error ? error.message : 'Analyzer health check failed.',
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guardApiOrigin(req, res)) return
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  const analyzerConfig = getProductAnalyzerConfig()
  const analyzer = await checkAnalyzer(analyzerConfig)

  res.status(200).json({
    checkedAt: new Date().toISOString(),
    cashlog: {
      nodeEnv: process.env.NODE_ENV ?? 'unknown',
      vercelEnv: process.env.VERCEL_ENV ?? null,
      supabaseConfigured: Boolean(
        process.env.VITE_SUPABASE_URL &&
          (process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY),
      ),
      productAnalyzerConfigured: Boolean(analyzerConfig.endpoint),
      productAnalyzerOrigin: safeOrigin(analyzerConfig.endpoint),
      productAnalyzerSecured: analyzerConfig.authMode !== 'none' && !analyzerConfig.configurationError,
      productAnalyzerAuthMode: analyzerConfig.authMode,
      openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
      visionConfigured: Boolean(process.env.VISION_API_KEY || process.env.HF_TOKEN || process.env.OPENAI_API_KEY),
    },
    analyzer,
  })
}

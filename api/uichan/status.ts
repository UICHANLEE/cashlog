import type { VercelRequest, VercelResponse } from '@vercel/node'

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

const endpointFromEnv = () => {
  const raw = process.env.PRODUCT_ANALYZER_API_URL?.trim() || process.env.CATAI_PRODUCT_API_URL?.trim()
  if (!raw) return null
  const normalized = raw.replace(/\/$/, '')
  return normalized.endsWith('/analyze-image') ? normalized : `${normalized}/analyze-image`
}

const safeOrigin = (raw: string | null) => {
  if (!raw) return null
  try {
    return new URL(raw).origin
  } catch {
    return 'invalid-url'
  }
}

const healthUrlFromEndpoint = (endpoint: string) => new URL('/health', endpoint).toString()

const readJson = async (response: Response): Promise<unknown> => {
  const text = await response.text()
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

const checkAnalyzer = async (endpoint: string | null): Promise<AnalyzerStatus> => {
  if (!endpoint) {
    return {
      status: 'not_configured',
      httpStatus: null,
      error: 'PRODUCT_ANALYZER_API_URL is not configured.',
    }
  }

  try {
    const response = await fetch(healthUrlFromEndpoint(endpoint), {
      headers: { Accept: 'application/json' },
    })
    const body = await readJson(response)
    if (!response.ok) {
      return {
        status: 'error',
        httpStatus: response.status,
        error: `Health check failed with HTTP ${response.status}.`,
        health: body,
      }
    }
    return {
      status: 'ok',
      httpStatus: response.status,
      health: body,
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
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  const analyzerEndpoint = endpointFromEnv()
  const analyzer = await checkAnalyzer(analyzerEndpoint)

  res.status(200).json({
    checkedAt: new Date().toISOString(),
    cashlog: {
      nodeEnv: process.env.NODE_ENV ?? 'unknown',
      vercelEnv: process.env.VERCEL_ENV ?? null,
      supabaseConfigured: Boolean(
        process.env.VITE_SUPABASE_URL &&
          (process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY),
      ),
      productAnalyzerConfigured: Boolean(analyzerEndpoint),
      productAnalyzerOrigin: safeOrigin(analyzerEndpoint),
      openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
      visionConfigured: Boolean(process.env.VISION_API_KEY || process.env.HF_TOKEN || process.env.OPENAI_API_KEY),
    },
    analyzer,
  })
}

import type { VercelRequest, VercelResponse } from '@vercel/node'

const normalizeOrigin = (value: string) => {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export const getAllowedOrigins = () => {
  const configured = (process.env.CASHLOG_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => normalizeOrigin(value.trim()))
    .filter((value): value is string => Boolean(value))
  const vercelHosts = [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL]
    .filter((value): value is string => Boolean(value))
    .map((host) => normalizeOrigin(`https://${host}`))
    .filter((value): value is string => Boolean(value))
  const local = process.env.NODE_ENV === 'production'
    ? []
    : ['http://127.0.0.1:5175', 'http://localhost:5175', 'http://localhost:5173']
  return new Set([...configured, ...vercelHosts, ...local])
}

export const guardApiOrigin = (req: VercelRequest, res: VercelResponse) => {
  const rawOrigin = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin
  const origin = rawOrigin ? normalizeOrigin(rawOrigin) : null

  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader(
    'Access-Control-Expose-Headers',
    [
      'X-Request-ID',
      'Server-Timing',
      'X-Cashlog-total-Time-Ms',
      'X-Cashlog-model-Time-Ms',
      'X-Cashlog-analyzer-Time-Ms',
      'X-Cashlog-optimize-Time-Ms',
      'X-Upload-Bytes-In',
      'X-Analyzer-Bytes-Out',
    ].join(', '),
  )
  res.setHeader('Access-Control-Max-Age', '600')

  if (rawOrigin && (!origin || !getAllowedOrigins().has(origin))) {
    res.status(403).json({ error: 'Origin Not Allowed' })
    return false
  }
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin)
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return false
  }
  return true
}

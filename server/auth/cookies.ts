import type { VercelRequest, VercelResponse } from '@vercel/node'

export const ACCESS_COOKIE = 'cashlog_access'
export const REFRESH_COOKIE = 'cashlog_refresh'
export const REMEMBER_COOKIE = 'cashlog_remember'

const isSecure = () => process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL)

const serialize = (name: string, value: string, maxAge?: number) => {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`)
  if (isSecure()) parts.push('Secure')
  return parts.join('; ')
}

export const readCookies = (req: VercelRequest) => {
  const raw = Array.isArray(req.headers.cookie) ? req.headers.cookie[0] : req.headers.cookie
  return Object.fromEntries(
    String(raw || '').split(';').flatMap((part: string) => {
      const separator = part.indexOf('=')
      if (separator < 0) return []
      const key = part.slice(0, separator).trim()
      const value = part.slice(separator + 1).trim()
      try {
        return [[key, decodeURIComponent(value)]]
      } catch {
        return []
      }
    }),
  )
}

export const setSessionCookies = (
  res: VercelResponse,
  session: { access_token: string; refresh_token: string; expires_in?: number },
  remember: boolean,
) => {
  res.setHeader('Set-Cookie', [
    serialize(ACCESS_COOKIE, session.access_token, session.expires_in || 3600),
    serialize(REFRESH_COOKIE, session.refresh_token, remember ? 60 * 60 * 24 * 30 : undefined),
    serialize(REMEMBER_COOKIE, remember ? '1' : '0', remember ? 60 * 60 * 24 * 30 : undefined),
  ])
}

export const clearSessionCookies = (res: VercelResponse) => {
  res.setHeader('Set-Cookie', [
    serialize(ACCESS_COOKIE, '', 0),
    serialize(REFRESH_COOKIE, '', 0),
    serialize(REMEMBER_COOKIE, '', 0),
  ])
}

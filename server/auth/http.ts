import type { VercelRequest, VercelResponse } from '@vercel/node'

export type ApiErrorBody = {
  success: false
  code: string
  message: string
  field?: string
}

export class ApiError extends Error {
  status: number
  code: string
  field?: string

  constructor(status: number, code: string, message: string, field?: string) {
    super(message)
    this.status = status
    this.code = code
    this.field = field
  }
}

export const sendError = (res: VercelResponse, error: unknown) => {
  const known = error instanceof ApiError
  const body: ApiErrorBody = {
    success: false,
    code: known ? error.code : 'INTERNAL_ERROR',
    message: known ? error.message : '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.',
    ...(known && error.field ? { field: error.field } : {}),
  }
  res.status(known ? error.status : 500).json(body)
}

export const requireMethod = (req: VercelRequest, method: string) => {
  if (req.method !== method) throw new ApiError(405, 'METHOD_NOT_ALLOWED', '지원하지 않는 요청 방식이에요.')
}

export const readJson = <T>(req: VercelRequest): T => {
  if (!req.body || typeof req.body !== 'object' || Buffer.isBuffer(req.body)) {
    throw new ApiError(400, 'INVALID_BODY', '입력 내용을 확인해 주세요.')
  }
  return req.body as T
}

export const clientIp = (req: VercelRequest) => {
  const forwarded = req.headers['x-forwarded-for']
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded
  return value?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown'
}

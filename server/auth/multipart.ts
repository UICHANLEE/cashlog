import Busboy from 'busboy'
import type { VercelRequest } from '@vercel/node'
import { ApiError } from './http.js'
import { MAX_PROFILE_IMAGE_BYTES } from './validation.js'

export type UploadedFile = { buffer: Buffer; filename: string; mimeType: string }

export const parseMultipart = (
  req: VercelRequest,
  allowedFields: string[],
): Promise<{ fields: Record<string, string>; profileImage?: UploadedFile }> =>
  new Promise((resolve, reject) => {
    const contentType = Array.isArray(req.headers['content-type']) ? req.headers['content-type'][0] : req.headers['content-type']
    if (!contentType?.startsWith('multipart/form-data')) {
      reject(new ApiError(415, 'MULTIPART_REQUIRED', '이미지를 포함한 양식으로 전송해 주세요.'))
      return
    }

    const fields: Record<string, string> = {}
    let profileImage: UploadedFile | undefined
    let failed = false
    const fail = (error: Error) => {
      if (failed) return
      failed = true
      reject(error)
    }

    let parser: Busboy.Busboy
    try {
      parser = Busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_PROFILE_IMAGE_BYTES, fields: 12, fieldSize: 4096 } })
    } catch {
      fail(new ApiError(400, 'INVALID_MULTIPART', '업로드 양식을 읽을 수 없어요.'))
      return
    }

    parser.on('field', (name, value) => {
      if (allowedFields.includes(name)) fields[name] = value
    })
    parser.on('file', (name, stream, info) => {
      if (name !== 'profileImage') {
        stream.resume()
        return
      }
      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('limit', () => fail(new ApiError(413, 'IMAGE_TOO_LARGE', '프로필 이미지는 5MB 이하만 사용할 수 있어요.', 'profileImage')))
      stream.on('end', () => {
        if (!failed) profileImage = { buffer: Buffer.concat(chunks), filename: info.filename, mimeType: info.mimeType }
      })
    })
    parser.on('filesLimit', () => fail(new ApiError(400, 'TOO_MANY_FILES', '프로필 이미지는 한 장만 선택해 주세요.')))
    parser.on('error', () => fail(new ApiError(400, 'INVALID_MULTIPART', '업로드 양식을 읽을 수 없어요.')))
    parser.on('finish', () => {
      if (!failed) resolve({ fields, ...(profileImage ? { profileImage } : {}) })
    })

    if (Buffer.isBuffer(req.body)) parser.end(req.body)
    else req.pipe(parser)
  })

const MIME_BY_EXTENSION: Record<string, string[]> = {
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  webp: ['image/webp'],
  heic: ['image/heic'],
  heif: ['image/heif'],
}

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.slice(start, end))

export const detectImageMime = (bytes: Uint8Array): string | null => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)
  ) {
    return 'image/png'
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
    return 'image/webp'
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12).toLowerCase()
    if (['heic', 'heix', 'hevc', 'hevx'].includes(brand)) return 'image/heic'
    if (['mif1', 'msf1'].includes(brand)) return 'image/heif'
  }
  return null
}

export const assertValidImageBytes = (
  bytes: Uint8Array,
  declaredMime: string,
  filename?: string,
) => {
  const normalizedMime = declaredMime.split(';')[0].trim().toLowerCase()
  const detectedMime = detectImageMime(bytes)
  if (!detectedMime || detectedMime !== normalizedMime) {
    throw new Error('파일 내용과 이미지 형식이 일치하지 않아요.')
  }

  if (filename) {
    const extension = filename.split('.').pop()?.toLowerCase() ?? ''
    const allowedMimes = MIME_BY_EXTENSION[extension]
    if (!allowedMimes?.includes(detectedMime)) {
      throw new Error('파일 확장자와 이미지 형식이 일치하지 않아요.')
    }
  }
  return detectedMime
}

export const assertValidImageFile = async (file: File) => {
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer())
  return assertValidImageBytes(bytes, file.type, file.name)
}

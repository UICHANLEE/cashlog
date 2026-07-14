export type PreparedImage = {
  file: File
  width?: number
  height?: number
  compressed: boolean
}

const MAX_EDGE = 2560
const JPEG_QUALITY = 0.82

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('이미지를 읽을 수 없어요.'))
    }
    image.src = url
  })

const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))

/** 원본 구도는 유지하면서 저장 용량과 EXIF 개인정보를 줄인 보관본을 만든다. */
export const prepareImageForStorage = async (file: File): Promise<PreparedImage> => {
  const image = await loadImage(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('이미지를 변환할 수 없어요.')
  context.drawImage(image, 0, 0, width, height)
  const blob = await canvasToBlob(canvas)
  if (!blob) throw new Error('이미지를 압축할 수 없어요.')
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'cashlog-photo'
  return {
    file: new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }),
    width,
    height,
    compressed: true,
  }
}

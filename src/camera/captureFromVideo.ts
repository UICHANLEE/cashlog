/** video 요소의 현재 프레임을 JPEG Blob으로 캡처합니다. */
export async function captureFrameFromVideo(
  video: HTMLVideoElement,
  quality = 0.92,
): Promise<Blob | null> {
  const width = video.videoWidth
  const height = video.videoHeight
  if (!width || !height) return null

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, width, height)

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality)
  })
}

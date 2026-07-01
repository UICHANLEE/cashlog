export const createVideoThumbnailBlob = (videoBlob: Blob) =>
  new Promise<Blob | null>((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null)
      return
    }

    const url = URL.createObjectURL(videoBlob)
    const video = document.createElement('video')
    const cleanup = () => {
      URL.revokeObjectURL(url)
      video.removeAttribute('src')
      video.load()
    }

    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'
    video.src = url

    video.onerror = () => {
      cleanup()
      resolve(null)
    }

    video.onloadeddata = () => {
      try {
        video.currentTime = Math.min(0.1, video.duration || 0)
      } catch {
        cleanup()
        resolve(null)
      }
    }

    video.onseeked = () => {
      const width = video.videoWidth || 640
      const height = video.videoHeight || 960
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        cleanup()
        resolve(null)
        return
      }
      ctx.drawImage(video, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          cleanup()
          resolve(blob)
        },
        'image/jpeg',
        0.82,
      )
    }
  })


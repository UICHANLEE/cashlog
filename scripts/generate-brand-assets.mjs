import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(root, 'public')
const catPath = path.join(publicDir, 'pets', 'cat-3d.png')
const momentPath = path.join(publicDir, 'cafe-moment.webp')

const icon = async (size, filename, petSize = Math.round(size * 0.78)) => {
  const pet = await sharp(catPath)
    .resize(petSize, petSize, { fit: 'contain' })
    .png()
    .toBuffer()
  const texture = Buffer.from(`
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="#ffd94f"/>
      <circle cx="${size * 0.16}" cy="${size * 0.17}" r="${size * 0.045}" fill="#ff7563" opacity=".8"/>
      <path d="M ${size * 0.12} ${size * 0.82} Q ${size * 0.5} ${size * 0.72} ${size * 0.9} ${size * 0.84}" fill="none" stroke="#2d2925" stroke-width="${Math.max(4, size * 0.018)}" stroke-linecap="round" opacity=".85"/>
    </svg>
  `)
  await sharp(texture)
    .composite([{ input: pet, left: Math.round((size - petSize) / 2), top: Math.round(size * 0.12) }])
    .png()
    .toFile(path.join(publicDir, filename))
}

await icon(180, 'apple-touch-icon.png')
await icon(192, 'icon-192.png')
await icon(512, 'icon-512.png')
await icon(512, 'icon-maskable-512.png', 360)

const momentSize = 500
const moment = await sharp(momentPath)
  .resize(momentSize, momentSize, { fit: 'cover' })
  .composite([{ input: Buffer.from(`<svg width="${momentSize}" height="${momentSize}"><rect width="${momentSize}" height="${momentSize}" rx="24" fill="white"/></svg>`), blend: 'dest-in' }])
  .png()
  .toBuffer()
const cat = await sharp(catPath).resize(270, 270, { fit: 'contain' }).png().toBuffer()
const socialLayer = Buffer.from(`
  <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="630" fill="#fbf3e2"/>
    <g fill="#d9cdbc" opacity=".45">
      ${Array.from({ length: 18 }, (_, y) => Array.from({ length: 34 }, (_, x) => `<circle cx="${20 + x * 36}" cy="${18 + y * 36}" r="1.4"/>`).join('')).join('')}
    </g>
    <rect x="632" y="57" width="500" height="500" rx="24" fill="#2d2925" opacity=".18" transform="translate(8 10)"/>
    <text x="76" y="112" fill="#ee5e4f" font-family="Arial, Apple SD Gothic Neo, sans-serif" font-size="25" font-weight="700">CHARACTER X PHOTO CASHBOOK</text>
    <text x="72" y="210" fill="#2d2925" font-family="Arial, Apple SD Gothic Neo, sans-serif" font-size="78" font-weight="800">Cashlog</text>
    <text x="76" y="291" fill="#2d2925" font-family="Arial, Apple SD Gothic Neo, sans-serif" font-size="40" font-weight="700">사진으로 남기면,</text>
    <text x="76" y="345" fill="#2d2925" font-family="Arial, Apple SD Gothic Neo, sans-serif" font-size="40" font-weight="700">가계부가 써져요</text>
    <rect x="76" y="394" width="350" height="54" rx="12" fill="#dff5e9" stroke="#2d2925" stroke-width="2"/>
    <text x="97" y="431" fill="#2d2925" font-family="Arial, Apple SD Gothic Neo, sans-serif" font-size="22" font-weight="700">가입 없이 사진 한 장으로 시작</text>
    <text x="76" y="506" fill="#675e55" font-family="Arial, Apple SD Gothic Neo, sans-serif" font-size="24">기록할수록 나비도 함께 자라요.</text>
  </svg>
`)

await sharp(socialLayer)
  .composite([
    { input: moment, left: 632, top: 57 },
    { input: cat, left: 930, top: 340 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(path.join(publicDir, 'og-cashlog.png'))

import type { OutfitId, PetKind, PetPalette } from '../domain/pet'

const svgFrame = (body: string, defs: string) => `
  <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <defs>
      <linearGradient id="fabric" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity=".72"/>
        <stop offset=".18" stop-color="${body}"/>
        <stop offset=".72" stop-color="${body}"/>
        <stop offset="1" stop-color="#642f42" stop-opacity=".42"/>
      </linearGradient>
      <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff5a9"/>
        <stop offset=".45" stop-color="#ffd23f"/>
        <stop offset="1" stop-color="#e89b20"/>
      </linearGradient>
      <filter id="softShadow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="7" stdDeviation="7" flood-color="#553927" flood-opacity=".22"/>
      </filter>
      <filter id="smallShadow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#553927" flood-opacity=".25"/>
      </filter>
    </defs>
    <g filter="url(#softShadow)">${defs}</g>
  </svg>
`

const bow = (kind: PetKind) => {
  const y = kind === 'cat' ? 326 : 312
  return `
    <g transform="translate(256 ${y}) rotate(${kind === 'cat' ? -3 : 2}) scale(.72)">
      <path d="M-8 0C-42-34-91-31-87 5c4 33 51 39 80 12Z" fill="url(#fabric)" stroke="#9c405c" stroke-width="4"/>
      <path d="M8 0c34-34 83-31 79 5-4 33-51 39-80 12Z" fill="url(#fabric)" stroke="#9c405c" stroke-width="4"/>
      <circle r="21" fill="url(#fabric)" stroke="#9c405c" stroke-width="4"/>
      <ellipse cx="-15" cy="-11" rx="18" ry="7" fill="#fff" opacity=".38"/>
    </g>
  `
}

const flower = (kind: PetKind) => {
  const x = kind === 'cat' ? 376 : 366
  const y = kind === 'cat' ? 90 : 94
  return `
    <g transform="translate(${x} ${y}) rotate(12)" filter="url(#smallShadow)">
      ${Array.from({ length: 6 }, (_, index) => {
        const angle = index * 60
        return `<ellipse transform="rotate(${angle}) translate(0 -22)" rx="12" ry="24" fill="url(#fabric)" stroke="#9c405c" stroke-width="2.5"/>`
      }).join('')}
      <circle r="13" fill="url(#gold)" stroke="#d78a25" stroke-width="3"/>
      <circle cx="-4" cy="-5" r="4" fill="#fff" opacity=".72"/>
    </g>
  `
}

const hoodie = (kind: PetKind) => {
  const neckY = kind === 'cat' ? 314 : 302
  const bodyTop = kind === 'cat' ? 322 : 314
  return `
    <g>
      <path d="M178 ${bodyTop + 18}Q188 ${bodyTop - 8} 220 ${bodyTop - 14}L292 ${bodyTop - 14}Q325 ${bodyTop - 7} 338 ${bodyTop + 20}L355 426Q310 456 256 456t-99-30Z"
        fill="url(#fabric)" stroke="#9c405c" stroke-width="5" stroke-linejoin="round"/>
      <path d="M204 ${neckY}Q256 ${neckY + 35} 308 ${neckY}Q295 ${neckY - 22} 256 ${neckY - 18}t-52 18Z"
        fill="#fff" fill-opacity=".52" stroke="#9c405c" stroke-width="4"/>
      <path d="M224 385q32 18 64 0v34q-32 16-64 0Z" fill="#fff" fill-opacity=".34" stroke="#9c405c" stroke-width="3"/>
      <path d="M238 ${neckY + 10}v42M274 ${neckY + 10}v42" stroke="#fff4ec" stroke-width="5" stroke-linecap="round"/>
      <circle cx="238" cy="${neckY + 54}" r="6" fill="url(#gold)"/>
      <circle cx="274" cy="${neckY + 54}" r="6" fill="url(#gold)"/>
    </g>
  `
}

const sailor = (kind: PetKind) => {
  const y = kind === 'cat' ? 309 : 298
  return `
    <g>
      <path d="M183 ${y}Q256 ${y + 35} 329 ${y}l-19 83-54-39-54 39Z" fill="#fffdf6" stroke="#406f9c" stroke-width="5" stroke-linejoin="round"/>
      <path d="M202 ${y + 13}q54 25 108 0" fill="none" stroke="#5aa6d8" stroke-width="9" stroke-linecap="round"/>
      <g transform="translate(256 ${y + 49})">
        <path d="M-5 0c-27-22-58-17-53 9 5 23 36 24 56 8Z" fill="url(#fabric)" stroke="#9c405c" stroke-width="3"/>
        <path d="M5 0c27-22 58-17 53 9-5 23-36 24-56 8Z" fill="url(#fabric)" stroke="#9c405c" stroke-width="3"/>
        <circle r="14" fill="url(#fabric)" stroke="#9c405c" stroke-width="3"/>
      </g>
    </g>
  `
}

const party = (kind: PetKind) => {
  const x = kind === 'cat' ? 260 : 258
  const y = kind === 'cat' ? 24 : 35
  return `
    <g transform="translate(${x} ${y}) rotate(-5)">
      <path d="M0 0 58 132h-116Z" fill="url(#fabric)" stroke="#9c405c" stroke-width="5" stroke-linejoin="round"/>
      <path d="M-37 91h75M-20 49h40" stroke="#fff2a6" stroke-width="10" stroke-linecap="round" opacity=".9"/>
      <ellipse cy="132" rx="63" ry="13" fill="#fff5d8" stroke="#9c405c" stroke-width="4"/>
      <circle cy="-3" r="15" fill="url(#gold)" stroke="#d78a25" stroke-width="3"/>
    </g>
  `
}

const beret = (kind: PetKind) => {
  const y = kind === 'cat' ? 73 : 85
  return `
    <g transform="translate(256 ${y}) rotate(-7)">
      <ellipse rx="${kind === 'cat' ? 112 : 105}" ry="42" fill="url(#fabric)" stroke="#9c405c" stroke-width="5"/>
      <path d="M-72-7Q0-66 76-8Q32 10-72-7Z" fill="url(#fabric)" stroke="#9c405c" stroke-width="4"/>
      <path d="M7-43q8-20 23-10" fill="none" stroke="#9c405c" stroke-width="8" stroke-linecap="round"/>
      <ellipse cx="-28" cy="-30" rx="33" ry="10" fill="#fff" opacity=".28"/>
    </g>
  `
}

const glasses = (kind: PetKind) => {
  const y = kind === 'cat' ? 207 : 202
  const leftX = kind === 'cat' ? 193 : 196
  const rightX = kind === 'cat' ? 316 : 318
  return `
    <g transform="rotate(3 256 ${y})" filter="url(#smallShadow)">
      <path d="M${leftX + 47} ${y - 4}q18-14 31 2" fill="none" stroke="#3c2c38" stroke-width="10" stroke-linecap="round"/>
      <rect x="${leftX - 53}" y="${y - 38}" width="106" height="76" rx="30" fill="#6b5cff" fill-opacity=".22" stroke="#3c2c38" stroke-width="9"/>
      <rect x="${rightX - 53}" y="${y - 38}" width="106" height="76" rx="30" fill="#ff8fb5" fill-opacity=".2" stroke="#3c2c38" stroke-width="9"/>
      <path d="M${leftX - 49} ${y - 20}l-52-24M${rightX + 49} ${y - 20}l52-24" stroke="#3c2c38" stroke-width="9" stroke-linecap="round"/>
      <path d="M${leftX - 25} ${y - 20}l29-11M${rightX - 25} ${y - 20}l29-11" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".55"/>
    </g>
  `
}

const miniBag = (kind: PetKind) => {
  const top = kind === 'cat' ? 296 : 288
  return `
    <g>
      <path d="M185 ${top}Q286 ${top + 38} 341 420" fill="none" stroke="#9c405c" stroke-width="13" stroke-linecap="round"/>
      <path d="M185 ${top}Q286 ${top + 38} 341 420" fill="none" stroke="url(#fabric)" stroke-width="8" stroke-linecap="round"/>
      <g transform="translate(338 407) rotate(5)">
        <rect x="-49" y="-38" width="98" height="80" rx="21" fill="url(#fabric)" stroke="#9c405c" stroke-width="5"/>
        <path d="M-23-37q0-32 23-32t23 32" fill="none" stroke="#9c405c" stroke-width="7" stroke-linecap="round"/>
        <circle cy="0" r="9" fill="url(#gold)"/>
        <path d="M-30-19h60" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".35"/>
      </g>
    </g>
  `
}

const scarf = (kind: PetKind) => {
  const y = kind === 'cat' ? 302 : 292
  return `
    <g>
      <path d="M175 ${y}q81 47 162 0l-6 50q-75 35-150-1Z" fill="url(#fabric)" stroke="#9c405c" stroke-width="5" stroke-linejoin="round"/>
      <path d="M288 ${y + 42}q45 24 35 117l-45-7q15-58-8-89Z" fill="url(#fabric)" stroke="#9c405c" stroke-width="5" stroke-linejoin="round"/>
      <path d="M283 ${y + 55}q19 13 38 8" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".42"/>
      <path d="M281 ${y + 126}l-5 25M299 ${y + 129}l-3 24M317 ${y + 126}v22" stroke="#9c405c" stroke-width="4" stroke-linecap="round"/>
    </g>
  `
}

const crown = (kind: PetKind) => {
  const y = kind === 'cat' ? 47 : 58
  return `
    <g transform="translate(256 ${y}) rotate(-3)">
      <path d="M-91 65-76-28-30 19 0-44 35 17 80-27 92 66Z" fill="url(#gold)" stroke="#b5791c" stroke-width="6" stroke-linejoin="round"/>
      <path d="M-88 48q88 24 176 0v31q-88 25-176 0Z" fill="url(#gold)" stroke="#b5791c" stroke-width="5"/>
      <circle cy="61" r="11" fill="#ff6f9f" stroke="#b34a70" stroke-width="3"/>
      <circle cx="-48" cy="61" r="8" fill="#7f78ff" stroke="#524bb5" stroke-width="3"/>
      <circle cx="48" cy="61" r="8" fill="#59d4b1" stroke="#2e9a7c" stroke-width="3"/>
      <path d="M-55 4Q0-20 55 3" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".5"/>
    </g>
  `
}

export function createPetCostumeSvg(
  outfit: OutfitId,
  kind: PetKind,
  palette: PetPalette,
): string | null {
  if (outfit === 'none') return null

  const artwork: Record<Exclude<OutfitId, 'none'>, string> = {
    bow: bow(kind),
    flower: flower(kind),
    hoodie: hoodie(kind),
    sailor: sailor(kind),
    party: party(kind),
    beret: beret(kind),
    glasses: glasses(kind),
    mini_bag: miniBag(kind),
    scarf: scarf(kind),
    crown: crown(kind),
  }

  return svgFrame(palette.accent, artwork[outfit])
}

export function createPetCostumeDataUrl(
  outfit: OutfitId,
  kind: PetKind,
  palette: PetPalette,
): string | null {
  const svg = createPetCostumeSvg(outfit, kind, palette)
  return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null
}

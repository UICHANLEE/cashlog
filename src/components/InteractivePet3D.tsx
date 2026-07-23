import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { Sparkles } from 'lucide-react'
import * as THREE from 'three'
import type { MoodScore } from '../domain/cashlog'
import {
  getPetPalette,
  getOutfit,
  type CatBreedId,
  type DogBreedId,
  type OutfitId,
  type PetKind,
  type PetPaletteId,
} from '../domain/pet'
import { signalSoftImpact } from '../motion/haptics'
import { createPetCostumeDataUrl } from './petCostumeArtwork'
import './InteractivePet3D.css'

type InteractivePet3DProps = {
  kind: PetKind
  name: string
  palette: PetPaletteId
  outfit: OutfitId
  breed: CatBreedId | DogBreedId
  compact?: boolean
  className?: string
  cheer?: boolean
  action?: PetAction
  actionRequest?: number
  moodScore?: MoodScore
}

export type PetAction = 'pet' | 'treat' | 'highfive' | 'dance'

type PetPortraitProps = {
  kind: PetKind
  name: string
  className?: string
}

const portraitPath = (kind: PetKind) => `/pets/${kind}-3d.png`

const actionMessages = (name: string): Record<PetAction, string> => ({
  pet: `${name}가 눈을 가늘게 뜨고 기대요`,
  treat: `${name}가 간식 냄새에 귀를 쫑긋했어요`,
  highfive: `${name}가 앞발로 인사해요`,
  dance: `${name}가 기분 좋게 살랑거려요`,
})

export function PetPortrait({ kind, name, className = '' }: PetPortraitProps) {
  return (
    <img
      className={`pet-portrait-3d ${className}`.trim()}
      src={portraitPath(kind)}
      alt={`${name} 캐릭터`}
      draggable={false}
    />
  )
}

export function InteractivePet3D({
  kind,
  name,
  palette,
  outfit,
  breed,
  compact = false,
  className = '',
  cheer = false,
  action = 'pet',
  actionRequest = 0,
  moodScore = 3,
}: InteractivePet3DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<((nextAction: PetAction) => void) | null>(null)
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [canvasReady, setCanvasReady] = useState(false)
  const [costumeReady, setCostumeReady] = useState(outfit === 'none')
  const [reaction, setReaction] = useState(`${name}가 편안하게 바라보고 있어요`)
  const colors = getPetPalette(palette)
  const currentOutfit = getOutfit(outfit)

  const announce = useCallback((message: string) => {
    setReaction(message)
    if (reactionTimer.current) clearTimeout(reactionTimer.current)
    reactionTimer.current = setTimeout(
      () => setReaction(`${name}가 편안하게 바라보고 있어요`),
      1900,
    )
  }, [name])

  const interact = useCallback(() => {
    signalSoftImpact()
    triggerRef.current?.('pet')
    announce(actionMessages(name).pet)
  }, [announce, name])

  useEffect(() => () => {
    if (reactionTimer.current) clearTimeout(reactionTimer.current)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(
      () => setReaction(`${name}가 편안하게 바라보고 있어요`),
      0,
    )
    return () => window.clearTimeout(timer)
  }, [name])

  useEffect(() => {
    if (!cheer) return
    triggerRef.current?.('dance')
  }, [cheer])

  useEffect(() => {
    if (actionRequest === 0) return
    triggerRef.current?.(action)
    const timer = window.setTimeout(
      () => announce(actionMessages(name)[action]),
      0,
    )
    return () => window.clearTimeout(timer)
  }, [action, actionRequest, announce, name])

  useEffect(() => {
    const canvas = canvasRef.current
    const host = hostRef.current
    if (!canvas || !host || navigator.userAgent.includes('jsdom')) return undefined

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        premultipliedAlpha: true,
      })
    } catch {
      return undefined
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setClearColor(0x000000, 0)

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-3, 3, 3, -3, 0.1, 30)
    camera.position.set(0, 0, 10)

    const character = new THREE.Group()
    character.position.y = compact ? -0.12 : -0.02
    scene.add(character)

    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x4b3529,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
    })
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 64), shadowMaterial)
    shadow.position.set(0, compact ? -2.28 : -2.38, -0.2)
    shadow.scale.set(1.46, 0.24, 1)
    scene.add(shadow)

    let portrait: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null
    let tintOverlay: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null
    let costume: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null
    let texture: THREE.Texture | null = null
    let costumeTexture: THREE.Texture | null = null
    let disposed = false

    const loader = new THREE.TextureLoader()
    loader.load(
      portraitPath(kind),
      (loadedTexture) => {
        if (disposed) {
          loadedTexture.dispose()
          return
        }
        texture = loadedTexture
        texture.colorSpace = THREE.SRGBColorSpace
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
        const geometry = new THREE.PlaneGeometry(5.15, 5.15)
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          alphaTest: 0.015,
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
        })
        portrait = new THREE.Mesh(geometry, material)
        portrait.position.z = 0.2
        portrait.renderOrder = 1
        character.add(portrait)

        if (palette !== 'cream') {
          const tintMaterial = new THREE.MeshBasicMaterial({
            map: texture,
            color: new THREE.Color(colors.body),
            transparent: true,
            opacity: 0.24,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
          })
          tintOverlay = new THREE.Mesh(geometry, tintMaterial)
          tintOverlay.position.z = 0.22
          tintOverlay.renderOrder = 2
          character.add(tintOverlay)
        }

        setCanvasReady(true)
      },
      undefined,
      () => setCanvasReady(false),
    )

    const costumeUrl = createPetCostumeDataUrl(outfit, kind, colors)
    if (costumeUrl) {
      loader.load(
        costumeUrl,
        (loadedTexture) => {
          if (disposed) {
            loadedTexture.dispose()
            return
          }
          costumeTexture = loadedTexture
          costumeTexture.colorSpace = THREE.SRGBColorSpace
          costumeTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
          const costumeMaterial = new THREE.MeshBasicMaterial({
            map: costumeTexture,
            transparent: true,
            alphaTest: 0.015,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
          })
          costume = new THREE.Mesh(new THREE.PlaneGeometry(5.15, 5.15), costumeMaterial)
          costume.position.z = 0.32
          costume.renderOrder = 3
          character.add(costume)
          setCostumeReady(true)
        },
        undefined,
        () => setCostumeReady(false),
      )
    }

    const pointer = { x: 0, y: 0 }
    let activeAction: PetAction | null = null
    let actionUntil = 0
    let frame = 0
    let previousTime = performance.now()
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const moodEnergy = 0.82 + (moodScore - 1) * 0.055

    triggerRef.current = (nextAction) => {
      activeAction = nextAction
      actionUntil = performance.now() + (nextAction === 'dance' ? 1450 : 1050)
    }

    const resize = () => {
      const rect = host.getBoundingClientRect()
      const width = Math.max(1, rect.width)
      const height = Math.max(1, rect.height)
      const aspect = width / height
      const viewHeight = compact ? 5.75 : 5.85
      camera.left = (-viewHeight * aspect) / 2
      camera.right = (viewHeight * aspect) / 2
      camera.top = viewHeight / 2
      camera.bottom = -viewHeight / 2
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = THREE.MathUtils.clamp(
        ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
        -1,
        1,
      )
      pointer.y = THREE.MathUtils.clamp(
        ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1,
        -1,
        1,
      )
    }

    const onPointerLeave = () => {
      pointer.x = 0
      pointer.y = 0
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerleave', onPointerLeave)

    const animate = (time: number) => {
      const delta = Math.min(0.032, Math.max(0.001, (time - previousTime) / 1000))
      previousTime = time
      const t = time * 0.001
      const playing = time < actionUntil ? activeAction : null
      const idle = reducedMotion ? 0 : Math.sin(t * 1.55) * 0.026 * moodEnergy
      const breathe = reducedMotion ? 1 : 1 + Math.sin(t * 1.9) * 0.0045
      const danceSway = playing === 'dance' && !reducedMotion ? Math.sin(t * 5.4) * 0.055 : 0
      const greetingTilt = playing === 'highfive' && !reducedMotion ? Math.sin(t * 7.2) * 0.028 - 0.035 : 0
      const treatLift = playing === 'treat' && !reducedMotion
        ? Math.abs(Math.sin(t * 7.2)) * 0.09
        : 0
      const petSquish = playing === 'pet' && !reducedMotion ? 0.018 : 0
      const highfiveLean = playing === 'highfive' && !reducedMotion ? 0.035 : 0
      const danceScale = playing === 'dance' && !reducedMotion
        ? Math.abs(Math.sin(t * 5.4)) * 0.018
        : 0

      character.position.y += (
        (compact ? -0.12 : -0.02) + idle + treatLift - character.position.y
      ) * Math.min(1, delta * 8)
      character.rotation.y += (
        pointer.x * 0.045 - character.rotation.y
      ) * Math.min(1, delta * 7)
      character.rotation.x += (
        -pointer.y * 0.018 + highfiveLean - character.rotation.x
      ) * Math.min(1, delta * 7)
      character.rotation.z += (
        danceSway + greetingTilt - character.rotation.z
      ) * Math.min(1, delta * 9)
      character.scale.x += (
        breathe + petSquish + danceScale - character.scale.x
      ) * Math.min(1, delta * 9)
      character.scale.y += (
        breathe - petSquish + danceScale - character.scale.y
      ) * Math.min(1, delta * 9)
      shadow.scale.x += (
        1.46 - idle * 1.1 - shadow.scale.x
      ) * Math.min(1, delta * 7)
      shadowMaterial.opacity = 0.13 - idle * 0.5

      renderer.render(scene, camera)
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)

    return () => {
      disposed = true
      triggerRef.current = null
      cancelAnimationFrame(frame)
      observer.disconnect()
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      portrait?.geometry.dispose()
      portrait?.material.dispose()
      tintOverlay?.material.dispose()
      costume?.geometry.dispose()
      costume?.material.dispose()
      texture?.dispose()
      costumeTexture?.dispose()
      shadow.geometry.dispose()
      shadowMaterial.dispose()
      renderer.dispose()
    }
  }, [colors, compact, kind, moodScore, outfit, palette])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      interact()
    }
  }

  const style = {
    '--pet-accent': colors.accent,
    '--pet-body': colors.body,
  } as CSSProperties

  return (
    <div
      ref={hostRef}
      className={`interactive-pet-3d${compact ? ' is-compact' : ''}${canvasReady ? ' is-canvas-ready' : ''} ${className}`.trim()}
      style={style}
      data-breed={breed}
      data-outfit={outfit}
      data-costume-rendered={outfit !== 'none'}
      data-costume-ready={costumeReady}
      role="button"
      tabIndex={0}
      aria-label={`${name} 캐릭터. 누르면 다정하게 인사해요.`}
      title={`${name}에게 인사하기`}
      onKeyDown={handleKeyDown}
      onClick={interact}
    >
      <PetPortrait
        kind={kind}
        name={name}
        className="interactive-pet-fallback"
      />
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="pet-3d-reaction" aria-live="polite">
        <Sparkles size={15} aria-hidden="true" />
        <span>{reaction}</span>
      </div>
      {outfit !== 'none' && (
        <span className="pet-costume-badge" aria-label={`${currentOutfit.name} 착용 중`}>
          <span aria-hidden>{currentOutfit.icon}</span>
          {currentOutfit.name}
        </span>
      )}
    </div>
  )
}

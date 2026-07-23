import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Hand, Sparkles } from 'lucide-react'
import * as THREE from 'three'
import {
  getPetPalette,
  type CatBreedId,
  type DogBreedId,
  type OutfitId,
  type PetKind,
  type PetPaletteId,
} from '../domain/pet'
import type { MoodScore } from '../domain/cashlog'
import { signalSoftImpact } from '../motion/haptics'
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

const rubberbandClamp = (value: number, min: number, max: number, dimension: number) => {
  if (value >= min && value <= max) return value
  const boundary = value < min ? min : max
  const overshoot = Math.abs(value - boundary)
  const resisted = (overshoot * dimension * 0.55) / (dimension + 0.55 * overshoot)
  return boundary + (value < min ? -resisted : resisted)
}

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

const addEllipsoid = (
  parent: THREE.Object3D,
  material: THREE.Material,
  position: [number, number, number],
  scale: [number, number, number],
  segments = 40,
) => {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(20, segments / 2)), material)
  mesh.position.set(...position)
  mesh.scale.set(...scale)
  parent.add(mesh)
  return mesh
}

const addCurve = (
  parent: THREE.Object3D,
  material: THREE.Material,
  points: Array<[number, number, number]>,
  radius = 0.035,
) => {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  )
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 20, radius, 10, false),
    material,
  )
  parent.add(mesh)
  return mesh
}

const addCatTail = (parent: THREE.Object3D, material: THREE.Material) => {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.9, -1.15, -0.4),
    new THREE.Vector3(1.65, -0.8, -0.15),
    new THREE.Vector3(1.75, 0.05, 0),
    new THREE.Vector3(1.25, 0.32, 0.12),
  ])
  const tail = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.18, 16, false), material)
  tail.name = 'tail'
  parent.add(tail)
  return tail
}

const addDogTail = (parent: THREE.Object3D, material: THREE.Material) => {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.85, -1.1, -0.5),
    new THREE.Vector3(-1.55, -0.72, -0.2),
    new THREE.Vector3(-1.45, -0.08, 0),
    new THREE.Vector3(-1.1, 0.12, 0.08),
  ])
  const tail = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.21, 16, false), material)
  tail.name = 'tail'
  parent.add(tail)
  return tail
}

const addOutfit = (
  parent: THREE.Object3D,
  outfit: OutfitId,
  accent: THREE.Material,
  ink: THREE.Material,
  light: THREE.Material,
) => {
  if (outfit === 'bow') {
    addEllipsoid(parent, accent, [-0.34, -0.08, 1.22], [0.38, 0.25, 0.16], 28).rotation.z = 0.45
    addEllipsoid(parent, accent, [0.34, -0.08, 1.22], [0.38, 0.25, 0.16], 28).rotation.z = -0.45
    addEllipsoid(parent, accent, [0, -0.08, 1.31], [0.17, 0.17, 0.12], 24)
  }

  if (outfit === 'flower') {
    const flower = new THREE.Group()
    flower.position.set(1.05, 1.72, 0.96)
    for (let index = 0; index < 6; index += 1) {
      const angle = (Math.PI * 2 * index) / 6
      const petal = addEllipsoid(
        flower,
        light,
        [Math.cos(angle) * 0.28, Math.sin(angle) * 0.28, 0],
        [0.2, 0.3, 0.09],
        20,
      )
      petal.rotation.z = angle - Math.PI / 2
    }
    addEllipsoid(flower, accent, [0, 0, 0.09], [0.16, 0.16, 0.1], 20)
    parent.add(flower)
  }

  if (outfit === 'party') {
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.35, 32), accent)
    hat.position.set(0.35, 2.18, 0.2)
    hat.rotation.z = -0.16
    parent.add(hat)
    addEllipsoid(parent, ink, [0.35, 2.9, 0.2], [0.14, 0.14, 0.14], 20)
  }

  if (outfit === 'beret') {
    const beret = addEllipsoid(parent, accent, [0.22, 2.23, 0.08], [0.88, 0.24, 0.68], 32)
    beret.rotation.z = -0.08
    addEllipsoid(parent, accent, [0.3, 2.48, 0.05], [0.1, 0.19, 0.1], 18).rotation.z = 0.2
  }

  if (outfit === 'hoodie') {
    addEllipsoid(parent, accent, [0, -0.92, 0.16], [1.18, 1.02, 0.92], 36)
    const hood = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.2, 18, 48), accent)
    hood.position.set(0, -0.22, 0.08)
    hood.scale.y = 0.7
    parent.add(hood)
    addEllipsoid(parent, light, [0, -1.15, 1.03], [0.52, 0.28, 0.11], 24)
    ;[-0.18, 0.18].forEach((x) => {
      const string = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.42, 5, 10), light)
      string.position.set(x, -0.58, 1.15)
      parent.add(string)
    })
  }

  if (outfit === 'sailor') {
    addEllipsoid(parent, light, [0, -0.98, 0.12], [1.17, 1.01, 0.9], 36)
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.16, 16, 48), accent)
    collar.position.set(0, -0.3, 0.13)
    collar.scale.y = 0.7
    parent.add(collar)
    addEllipsoid(parent, accent, [-0.28, -0.54, 1.18], [0.3, 0.2, 0.12], 24).rotation.z = 0.42
    addEllipsoid(parent, accent, [0.28, -0.54, 1.18], [0.3, 0.2, 0.12], 24).rotation.z = -0.42
    addEllipsoid(parent, accent, [0, -0.54, 1.26], [0.13, 0.13, 0.09], 20)
  }

  if (outfit === 'glasses') {
    ;[-0.55, 0.55].forEach((x) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.075, 12, 32), ink)
      ring.position.set(x, 0.74, 1.3)
      parent.add(ring)
    })
    const bridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.28, 6, 12), ink)
    bridge.position.set(0, 0.74, 1.3)
    bridge.rotation.z = Math.PI / 2
    parent.add(bridge)
  }

  if (outfit === 'scarf') {
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.19, 18, 48), accent)
    scarf.position.set(0, -0.3, 0.05)
    scarf.scale.y = 0.72
    parent.add(scarf)
    const end = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.65, 8, 16), accent)
    end.position.set(0.52, -0.82, 0.9)
    end.rotation.z = 0.25
    parent.add(end)
  }

  if (outfit === 'mini_bag') {
    const strap = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.075, 12, 48), accent)
    strap.position.set(0.12, -0.72, 0.64)
    strap.rotation.z = -0.48
    strap.scale.y = 1.18
    parent.add(strap)
    const bag = addEllipsoid(parent, accent, [0.7, -1.08, 1.02], [0.5, 0.43, 0.18], 28)
    bag.rotation.z = 0.08
    addEllipsoid(parent, light, [0.7, -0.98, 1.2], [0.2, 0.08, 0.04], 18)
  }

  if (outfit === 'crown') {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.34, 32), accent)
    band.position.set(0, 2.2, 0)
    parent.add(band)
    ;[-0.44, 0, 0.44].forEach((x, index) => {
      const point = new THREE.Mesh(new THREE.ConeGeometry(0.24, index === 1 ? 0.76 : 0.58, 20), accent)
      point.position.set(x, index === 1 ? 2.72 : 2.62, 0)
      parent.add(point)
    })
  }
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
  const suppressClickRef = useRef(false)
  const [fallback, setFallback] = useState(false)
  const [reaction, setReaction] = useState(`${name}가 눈을 맞추고 있어요`)
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const interact = useCallback(() => {
    signalSoftImpact()
    triggerRef.current?.('pet')
    setReaction(`${name}가 기분 좋게 꼬리를 흔들어요`)
    if (reactionTimer.current) clearTimeout(reactionTimer.current)
    reactionTimer.current = setTimeout(() => setReaction(`${name}가 눈을 맞추고 있어요`), 1800)
  }, [name])

  const handleHostClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    interact()
  }, [interact])

  useEffect(() => () => {
    if (reactionTimer.current) clearTimeout(reactionTimer.current)
  }, [])

  useEffect(() => {
    if (!cheer) return
    triggerRef.current?.('dance')
    const timer = window.setTimeout(() => setReaction(`${name}가 폴짝 뛰며 반가워해요`), 0)
    return () => window.clearTimeout(timer)
  }, [cheer, name])

  useEffect(() => {
    if (actionRequest === 0) return
    triggerRef.current?.(action)
    const messages: Record<PetAction, string> = {
      pet: `${name}가 눈을 감고 손길을 느껴요`,
      treat: `${name}가 간식을 오물오물 먹어요`,
      highfive: `${name}가 손바닥을 쫙 내밀었어요`,
      dance: `${name}가 신나게 춤을 춰요`,
    }
    const announceTimer = window.setTimeout(() => setReaction(messages[action]), 0)
    if (reactionTimer.current) clearTimeout(reactionTimer.current)
    reactionTimer.current = setTimeout(() => setReaction(`${name}가 눈을 맞추고 있어요`), 2100)
    return () => window.clearTimeout(announceTimer)
  }, [action, actionRequest, name])

  useEffect(() => {
    const canvas = canvasRef.current
    const host = hostRef.current
    if (!canvas || !host || navigator.userAgent.includes('jsdom')) {
      setFallback(true)
      return undefined
    }

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
    } catch {
      window.setTimeout(() => setFallback(true), 0)
      return undefined
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.18
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(compact ? 33 : 29, 1, 0.1, 100)
    camera.position.set(0, 0.32, compact ? 9.5 : 9.2)
    camera.lookAt(0, 0.28, 0)

    scene.add(new THREE.HemisphereLight(0xfffbf3, 0x9ab7b2, 3.2))
    const key = new THREE.DirectionalLight(0xffffff, 5.2)
    key.position.set(-4.5, 7.5, 6.5)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.near = 0.1
    key.shadow.camera.far = 20
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xaedcff, 2.2)
    fill.position.set(4, 2.5, 5)
    scene.add(fill)
    const rim = new THREE.DirectionalLight(0xff9f91, 2.7)
    rim.position.set(5, 3.5, -1)
    scene.add(rim)

    const colors = getPetPalette(palette)
    const fur = new THREE.MeshPhysicalMaterial({
      color: colors.body,
      roughness: 0.46,
      metalness: 0,
      clearcoat: 0.32,
      clearcoatRoughness: 0.62,
      sheen: 0.58,
      sheenColor: new THREE.Color(colors.bodyAlt),
    })
    const furLight = new THREE.MeshPhysicalMaterial({ color: colors.bodyAlt, roughness: 0.5, clearcoat: 0.24, sheen: 0.4 })
    const blush = new THREE.MeshPhysicalMaterial({ color: colors.blush, roughness: 0.58, transparent: true, opacity: 0.68 })
    const accent = new THREE.MeshPhysicalMaterial({ color: colors.accent, roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.36 })
    const ink = new THREE.MeshPhysicalMaterial({ color: 0x251b19, roughness: 0.12, clearcoat: 0.94 })
    const iris = new THREE.MeshPhysicalMaterial({ color: kind === 'cat' ? 0x8b542f : 0x6d452b, roughness: 0.18, clearcoat: 1 })
    const white = new THREE.MeshPhysicalMaterial({ color: 0xfffdf9, roughness: 0.28, clearcoat: 0.4 })
    const pink = new THREE.MeshPhysicalMaterial({ color: kind === 'cat' ? 0xff856f : 0x5a352a, roughness: 0.34, clearcoat: 0.5 })
    const tongueMaterial = new THREE.MeshPhysicalMaterial({ color: 0xff7f87, roughness: 0.38, clearcoat: 0.28 })
    const stripeMaterial = new THREE.MeshPhysicalMaterial({ color: colors.shadow, roughness: 0.75 })

    const root = new THREE.Group()
    root.position.y = compact ? -0.4 : -0.16
    root.scale.setScalar(compact ? 0.9 : 0.98)
    scene.add(root)

    const body = addEllipsoid(root, fur, [0, -0.94, 0], [1.08, 1.22, 0.92])
    if (kind === 'dog' && breed === 'dachshund') body.scale.x = 1.5
    const head = addEllipsoid(root, fur, [0, 0.73, 0.13], [1.68, 1.48, 1.2])
    head.name = 'head'

    if (kind === 'cat') {
      ;[-1, 1].forEach((side) => {
        if (breed === 'persian') {
          addEllipsoid(root, fur, [side * 1.03, 1.64, 0.03], [0.48, 0.5, 0.28], 28)
        } else {
          const earMaterial = breed === 'siamese' ? stripeMaterial : fur
          const ear = new THREE.Mesh(new THREE.ConeGeometry(0.52, 1.18, 32), earMaterial)
          ear.position.set(side * 0.98, 1.92, -0.02)
          ear.rotation.z = side * -0.18
          root.add(ear)
          const inner = new THREE.Mesh(new THREE.ConeGeometry(0.31, 0.72, 28), blush)
          inner.position.set(side * 0.98, 1.93, 0.36)
          inner.rotation.z = side * -0.18
          root.add(inner)
        }
      })
    } else {
      ;[-1, 1].forEach((side) => {
        const pointed = ['shiba', 'pomeranian', 'border_collie', 'corgi'].includes(String(breed))
        if (pointed) {
          const ear = new THREE.Mesh(new THREE.ConeGeometry(0.5, breed === 'corgi' ? 1.42 : 1.16, 32), fur)
          ear.position.set(side * 1.02, 1.83, -0.05)
          ear.rotation.z = side * -0.16
          root.add(ear)
        } else {
          const ear = addEllipsoid(root, fur, [side * 1.38, 1.06, -0.06], [0.5, breed === 'retriever' ? 1.18 : 1.02, 0.32])
          ear.rotation.z = side * 0.34
        }
      })
    }

    addEllipsoid(root, furLight, [0, 0.18, 1.12], [0.86, 0.62, 0.34])
    const eyeGroups: THREE.Group[] = []
    const pupilGroups: THREE.Group[] = []
    const eyebrows: THREE.Mesh[] = []
    ;[-0.58, 0.58].forEach((x, eyeIndex) => {
      const eye = new THREE.Group()
      eye.position.set(x, 0.86, 1.22)
      root.add(eye)
      addEllipsoid(eye, white, [0, 0, 0], [0.45, 0.53, 0.23], 36)
      const pupil = new THREE.Group()
      pupil.position.z = 0.16
      eye.add(pupil)
      addEllipsoid(pupil, iris, [0, -0.01, 0.05], [0.34, 0.41, 0.17], 32)
      addEllipsoid(pupil, ink, [0, -0.02, 0.17], [0.23, 0.3, 0.12], 30)
      addEllipsoid(pupil, white, [-0.1, 0.13, 0.3], [0.09, 0.12, 0.045], 18)
      addEllipsoid(pupil, white, [0.1, -0.1, 0.3], [0.045, 0.055, 0.025], 14)
      eyeGroups.push(eye)
      pupilGroups.push(pupil)

      const eyebrow = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.34, 6, 14), stripeMaterial)
      eyebrow.position.set(x, 1.52, 1.2)
      eyebrow.rotation.z = eyeIndex === 0 ? -1.26 : 1.26
      root.add(eyebrow)
      eyebrows.push(eyebrow)
    })

    addEllipsoid(root, blush, [-1.08, 0.24, 1.08], [0.38, 0.2, 0.07], 24)
    addEllipsoid(root, blush, [1.08, 0.24, 1.08], [0.38, 0.2, 0.07], 24)
    addEllipsoid(root, furLight, [-0.23, 0.08, 1.39], [0.3, 0.23, 0.17], 24)
    addEllipsoid(root, furLight, [0.23, 0.08, 1.39], [0.3, 0.23, 0.17], 24)
    addEllipsoid(root, pink, [0, 0.3, 1.52], [0.17, 0.13, 0.1], 24)

    const mouth = new THREE.Group()
    mouth.position.set(0, 0.04, 1.51)
    root.add(mouth)
    addCurve(mouth, ink, [[0, 0.16, 0], [-0.04, 0.02, 0.02], [-0.24, -0.03, 0]], 0.032)
    addCurve(mouth, ink, [[0, 0.16, 0], [0.04, 0.02, 0.02], [0.24, -0.03, 0]], 0.032)
    const tongue = addEllipsoid(mouth, tongueMaterial, [0, -0.11, 0], [0.16, 0.12, 0.055], 22)
    tongue.scale.y = 0.05

    const pawY = kind === 'dog' && breed === 'corgi' ? -1.87 : -1.74
    const leftPaw = addEllipsoid(root, furLight, [-0.7, pawY, 0.74], [0.52, 0.38, 0.52], 30)
    const rightPaw = addEllipsoid(root, furLight, [0.7, pawY, 0.74], [0.52, 0.38, 0.52], 30)
    ;[-0.7, 0.7].forEach((x) => {
      addEllipsoid(root, blush, [x, pawY + 0.02, 1.19], [0.18, 0.11, 0.05], 18)
      ;[-0.14, 0, 0.14].forEach((toeX) => {
        addEllipsoid(root, blush, [x + toeX, pawY + 0.18, 1.15], [0.055, 0.07, 0.035], 14)
      })
    })
    addEllipsoid(root, fur, [-1.05, -0.52, 0.68], [0.42, 0.74, 0.42], 30).rotation.z = -0.28
    const wavingPaw = addEllipsoid(root, fur, [1.08, -0.36, 0.7], [0.42, 0.78, 0.42], 30)
    wavingPaw.rotation.z = 0.44

    const tail = kind === 'cat' ? addCatTail(root, fur) : addDogTail(root, fur)

    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.11, 16, 48), accent)
    collar.position.set(0, -0.18, 0.2)
    collar.scale.y = 0.72
    root.add(collar)
    addEllipsoid(root, accent, [0, -0.52, 1.02], [0.2, 0.24, 0.11], 24)
    addOutfit(root, outfit, accent, ink, furLight)

    if (kind === 'cat' && ['cheese_tabby', 'korean_short', 'calico'].includes(String(breed))) {
      ;[-0.28, 0, 0.28].forEach((x, index) => {
        const stripe = addEllipsoid(root, stripeMaterial, [x, 1.69 - Math.abs(index - 1) * 0.07, 1.02], [0.1, 0.34, 0.05], 18)
        stripe.rotation.z = x * -0.8
      })
    }
    if (kind === 'cat' && breed === 'tuxedo') {
      addEllipsoid(root, furLight, [0, 1.34, 1.05], [0.2, 0.52, 0.06], 20)
      addEllipsoid(root, furLight, [0, -0.72, 0.96], [0.58, 0.72, 0.12], 24)
    }
    if (kind === 'cat' && breed === 'calico') {
      addEllipsoid(root, accent, [-0.86, 1.22, 0.96], [0.5, 0.4, 0.07], 24).rotation.z = -0.28
      addEllipsoid(root, stripeMaterial, [0.76, -0.72, 0.9], [0.45, 0.62, 0.08], 24).rotation.z = 0.22
    }
    if (kind === 'cat' && breed === 'siamese') {
      addEllipsoid(root, stripeMaterial, [0, 0.24, 1.12], [0.7, 0.48, 0.13], 28)
    }
    if (kind === 'dog' && breed === 'border_collie') {
      addEllipsoid(root, furLight, [0, 1.25, 1.06], [0.2, 0.66, 0.06], 20)
      addEllipsoid(root, furLight, [0, -0.76, 0.96], [0.55, 0.72, 0.1], 24)
    }
    if (kind === 'dog' && ['toy_poodle', 'pomeranian'].includes(String(breed))) {
      const puffCount = breed === 'pomeranian' ? 11 : 7
      for (let index = 0; index < puffCount; index += 1) {
        const angle = (Math.PI * 2 * index) / puffCount
        addEllipsoid(
          root,
          furLight,
          [Math.cos(angle) * 1.3, 0.6 + Math.sin(angle) * 1.1, -0.02],
          [0.34, 0.34, 0.25],
          20,
        )
      }
    }

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(7.5, 5),
      new THREE.ShadowMaterial({ color: 0x2a251f, opacity: 0.14, transparent: true }),
    )
    floor.position.set(0, -2.18, 0)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)

    const toyMaterial = new THREE.MeshPhysicalMaterial({ color: 0xffd23f, roughness: 0.62, clearcoat: 0.18 })
    const toy = new THREE.Mesh(new THREE.SphereGeometry(0.31, 32, 24), toyMaterial)
    toy.position.set(2.05, -1.56, 2.02)
    scene.add(toy)
    const toyRing = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 10, 36), accent)
    toyRing.rotation.x = Math.PI / 2
    toy.add(toyRing)

    root.traverse((object) => {
      if (object instanceof THREE.Mesh) object.castShadow = true
    })
    toy.castShadow = true

    const pointer = {
      x: 0,
      y: 0,
      dragging: false,
      mode: 'rotate' as 'rotate' | 'toy' | 'pet',
      downX: 0,
      downY: 0,
      lastX: 0,
      lastY: 0,
      lastTime: performance.now(),
    }
    const pointerVector = new THREE.Vector2()
    const raycaster = new THREE.Raycaster()
    const toyVelocity = { x: 0, y: 0 }
    const targetRotation = { x: 0, y: 0 }
    let happyUntil = 0
    let actionUntil = 0
    let activeAction: PetAction = 'pet'
    let blinkStart = performance.now() + 1200 + Math.random() * 1800
    let frame = 0
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const moodLift = (moodScore - 3) / 2

    const resize = () => {
      const rect = host.getBoundingClientRect()
      const width = Math.max(1, rect.width)
      const height = Math.max(1, rect.height)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(host)

    const announceReaction = (message: string) => {
      setReaction(message)
      if (reactionTimer.current) clearTimeout(reactionTimer.current)
      reactionTimer.current = setTimeout(
        () => setReaction(`${name}가 눈을 맞추고 있어요`),
        1900,
      )
    }

    const updatePointerPosition = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
      pointerVector.set(pointer.x, pointer.y)
      raycaster.setFromCamera(pointerVector, camera)
    }

    const updatePointer = (event: PointerEvent) => {
      updatePointerPosition(event)
      if (pointer.dragging) {
        const moved = Math.hypot(event.clientX - pointer.downX, event.clientY - pointer.downY)
        if (moved > 6) suppressClickRef.current = true
        if (pointer.mode === 'toy') {
          const nextX = rubberbandClamp(pointer.x * 3.25, -2.55, 2.55, 1.4)
          const nextY = rubberbandClamp(pointer.y * 2.4 - 0.1, -1.62, 1.72, 1.2)
          const elapsedSeconds = Math.max(0.008, (event.timeStamp - pointer.lastTime) / 1000)
          toyVelocity.x = (nextX - toy.position.x) / elapsedSeconds
          toyVelocity.y = (nextY - toy.position.y) / elapsedSeconds
          toy.position.x = nextX
          toy.position.y = nextY
        } else if (pointer.mode === 'rotate') {
          targetRotation.y += (event.clientX - pointer.lastX) * 0.012
          targetRotation.x = THREE.MathUtils.clamp(targetRotation.x + (event.clientY - pointer.lastY) * 0.004, -0.18, 0.22)
        }
        pointer.lastX = event.clientX
        pointer.lastY = event.clientY
        pointer.lastTime = event.timeStamp
      }
    }

    const onPointerDown = (event: PointerEvent) => {
      updatePointerPosition(event)
      const hitToy = raycaster.intersectObject(toy, true).length > 0
      const hitHead = raycaster.intersectObject(head, true).length > 0
      pointer.dragging = true
      pointer.mode = hitToy ? 'toy' : hitHead ? 'pet' : 'rotate'
      pointer.downX = event.clientX
      pointer.downY = event.clientY
      pointer.lastX = event.clientX
      pointer.lastY = event.clientY
      pointer.lastTime = event.timeStamp
      suppressClickRef.current = hitToy || hitHead
      canvas.setPointerCapture(event.pointerId)
      if (hitHead) {
        happyUntil = performance.now() + 1350
        actionUntil = happyUntil
        activeAction = 'pet'
        signalSoftImpact()
        announceReaction(`${name}가 눈을 감고 손길을 느껴요`)
      } else if (hitToy) {
        signalSoftImpact()
        announceReaction(`${name}가 공을 따라 눈을 반짝여요`)
      }
    }
    const onPointerUp = (event: PointerEvent) => {
      pointer.dragging = false
      pointer.mode = 'rotate'
      if (reducedMotion) {
        toy.position.x = THREE.MathUtils.clamp(toy.position.x, -2.55, 2.55)
        toy.position.y = THREE.MathUtils.clamp(toy.position.y, -1.62, 1.72)
        toyVelocity.x = 0
        toyVelocity.y = 0
      }
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    }
    const onPointerLeave = () => {
      if (!pointer.dragging) {
        pointer.x = 0
        pointer.y = 0
      }
    }

    canvas.addEventListener('pointermove', updatePointer)
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('pointerleave', onPointerLeave)

    triggerRef.current = (nextAction) => {
      activeAction = nextAction
      const duration = nextAction === 'dance' ? 1900 : nextAction === 'treat' ? 1650 : 1350
      happyUntil = performance.now() + duration
      actionUntil = happyUntil
    }

    let previousFrameTime = performance.now()
    let happyBlend = 0
    const animate = (time: number) => {
      const t = time * 0.001
      const frameSeconds = Math.min(0.032, Math.max(0.001, (time - previousFrameTime) / 1000))
      previousFrameTime = time
      const happy = time < happyUntil
      const currentAction = time < actionUntil ? activeAction : null
      happyBlend += ((happy ? 1 : 0) - happyBlend) * (reducedMotion ? 1 : 0.16)
      const baseScale = compact ? 0.9 : 0.98
      const breathe = reducedMotion ? 1 : 1 + Math.sin(t * 2.15) * 0.012
      const dancePulse = currentAction === 'dance' && !reducedMotion ? Math.abs(Math.sin(t * 7.4)) * 0.028 : 0
      root.scale.y = baseScale * (breathe + dancePulse)
      root.scale.x = baseScale * (1 + happyBlend * 0.018 - dancePulse * 0.35)
      root.scale.z = baseScale
      const idleSway = reducedMotion ? 0 : Math.sin(t * 0.9) * 0.035
      const danceSway = currentAction === 'dance' && !reducedMotion ? Math.sin(t * 7.4) * 0.16 : 0
      const hop = happy && !reducedMotion
        ? Math.abs(Math.sin(t * (currentAction === 'dance' ? 7.4 : 8.5))) * (currentAction === 'dance' ? 0.2 : 0.12)
        : 0
      root.position.x += ((idleSway + danceSway) - root.position.x) * 0.12
      root.position.y = (compact ? -0.4 : -0.16) + hop
      root.rotation.z += ((currentAction === 'dance' ? Math.sin(t * 7.4) * 0.085 : idleSway * 0.18) - root.rotation.z) * 0.14
      const danceTurn = currentAction === 'dance' && !reducedMotion ? Math.sin(t * 3.7) * 0.16 : 0
      root.rotation.y += (THREE.MathUtils.clamp(targetRotation.y + pointer.x * 0.14 + danceTurn, -0.58, 0.58) - root.rotation.y) * 0.085
      root.rotation.x += (targetRotation.x - pointer.y * 0.026 - root.rotation.x) * 0.08

      const gazeX = pointer.mode === 'toy' ? toy.position.x / 3.25 : pointer.x
      const gazeY = pointer.mode === 'toy' ? (toy.position.y + 0.1) / 2.4 : pointer.y
      head.rotation.y += ((toy.position.x * 0.035 + pointer.x * 0.065) - head.rotation.y) * 0.09
      head.rotation.x += ((toy.position.y + 1.5) * -0.014 - pointer.y * 0.028 - head.rotation.x) * 0.09
      const treatNod = currentAction === 'treat' && !reducedMotion ? Math.abs(Math.sin(t * 8.8)) * -0.085 : 0
      head.position.y = 0.73 + moodLift * 0.018 + (reducedMotion ? 0 : Math.sin(t * 2.15 + 0.3) * 0.018) + treatNod
      const idleTailSpeed = 2.7 + Math.max(0, moodLift) * 0.8
      const idleTailRange = 0.08 + Math.max(0, moodLift) * 0.035
      tail.rotation.z = reducedMotion ? 0 : Math.sin(t * (happy ? 9 : idleTailSpeed)) * (idleTailRange + happyBlend * 0.17)
      const highfive = currentAction === 'highfive' ? 1 : 0
      const danceWave = currentAction === 'dance' ? Math.sin(t * 8.2) * 0.22 : 0
      wavingPaw.rotation.z += ((highfive ? -1.12 : 0.44 + danceWave + Math.sin(t * (happy ? 10.5 : 2.2)) * (0.035 + happyBlend * 0.14)) - wavingPaw.rotation.z) * 0.2
      wavingPaw.position.y += ((highfive ? 0.34 : -0.36) - wavingPaw.position.y) * 0.2
      wavingPaw.position.x += ((highfive ? 1.2 : 1.08) - wavingPaw.position.x) * 0.2
      leftPaw.rotation.x = happyBlend * Math.sin(t * 9.5) * 0.07
      rightPaw.rotation.x = happyBlend * Math.sin(t * 9.5 + 0.8) * 0.055
      const treatChew = currentAction === 'treat' && !reducedMotion ? 0.8 + Math.abs(Math.sin(t * 11)) * 0.5 : 0
      const idleMouth = 0.7 + moodLift * 0.1
      mouth.scale.y += (((happy ? 1.28 : idleMouth) + treatChew) - mouth.scale.y) * 0.18
      tongue.scale.y += (((happy && currentAction !== 'treat') ? 1 : 0.05) - tongue.scale.y) * 0.2
      eyebrows.forEach((eyebrow, eyebrowIndex) => {
        const moodAngle = moodLift * 0.06
        const defaultRotation = eyebrowIndex === 0 ? -1.26 + moodAngle : 1.26 - moodAngle
        const happyRotation = eyebrowIndex === 0 ? -1.08 : 1.08
        eyebrow.rotation.z += ((happy ? happyRotation : defaultRotation) - eyebrow.rotation.z) * 0.16
        eyebrow.position.y += ((happy ? 1.57 : 1.52) - eyebrow.position.y) * 0.16
      })

      if (!pointer.dragging && !reducedMotion) {
        const targetX = THREE.MathUtils.clamp(toy.position.x, -2.55, 2.55)
        const targetY = THREE.MathUtils.clamp(toy.position.y, -1.62, 1.72)
        const stiffness = 170
        const damping = 19
        toyVelocity.x += ((targetX - toy.position.x) * stiffness - toyVelocity.x * damping) * frameSeconds
        toyVelocity.y += ((targetY - toy.position.y) * stiffness - toyVelocity.y * damping) * frameSeconds
        toy.position.x += toyVelocity.x * frameSeconds
        toy.position.y += toyVelocity.y * frameSeconds
      }
      toy.rotation.y += reducedMotion ? 0 : 0.02
      toy.position.z = 2.02 + (reducedMotion ? 0 : Math.sin(t * 3.2) * 0.055)

      const blinkProgress = (time - blinkStart) / 180
      const eyeScaleY = blinkProgress >= 0 && blinkProgress <= 1
        ? Math.max(0.08, Math.abs(blinkProgress - 0.5) * 2)
        : currentAction === 'pet'
          ? 0.3
          : 1
      eyeGroups.forEach((eye, eyeIndex) => {
        eye.scale.y += (eyeScaleY - eye.scale.y) * 0.55
        const pupil = pupilGroups[eyeIndex]
        pupil.position.x += (THREE.MathUtils.clamp(gazeX * 0.075, -0.075, 0.075) - pupil.position.x) * 0.18
        pupil.position.y += (THREE.MathUtils.clamp(gazeY * 0.065, -0.065, 0.065) - pupil.position.y) * 0.18
      })
      if (blinkProgress > 1) blinkStart = time + 1600 + Math.random() * 2400

      renderer.render(scene, camera)
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)

    return () => {
      triggerRef.current = null
      cancelAnimationFrame(frame)
      observer.disconnect()
      canvas.removeEventListener('pointermove', updatePointer)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach((material) => material.dispose())
        }
      })
      renderer.dispose()
    }
  }, [breed, compact, kind, moodScore, name, outfit, palette])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      interact()
    }
  }

  return (
    <div
      ref={hostRef}
      className={`interactive-pet-3d${compact ? ' is-compact' : ''} ${className}`.trim()}
      role="button"
      tabIndex={0}
      aria-label={`${name} 쓰다듬기. 드래그하면 방향을 바꾸고 공을 움직일 수 있어요.`}
      title={`${name}와 놀기`}
      onKeyDown={handleKeyDown}
      onClick={handleHostClick}
    >
      {fallback ? (
        <PetPortrait kind={kind} name={name} className="interactive-pet-fallback" />
      ) : (
        <canvas ref={canvasRef} aria-hidden="true" />
      )}
      <div className="pet-3d-reaction" aria-live="polite">
        <Sparkles size={15} aria-hidden="true" />
        <span>{reaction}</span>
      </div>
      <span
        className="pet-3d-touch-target"
        aria-hidden="true"
      >
        <Hand size={18} aria-hidden="true" />
      </span>
    </div>
  )
}

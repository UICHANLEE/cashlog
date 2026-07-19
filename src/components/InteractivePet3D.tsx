import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Hand, Rotate3D, Sparkles } from 'lucide-react'
import * as THREE from 'three'
import {
  getPetPalette,
  type CatBreedId,
  type DogBreedId,
  type OutfitId,
  type PetKind,
  type PetPaletteId,
} from '../domain/pet'
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
}

type PetPortraitProps = {
  kind: PetKind
  name: string
  className?: string
}

const portraitPath = (kind: PetKind) => `/pets/${kind}-3d.png`

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

  if (outfit === 'party') {
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.35, 32), accent)
    hat.position.set(0.35, 2.18, 0.2)
    hat.rotation.z = -0.16
    parent.add(hat)
    addEllipsoid(parent, ink, [0.35, 2.9, 0.2], [0.14, 0.14, 0.14], 20)
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
}: InteractivePet3DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<(() => void) | null>(null)
  const [fallback, setFallback] = useState(false)
  const [reaction, setReaction] = useState(`${name}가 눈을 맞추고 있어요`)
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const interact = useCallback(() => {
    triggerRef.current?.()
    setReaction(`${name}가 기분 좋게 꼬리를 흔들어요`)
    if (reactionTimer.current) clearTimeout(reactionTimer.current)
    reactionTimer.current = setTimeout(() => setReaction(`${name}가 눈을 맞추고 있어요`), 1800)
  }, [name])

  useEffect(() => () => {
    if (reactionTimer.current) clearTimeout(reactionTimer.current)
  }, [])

  useEffect(() => {
    if (!cheer) return
    triggerRef.current?.()
    const timer = window.setTimeout(() => setReaction(`${name}가 폴짝 뛰며 반가워해요`), 0)
    return () => window.clearTimeout(timer)
  }, [cheer, name])

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
    renderer.toneMappingExposure = 1.12

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(compact ? 35 : 31, 1, 0.1, 100)
    camera.position.set(0, 0.25, compact ? 9.35 : 9.1)
    camera.lookAt(0, 0.25, 0)

    scene.add(new THREE.HemisphereLight(0xfff8e7, 0x8ccfb9, 2.8))
    const key = new THREE.DirectionalLight(0xffffff, 4.2)
    key.position.set(-4, 7, 6)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xff8d7c, 2.1)
    rim.position.set(5, 2, 2)
    scene.add(rim)

    const colors = getPetPalette(palette)
    const fur = new THREE.MeshPhysicalMaterial({
      color: colors.body,
      roughness: 0.72,
      metalness: 0,
      clearcoat: 0.16,
      clearcoatRoughness: 0.8,
      sheen: 0.3,
      sheenColor: new THREE.Color(colors.bodyAlt),
    })
    const furLight = new THREE.MeshPhysicalMaterial({ color: colors.bodyAlt, roughness: 0.68, clearcoat: 0.12 })
    const blush = new THREE.MeshPhysicalMaterial({ color: colors.blush, roughness: 0.62, transparent: true, opacity: 0.72 })
    const accent = new THREE.MeshPhysicalMaterial({ color: colors.accent, roughness: 0.52, clearcoat: 0.32 })
    const ink = new THREE.MeshPhysicalMaterial({ color: 0x261e1a, roughness: 0.2, clearcoat: 0.75 })
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const pink = new THREE.MeshPhysicalMaterial({ color: kind === 'cat' ? 0xff8b79 : 0x6c3f2e, roughness: 0.42 })
    const stripeMaterial = new THREE.MeshPhysicalMaterial({ color: colors.shadow, roughness: 0.75 })

    const root = new THREE.Group()
    root.position.y = compact ? -0.34 : -0.1
    root.scale.setScalar(compact ? 0.92 : 1)
    scene.add(root)

    const body = addEllipsoid(root, fur, [0, -0.82, 0], [1.2, 1.38, 0.98])
    if (kind === 'dog' && breed === 'dachshund') body.scale.x = 1.5
    const head = addEllipsoid(root, fur, [0, 0.72, 0.15], [1.58, 1.38, 1.14])
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

    addEllipsoid(root, furLight, [0, 0.22, 1.06], [0.82, 0.58, 0.32])
    const eyeGroups: THREE.Group[] = []
    ;[-0.56, 0.56].forEach((x) => {
      const eye = new THREE.Group()
      eye.position.set(x, 0.8, 1.16)
      root.add(eye)
      addEllipsoid(eye, white, [0, 0, 0], [0.46, 0.54, 0.24], 32)
      addEllipsoid(eye, ink, [0, -0.01, 0.18], [0.34, 0.42, 0.18], 32)
      addEllipsoid(eye, white, [-0.1, 0.13, 0.35], [0.085, 0.11, 0.055], 20)
      addEllipsoid(eye, white, [0.1, -0.1, 0.35], [0.04, 0.05, 0.03], 16)
      eyeGroups.push(eye)
    })

    addEllipsoid(root, blush, [-1.02, 0.24, 1.08], [0.35, 0.19, 0.07], 24)
    addEllipsoid(root, blush, [1.02, 0.24, 1.08], [0.35, 0.19, 0.07], 24)
    addEllipsoid(root, pink, [0, 0.29, 1.43], [0.16, 0.12, 0.1], 24)
    addEllipsoid(root, furLight, [-0.22, 0.08, 1.34], [0.28, 0.22, 0.16], 24)
    addEllipsoid(root, furLight, [0.22, 0.08, 1.34], [0.28, 0.22, 0.16], 24)

    const pawY = kind === 'dog' && breed === 'corgi' ? -1.87 : -1.74
    const leftPaw = addEllipsoid(root, furLight, [-0.7, pawY, 0.74], [0.52, 0.38, 0.52], 30)
    addEllipsoid(root, furLight, [0.7, pawY, 0.74], [0.52, 0.38, 0.52], 30)
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

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.62, 48),
      new THREE.MeshBasicMaterial({ color: 0x2a251f, transparent: true, opacity: 0.12, depthWrite: false }),
    )
    shadow.position.set(0, -2.1, -0.52)
    shadow.scale.y = 0.24
    root.add(shadow)

    const toyMaterial = new THREE.MeshPhysicalMaterial({ color: 0xffd23f, roughness: 0.62, clearcoat: 0.18 })
    const toy = new THREE.Mesh(new THREE.SphereGeometry(0.31, 32, 24), toyMaterial)
    toy.position.set(2.05, -1.56, 2.02)
    scene.add(toy)
    const toyRing = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 10, 36), accent)
    toyRing.rotation.x = Math.PI / 2
    toy.add(toyRing)

    const pointer = { x: 0, y: 0, dragging: false, toy: false, lastX: 0, lastY: 0 }
    const targetRotation = { x: 0, y: 0 }
    let happyUntil = 0
    let blinkStart = performance.now() + 1200 + Math.random() * 1800
    let frame = 0
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

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

    const updatePointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
      if (pointer.dragging) {
        if (pointer.toy) {
          toy.position.x = THREE.MathUtils.clamp(pointer.x * 3.25, -2.55, 2.55)
          toy.position.y = THREE.MathUtils.clamp(pointer.y * 2.4 - 0.1, -1.62, 1.72)
        } else {
          targetRotation.y += (event.clientX - pointer.lastX) * 0.012
          targetRotation.x = THREE.MathUtils.clamp(targetRotation.x + (event.clientY - pointer.lastY) * 0.004, -0.18, 0.22)
        }
        pointer.lastX = event.clientX
        pointer.lastY = event.clientY
      }
    }

    const onPointerDown = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.dragging = true
      pointer.lastX = event.clientX
      pointer.lastY = event.clientY
      pointer.toy = event.clientX > rect.left + rect.width * 0.68 && event.clientY > rect.top + rect.height * 0.58
      canvas.setPointerCapture(event.pointerId)
      happyUntil = performance.now() + 1050
    }
    const onPointerUp = (event: PointerEvent) => {
      pointer.dragging = false
      pointer.toy = false
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

    triggerRef.current = () => {
      happyUntil = performance.now() + 1050
    }

    const animate = (time: number) => {
      const t = time * 0.001
      const happy = time < happyUntil
      const breathe = reducedMotion ? 1 : 1 + Math.sin(t * 2.2) * 0.018
      root.scale.y = (compact ? 0.92 : 1) * breathe
      root.scale.x = compact ? 0.92 : 1
      root.scale.z = compact ? 0.92 : 1
      root.position.y = (compact ? -0.34 : -0.1) + (happy ? Math.abs(Math.sin(t * 9)) * 0.17 : 0)
      root.rotation.y += (THREE.MathUtils.clamp(targetRotation.y + pointer.x * 0.16, -0.65, 0.65) - root.rotation.y) * 0.075
      root.rotation.x += (targetRotation.x - pointer.y * 0.035 - root.rotation.x) * 0.07
      head.rotation.y += ((toy.position.x * 0.045 + pointer.x * 0.08) - head.rotation.y) * 0.08
      head.rotation.x += ((toy.position.y + 1.5) * -0.018 - pointer.y * 0.035 - head.rotation.x) * 0.08
      tail.rotation.z = reducedMotion ? 0 : Math.sin(t * (happy ? 8 : 3.3)) * (happy ? 0.22 : 0.1)
      wavingPaw.rotation.z = 0.44 + (happy ? Math.sin(t * 11) * 0.18 : Math.sin(t * 2.2) * 0.035)
      leftPaw.rotation.x = happy ? Math.sin(t * 10) * 0.08 : 0
      toy.rotation.y += reducedMotion ? 0 : 0.02
      toy.position.z = 2.02 + (reducedMotion ? 0 : Math.sin(t * 3.2) * 0.055)

      const blinkProgress = (time - blinkStart) / 180
      const eyeScaleY = blinkProgress >= 0 && blinkProgress <= 1
        ? Math.max(0.08, Math.abs(blinkProgress - 0.5) * 2)
        : happy
          ? 0.46
          : 1
      eyeGroups.forEach((eye) => {
        eye.scale.y += (eyeScaleY - eye.scale.y) * 0.55
        eye.rotation.y = pointer.x * 0.055
        eye.rotation.x = pointer.y * -0.04
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
  }, [breed, compact, interact, kind, outfit, palette])

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
      onKeyDown={handleKeyDown}
      onClick={interact}
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
      <div className="pet-3d-actions" aria-hidden="true">
        <span><Hand size={14} /> 쓰다듬기</span>
        <span><Rotate3D size={14} /> 돌려보기</span>
      </div>
      <button
        type="button"
        className="pet-3d-touch-target"
        onClick={(event) => {
          event.stopPropagation()
          interact()
        }}
        aria-label={`${name} 쓰다듬기`}
      >
        <Hand size={18} aria-hidden="true" />
      </button>
    </div>
  )
}

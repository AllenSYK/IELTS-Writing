'use client'

import { useEffect, useRef } from 'react'
import { useMotionPreference } from '@/components/interaction-system'

type FlowParticle = {
  x: number
  y: number
  vx: number
  vy: number
  age: number
  lifetime: number
  radius: number
  phase: number
  color: number
}

const FLOW_COLORS = ['80, 184, 126', '85, 145, 232', '161, 105, 224']

/** Soft, downward-flowing pigment trails rendered behind the page content. */
export function PricingWaterfall() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { enabled: reducedMotion } = useMotionPreference()

  useEffect(() => {
    const canvas = canvasRef.current
    const root = canvas?.closest<HTMLElement>('.pricing-page')
    if (!canvas || !root || reducedMotion) return

    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
    const systemReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const reducedTransparency = window.matchMedia('(prefers-reduced-transparency: reduce)')
    const context = canvas.getContext('2d')
    if (!context) return

    // Bake the soft gradients once; each frame only moves and stretches them.
    const pigments = FLOW_COLORS.map((color) => {
      const sprite = document.createElement('canvas')
      sprite.width = sprite.height = 128
      const brush = sprite.getContext('2d')
      if (brush) {
        const gradient = brush.createRadialGradient(64, 64, 0, 64, 64, 64)
        gradient.addColorStop(0, `rgba(${color}, 0.32)`)
        gradient.addColorStop(0.35, `rgba(${color}, 0.21)`)
        gradient.addColorStop(1, `rgba(${color}, 0)`)
        brush.fillStyle = gradient
        brush.fillRect(0, 0, 128, 128)
      }
      return sprite
    })

    const particles: FlowParticle[] = []
    const pointer = { x: 0, y: 0, originX: 0, originY: 0, vx: 0, initialized: false }
    let frame = 0
    let previousFrame = 0
    let lastPointerMove = -Infinity
    let emission = 0
    let width = 0
    let height = 0
    let renderScale = 1

    const stop = () => {
      cancelAnimationFrame(frame)
      frame = 0
      particles.length = 0
      emission = 0
      lastPointerMove = -Infinity
      pointer.initialized = false
      canvas.removeAttribute('data-flow-active')
      context.clearRect(0, 0, width, height)
    }

    const resize = () => {
      stop()
      width = window.innerWidth
      height = window.innerHeight
      // The intentionally soft effect needs no full-resolution pixel buffer.
      renderScale = Math.min(0.7, 900 / width, 900 / height)
      canvas.width = Math.max(1, Math.round(width * renderScale))
      canvas.height = Math.max(1, Math.round(height * renderScale))
      context.setTransform(renderScale, 0, 0, renderScale, 0, 0)
    }

    const draw = (now: number) => {
      frame = 0
      const dt = Math.max(0, Math.min((now - previousFrame) / 1000, 0.04))
      previousFrame = now
      context.clearRect(0, 0, width, height)

      const follow = 1 - Math.exp(-dt * 9)
      pointer.originX += (pointer.x - pointer.originX) * follow
      pointer.originY += (pointer.y - pointer.originY) * follow
      pointer.vx *= Math.exp(-dt * 4)

      // After the cursor rests, the existing color continues falling and fades.
      if (now - lastPointerMove < 850) {
        emission += dt * 18
        while (emission >= 1 && particles.length < 120) {
          emission -= 1
          for (let color = 0; color < pigments.length; color += 1) {
            const lane = color - 1
            particles.push({
              x: pointer.originX + lane * 46 + (Math.random() - 0.5) * 16,
              y: pointer.originY - 24,
              vx: -pointer.vx * 0.08 + lane * 18,
              vy: 48 + Math.random() * 24,
              age: 0,
              lifetime: 1.55 + Math.random() * 0.4,
              radius: 66 + Math.random() * 22,
              phase: Math.random() * Math.PI * 2,
              color
            })
          }
        }
      } else {
        emission = 0
      }

      let alive = 0
      for (const particle of particles) {
        particle.age += dt
        if (particle.age >= particle.lifetime) continue
        particle.vy += dt * 95
        particle.vx *= Math.exp(-dt * 0.8)
        particle.x += particle.vx * dt
        particle.y += particle.vy * dt
        const progress = particle.age / particle.lifetime
        const radius = particle.radius * (0.65 + progress * 0.65)
        const stretch = 2.3 + progress * 2.4
        const sway = Math.sin(particle.phase + particle.age * 2.4) * (8 + progress * 22)
        context.save()
        context.globalAlpha = Math.min(particle.age / 0.18, 1) * (1 - progress) ** 1.5
        context.translate(particle.x + sway, particle.y)
        context.rotate(-Math.atan2(particle.vx, particle.vy) * 0.5)
        context.drawImage(pigments[particle.color], -radius, -radius * 0.45, radius * 2, radius * stretch * 2)
        context.restore()
        particles[alive++] = particle
      }
      particles.length = alive

      if (alive || now - lastPointerMove < 850) {
        frame = requestAnimationFrame(draw)
      } else {
        canvas.removeAttribute('data-flow-active')
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || !finePointer.matches || systemReducedMotion.matches || reducedTransparency.matches || document.hidden) return
      const now = performance.now()
      if (!pointer.initialized) {
        pointer.originX = event.clientX
        pointer.originY = event.clientY
        pointer.vx = 0
        pointer.initialized = true
      } else {
        const elapsed = Math.max(8, now - lastPointerMove) / 1000
        pointer.vx = pointer.vx * 0.5 + Math.max(-700, Math.min(700, (event.clientX - pointer.x) / elapsed)) * 0.5
      }
      pointer.x = event.clientX
      pointer.y = event.clientY
      lastPointerMove = now
      canvas.dataset.flowActive = 'true'
      if (!frame) {
        previousFrame = now
        frame = requestAnimationFrame(draw)
      }
    }
    const onPointerLeave = () => { lastPointerMove = -Infinity }
    const onVisibilityChange = () => { if (document.hidden) stop() }

    resize()
    root.addEventListener('pointermove', onPointerMove, { passive: true })
    root.addEventListener('pointerleave', onPointerLeave)
    window.addEventListener('resize', resize, { passive: true })
    window.addEventListener('blur', stop)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stop()
      root.removeEventListener('pointermove', onPointerMove)
      root.removeEventListener('pointerleave', onPointerLeave)
      window.removeEventListener('resize', resize)
      window.removeEventListener('blur', stop)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [reducedMotion])

  return <canvas ref={canvasRef} className="pricing-pointer-waterfall" aria-hidden="true" />
}

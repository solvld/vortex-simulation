import './style.css'
import GUI from 'lil-gui'

type Vec2 = { x: number; y: number }

type PointId = 'topL' | 'topR' | 'botL' | 'botR'

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y }
}

function rotate(v: Vec2, angleRad: number): Vec2 {
  const c = Math.cos(angleRad)
  const s = Math.sin(angleRad)
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}

type TracedPoint = {
  id: PointId
  prev?: Vec2
  now?: Vec2
}

type Params = {
  running: boolean
  motion: {
    timeScale: number
    omegaGlobal: number
    omegaTop: number
    omegaBottom: number
    dtClampMax: number
  }
  geometry: {
    axisOffsetRatio: number
    armLenRatio: number
  }
  trails: {
    fadeAlpha: number
    width: number
    alpha: number
    passes: number
    maxSegmentRatio: number
  }
  overlay: {
    rodWidth: number
    rodAlpha: number
    rodColor: string
    axisColor: string
    axisShadowBlur: number
    centerAxisRadius: number
    rotorAxisRadius: number
    pointRadius: number
    pointShadowBlur: number
  }
  colors: Record<PointId, string>
  state: {
    thetaGlobal: number
    thetaTop: number
    thetaBottom: number
  }
  actions: {
    clearTrails: () => void
    resetAngles: () => void
    resetAll: () => void
  }
}

const appEl = document.querySelector<HTMLDivElement>('#app')
if (!appEl) throw new Error('Missing #app element')

// Two layers:
// - trailsCanvas: accumulated fading trails
// - overlayCanvas: crisp current geometry (axes, rods, points)
const trailsCanvas = document.createElement('canvas')
const overlayCanvas = document.createElement('canvas')
trailsCanvas.className = 'layer'
overlayCanvas.className = 'layer'
appEl.replaceChildren(trailsCanvas, overlayCanvas)

function get2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas not supported')
  return ctx
}

const trailsCtx = get2dContext(trailsCanvas)
const overlayCtx = get2dContext(overlayCanvas)

let dpr = 1
let w = 0
let h = 0

function resize() {
  dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1))
  w = Math.floor(window.innerWidth)
  h = Math.floor(window.innerHeight)

  for (const c of [trailsCanvas, overlayCanvas]) {
    c.width = Math.floor(w * dpr)
    c.height = Math.floor(h * dpr)
    c.style.width = `${w}px`
    c.style.height = `${h}px`
  }

  trailsCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
  overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0)

  // Clear trails on resize to avoid stretching artifacts.
  trailsCtx.globalCompositeOperation = 'source-over'
  trailsCtx.clearRect(0, 0, w, h)
  trailsCtx.fillStyle = 'black'
  trailsCtx.fillRect(0, 0, w, h)
}

window.addEventListener('resize', resize, { passive: true })
resize()

// --- Simulation parameters (tuned for “spirograph-like” trajectories) ---
const points: TracedPoint[] = [
  { id: 'topL' }, // red
  { id: 'topR' }, // orange
  { id: 'botL' }, // blue
  { id: 'botR' }, // purple
]

let lastT = performance.now()

function clearTrails() {
  for (const p of points) {
    p.prev = undefined
    p.now = undefined
  }
  trailsCtx.globalCompositeOperation = 'source-over'
  trailsCtx.fillStyle = 'black'
  trailsCtx.fillRect(0, 0, w, h)
}

const params: Params = {
  running: true,
  motion: {
    timeScale: 1.0,
    // Angular velocities (rad/s)
    omegaGlobal: 0.45,
    omegaTop: 2,
    omegaBottom: -2,
    // Clamp dt to keep things stable after tab switching.
    dtClampMax: 0.05,
  },
  geometry: {
    axisOffsetRatio: 0.22,
    armLenRatio: 0.18,
  },
  trails: {
    fadeAlpha: 0.01, // smaller => longer trails
    width: 1.25,
    alpha: 3,
    passes: 5, // multiple passes => more contrast, same thickness
    maxSegmentRatio: 0.05, // prevents long “tails” on jumps
  },
  overlay: {
    rodWidth: 3,
    rodAlpha: 0.35,
    rodColor: '#dcdcdc',
    axisColor: '#34c759',
    axisShadowBlur: 10,
    centerAxisRadius: 7,
    rotorAxisRadius: 8,
    pointRadius: 9,
    pointShadowBlur: 16,
  },
  colors: {
    topL: '#ff3b30',
    topR: '#ff9f0a',
    botL: '#0a84ff',
    botR: '#bf5af2',
  },
  state: {
    // Angles
    thetaGlobal: 0,
    thetaTop: 0,
    thetaBottom: 0,
  },
  actions: {
    clearTrails: () => clearTrails(),
    resetAngles: () => {
      params.state.thetaGlobal = 0
      params.state.thetaTop = 0
      params.state.thetaBottom = 0
    },
    resetAll: () => {
      params.actions.resetAngles()
      params.actions.clearTrails()
    },
  },
}

// --- GUI ---
const GUI_KEY = '__VORTEX_GUI__'
const prevGui = (globalThis as unknown as Record<string, unknown>)[GUI_KEY] as GUI | undefined
prevGui?.destroy()

const gui = new GUI({ title: 'Vortex' })
;(globalThis as unknown as Record<string, unknown>)[GUI_KEY] = gui
const runningController = gui.add(params, 'running').name('running')

const fMotion = gui.addFolder('motion')
fMotion.add(params.motion, 'timeScale', 0.05, 5, 0.05).name('timeScale')
fMotion.add(params.motion, 'omegaGlobal', -10, 10, 0.01).name('omegaGlobal')
fMotion.add(params.motion, 'omegaTop', -10, 10, 0.01).name('omegaTop')
fMotion.add(params.motion, 'omegaBottom', -10, 10, 0.01).name('omegaBottom')
fMotion.add(params.motion, 'dtClampMax', 0.001, 0.25, 0.001).name('dtClampMax')

const fGeometry = gui.addFolder('geometry')
fGeometry.add(params.geometry, 'axisOffsetRatio', 0, 0.5, 0.001).name('axisOffsetRatio')
fGeometry.add(params.geometry, 'armLenRatio', 0, 0.5, 0.001).name('armLenRatio')

const fTrails = gui.addFolder('trails')
fTrails.add(params.trails, 'fadeAlpha', 0, 0.025, 0.005).name('fadeAlpha')
fTrails.add(params.trails, 'width', 0.1, 5, 0.05).name('width')
fTrails.add(params.trails, 'alpha', 0, 5, 0.05).name('alpha')
fTrails.add(params.trails, 'passes', 1, 40, 1).name('passes')
fTrails.add(params.trails, 'maxSegmentRatio', 0, 0.2, 0.01).name('maxSegmentRatio')

const fOverlay = gui.addFolder('overlay')
fOverlay.add(params.overlay, 'rodAlpha', 0, 1, 0.01).name('rodAlpha')
fOverlay.addColor(params.overlay, 'axisColor').name('axisColor')

const fColors = gui.addFolder('colors')
fColors.addColor(params.colors, 'topL').name('topL')
fColors.addColor(params.colors, 'topR').name('topR')
fColors.addColor(params.colors, 'botL').name('botL')
fColors.addColor(params.colors, 'botR').name('botR')

const fActions = gui.addFolder('actions')
fActions.add(params.actions, 'clearTrails').name('clearTrails')
fActions.add(params.actions, 'resetAngles').name('resetAngles')
fActions.add(params.actions, 'resetAll').name('resetAll')

function getGeometry() {
  const minDim = Math.min(w, h)
  const center: Vec2 = { x: w / 2, y: h / 2 }
  const axisOffset = params.geometry.axisOffsetRatio * minDim
  const armLen = params.geometry.armLenRatio * minDim

  // Rotor centers orbit around the middle axis (big rotation).
  const topAxis = add(center, rotate({ x: 0, y: -axisOffset }, params.state.thetaGlobal))
  const bottomAxis = add(center, rotate({ x: 0, y: axisOffset }, params.state.thetaGlobal))

  // Arms rotate in the assembly frame (so total orientation is global + local).
  const topArmAngle = params.state.thetaGlobal + params.state.thetaTop
  const bottomArmAngle = params.state.thetaGlobal + params.state.thetaBottom

  const armVecR = (angle: number) => rotate({ x: armLen, y: 0 }, angle)
  const armVecL = (angle: number) => rotate({ x: -armLen, y: 0 }, angle)

  const topR = add(topAxis, armVecR(topArmAngle))
  const topL = add(topAxis, armVecL(topArmAngle))
  const botR = add(bottomAxis, armVecR(bottomArmAngle))
  const botL = add(bottomAxis, armVecL(bottomArmAngle))

  return { center, topAxis, bottomAxis, topL, topR, botL, botR }
}

function fadeTrails() {
  trailsCtx.globalCompositeOperation = 'source-over'
  trailsCtx.fillStyle = `rgba(0, 0, 0, ${params.trails.fadeAlpha})`
  trailsCtx.fillRect(0, 0, w, h)
}

function drawTrailSegment(p: TracedPoint) {
  if (!p.prev || !p.now) return

  trailsCtx.save()
  trailsCtx.globalCompositeOperation = 'source-over'
  trailsCtx.globalAlpha = params.trails.alpha
  trailsCtx.lineCap = 'round'
  trailsCtx.lineJoin = 'round'
  trailsCtx.lineWidth = params.trails.width
  trailsCtx.strokeStyle = params.colors[p.id]

  for (let i = 0; i < params.trails.passes; i++) {
    trailsCtx.beginPath()
    trailsCtx.moveTo(p.prev.x, p.prev.y)
    trailsCtx.lineTo(p.now.x, p.now.y)
    trailsCtx.stroke()
  }
  trailsCtx.restore()
}

function drawOverlay(geom: ReturnType<typeof getGeometry>) {
  overlayCtx.clearRect(0, 0, w, h)

  // Rods
  overlayCtx.save()
  overlayCtx.globalAlpha = params.overlay.rodAlpha
  overlayCtx.strokeStyle = params.overlay.rodColor
  overlayCtx.lineWidth = params.overlay.rodWidth
  overlayCtx.lineCap = 'round'

  overlayCtx.beginPath()
  overlayCtx.moveTo(geom.topL.x, geom.topL.y)
  overlayCtx.lineTo(geom.topR.x, geom.topR.y)
  overlayCtx.stroke()

  overlayCtx.beginPath()
  overlayCtx.moveTo(geom.botL.x, geom.botL.y)
  overlayCtx.lineTo(geom.botR.x, geom.botR.y)
  overlayCtx.stroke()

  overlayCtx.beginPath()
  overlayCtx.moveTo(geom.topAxis.x, geom.topAxis.y)
  overlayCtx.lineTo(geom.bottomAxis.x, geom.bottomAxis.y)
  overlayCtx.stroke()
  overlayCtx.restore()

  // Axes (green)
  const drawAxis = (p: Vec2, r: number) => {
    overlayCtx.save()
    overlayCtx.fillStyle = params.overlay.axisColor
    overlayCtx.shadowColor = params.overlay.axisColor
    overlayCtx.shadowBlur = params.overlay.axisShadowBlur
    overlayCtx.beginPath()
    overlayCtx.arc(p.x, p.y, r, 0, Math.PI * 2)
    overlayCtx.fill()
    overlayCtx.restore()
  }

  drawAxis(geom.center, params.overlay.centerAxisRadius)
  drawAxis(geom.topAxis, params.overlay.rotorAxisRadius)
  drawAxis(geom.bottomAxis, params.overlay.rotorAxisRadius)

  // Current points (colored)
  const drawPoint = (p: Vec2, color: string) => {
    overlayCtx.save()
    overlayCtx.fillStyle = color
    overlayCtx.shadowColor = color
    overlayCtx.shadowBlur = params.overlay.pointShadowBlur
    overlayCtx.beginPath()
    overlayCtx.arc(p.x, p.y, params.overlay.pointRadius, 0, Math.PI * 2)
    overlayCtx.fill()
    overlayCtx.restore()
  }

  drawPoint(geom.topL, params.colors.topL)
  drawPoint(geom.topR, params.colors.topR)
  drawPoint(geom.botL, params.colors.botL)
  drawPoint(geom.botR, params.colors.botR)
}

function step(dt: number) {
  const dts = clamp(dt, 0, params.motion.dtClampMax) * params.motion.timeScale
  params.state.thetaGlobal += params.motion.omegaGlobal * dts
  params.state.thetaTop += params.motion.omegaTop * dts
  params.state.thetaBottom += params.motion.omegaBottom * dts

  const geom = getGeometry()
  const maxSegment = params.trails.maxSegmentRatio * Math.min(w, h) // prevents long “tails” on jumps

  // Update point positions (for trail segments)
  const nextPositions: Record<PointId, Vec2> = {
    topL: geom.topL,
    topR: geom.topR,
    botL: geom.botL,
    botR: geom.botR,
  }

  for (const p of points) {
    const next = nextPositions[p.id]
    if (!p.now) {
      p.now = next
      p.prev = next
      continue
    }

    // If there was a big jump (resize/tab switch/etc) — don't draw a long segment.
    if (dist(p.now, next) > maxSegment) {
      p.now = next
      p.prev = next
      continue
    }

    p.prev = p.now
    p.now = next
  }

  fadeTrails()
  for (const p of points) drawTrailSegment(p)
  drawOverlay(geom)
}

function frame(t: number) {
  const dt = (t - lastT) / 1000
  lastT = t
  if (params.running) step(dt)
  rafId = requestAnimationFrame(frame)
}

let rafId = requestAnimationFrame(frame)

function onKeyDown(e: KeyboardEvent) {
  if (e.code === 'Space') {
    params.running = !params.running
    runningController.setValue(params.running)
  }
  if (e.key.toLowerCase() === 'r') {
    params.actions.clearTrails()
  }
}

// Small controls (optional but handy)
window.addEventListener('keydown', onKeyDown)

const hot = (import.meta as any).hot as { dispose(cb: () => void): void } | undefined
hot?.dispose(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('resize', resize)
  window.removeEventListener('keydown', onKeyDown)
  gui.destroy()
  const store = globalThis as unknown as Record<string, unknown>
  if (store[GUI_KEY] === gui) delete store[GUI_KEY]
})

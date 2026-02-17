import './style.css'

type Vec2 = { x: number; y: number }

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
  id: string
  color: string
  prev?: Vec2
  now?: Vec2
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
  { id: 'topL', color: '#ff3b30' }, // red
  { id: 'topR', color: '#ff9f0a' }, // orange
  { id: 'botL', color: '#0a84ff' }, // blue
  { id: 'botR', color: '#bf5af2' }, // purple
]

let running = true
let lastT = performance.now()

// Angles
let thetaGlobal = 0
let thetaTop = 0
let thetaBottom = 0

// Angular velocities (rad/s)
const omegaGlobal = 0.45
const omegaTop = 2.2
const omegaBottom = -1.6

// Visual settings
const trailFadeAlpha = 0.01 // smaller => longer trails
const trailWidth = 1.25
const trailAlpha = 3
const trailPasses = 5 // multiple passes => more contrast, same thickness

function getGeometry() {
  const minDim = Math.min(w, h)
  const center: Vec2 = { x: w / 2, y: h / 2 }
  const axisOffset = 0.22 * minDim
  const armLen = 0.18 * minDim

  // Rotor centers orbit around the middle axis (big rotation).
  const topAxis = add(center, rotate({ x: 0, y: -axisOffset }, thetaGlobal))
  const bottomAxis = add(center, rotate({ x: 0, y: axisOffset }, thetaGlobal))

  // Arms rotate in the assembly frame (so total orientation is global + local).
  const topArmAngle = thetaGlobal + thetaTop
  const bottomArmAngle = thetaGlobal + thetaBottom

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
  trailsCtx.fillStyle = `rgba(0, 0, 0, ${trailFadeAlpha})`
  trailsCtx.fillRect(0, 0, w, h)
}

function drawTrailSegment(p: TracedPoint) {
  if (!p.prev || !p.now) return

  trailsCtx.save()
  trailsCtx.globalCompositeOperation = 'source-over'
  trailsCtx.globalAlpha = trailAlpha
  trailsCtx.lineCap = 'round'
  trailsCtx.lineJoin = 'round'
  trailsCtx.lineWidth = trailWidth
  trailsCtx.strokeStyle = p.color

  for (let i = 0; i < trailPasses; i++) {
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
  overlayCtx.strokeStyle = 'rgba(220, 220, 220, 0.35)'
  overlayCtx.lineWidth = 3
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
  const axisColor = '#34c759'
  const drawAxis = (p: Vec2, r: number) => {
    overlayCtx.save()
    overlayCtx.fillStyle = axisColor
    overlayCtx.shadowColor = axisColor
    overlayCtx.shadowBlur = 10
    overlayCtx.beginPath()
    overlayCtx.arc(p.x, p.y, r, 0, Math.PI * 2)
    overlayCtx.fill()
    overlayCtx.restore()
  }

  drawAxis(geom.center, 7)
  drawAxis(geom.topAxis, 8)
  drawAxis(geom.bottomAxis, 8)

  // Current points (colored)
  const drawPoint = (p: Vec2, color: string) => {
    overlayCtx.save()
    overlayCtx.fillStyle = color
    overlayCtx.shadowColor = color
    overlayCtx.shadowBlur = 16
    overlayCtx.beginPath()
    overlayCtx.arc(p.x, p.y, 9, 0, Math.PI * 2)
    overlayCtx.fill()
    overlayCtx.restore()
  }

  drawPoint(geom.topL, points[0].color)
  drawPoint(geom.topR, points[1].color)
  drawPoint(geom.botL, points[2].color)
  drawPoint(geom.botR, points[3].color)
}

function step(dt: number) {
  // Clamp dt to keep things stable after tab switching.
  const dts = clamp(dt, 0, 0.05)
  thetaGlobal += omegaGlobal * dts
  thetaTop += omegaTop * dts
  thetaBottom += omegaBottom * dts

  const geom = getGeometry()
  const maxSegment = 0.025 * Math.min(w, h) // prevents long “tails” on jumps

  // Update point positions (for trail segments)
  const nextPositions: Record<string, Vec2> = {
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
  if (running) step(dt)
  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)

// Small controls (optional but handy)
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') running = !running
  if (e.key.toLowerCase() === 'r') {
    for (const p of points) {
      p.prev = undefined
      p.now = undefined
    }
    trailsCtx.globalCompositeOperation = 'source-over'
    trailsCtx.fillStyle = 'black'
    trailsCtx.fillRect(0, 0, w, h)
  }
})

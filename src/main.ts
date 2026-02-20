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
    // Phase offsets (degrees) applied to each rotor arm.
    topPhaseOffset: number
    bottomPhaseOffset: number
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
    timerMs: number
  }
  actions: {
    clearTrails: () => void
    resetAngles: () => void
    resetAll: () => void
    resetToDefault: () => void
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
let afterResize: (() => void) | undefined

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

  afterResize?.()
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

// Parse URL parameters
function parseURLParams(): Partial<Params> {
  const urlParams = new URLSearchParams(window.location.search)
  const parsed: any = {}

  // Motion parameters
  const timeScale = urlParams.get('timeScale')
  const omegaGlobal = urlParams.get('omegaGlobal')
  const omegaTop = urlParams.get('omegaTop')
  const omegaBottom = urlParams.get('omegaBottom')
  const dtClampMax = urlParams.get('dtClampMax')

  if (timeScale || omegaGlobal || omegaTop || omegaBottom || dtClampMax) {
    parsed.motion = {}
    if (timeScale) parsed.motion.timeScale = parseFloat(timeScale)
    if (omegaGlobal) parsed.motion.omegaGlobal = parseFloat(omegaGlobal)
    if (omegaTop) parsed.motion.omegaTop = parseFloat(omegaTop)
    if (omegaBottom) parsed.motion.omegaBottom = parseFloat(omegaBottom)
    if (dtClampMax) parsed.motion.dtClampMax = parseFloat(dtClampMax)
  }

  // Geometry parameters
  const axisOffsetRatio = urlParams.get('axisOffsetRatio')
  const armLenRatio = urlParams.get('armLenRatio')
  const topPhaseOffset = urlParams.get('topPhaseOffset')
  const bottomPhaseOffset = urlParams.get('bottomPhaseOffset')

  if (axisOffsetRatio || armLenRatio || topPhaseOffset || bottomPhaseOffset) {
    parsed.geometry = {}
    if (axisOffsetRatio) parsed.geometry.axisOffsetRatio = parseFloat(axisOffsetRatio)
    if (armLenRatio) parsed.geometry.armLenRatio = parseFloat(armLenRatio)
    if (topPhaseOffset) parsed.geometry.topPhaseOffset = clamp(parseFloat(topPhaseOffset), 0, 90)
    if (bottomPhaseOffset) parsed.geometry.bottomPhaseOffset = clamp(parseFloat(bottomPhaseOffset), 0, 90)
  }

  // Trails parameters
  const fadeAlpha = urlParams.get('fadeAlpha')
  const width = urlParams.get('width')
  const alpha = urlParams.get('alpha')
  const passes = urlParams.get('passes')
  const maxSegmentRatio = urlParams.get('maxSegmentRatio')

  if (fadeAlpha || width || alpha || passes || maxSegmentRatio) {
    parsed.trails = {}
    if (fadeAlpha) parsed.trails.fadeAlpha = parseFloat(fadeAlpha)
    if (width) parsed.trails.width = parseFloat(width)
    if (alpha) parsed.trails.alpha = parseFloat(alpha)
    if (passes) parsed.trails.passes = parseInt(passes)
    if (maxSegmentRatio) parsed.trails.maxSegmentRatio = parseFloat(maxSegmentRatio)
  }

  // Overlay parameters
  const rodWidth = urlParams.get('rodWidth')
  const rodAlpha = urlParams.get('rodAlpha')
  const rodColor = urlParams.get('rodColor')
  const axisColor = urlParams.get('axisColor')
  const axisShadowBlur = urlParams.get('axisShadowBlur')
  const centerAxisRadius = urlParams.get('centerAxisRadius')
  const rotorAxisRadius = urlParams.get('rotorAxisRadius')
  const pointRadius = urlParams.get('pointRadius')
  const pointShadowBlur = urlParams.get('pointShadowBlur')

  if (rodWidth || rodAlpha || rodColor || axisColor || axisShadowBlur || 
      centerAxisRadius || rotorAxisRadius || pointRadius || pointShadowBlur) {
    parsed.overlay = {}
    if (rodWidth) parsed.overlay.rodWidth = parseFloat(rodWidth)
    if (rodAlpha) parsed.overlay.rodAlpha = parseFloat(rodAlpha)
    if (rodColor) parsed.overlay.rodColor = '#' + rodColor.replace('#', '')
    if (axisColor) parsed.overlay.axisColor = '#' + axisColor.replace('#', '')
    if (axisShadowBlur) parsed.overlay.axisShadowBlur = parseFloat(axisShadowBlur)
    if (centerAxisRadius) parsed.overlay.centerAxisRadius = parseFloat(centerAxisRadius)
    if (rotorAxisRadius) parsed.overlay.rotorAxisRadius = parseFloat(rotorAxisRadius)
    if (pointRadius) parsed.overlay.pointRadius = parseFloat(pointRadius)
    if (pointShadowBlur) parsed.overlay.pointShadowBlur = parseFloat(pointShadowBlur)
  }

  // Colors
  const topL = urlParams.get('topL')
  const topR = urlParams.get('topR')
  const botL = urlParams.get('botL')
  const botR = urlParams.get('botR')

  if (topL || topR || botL || botR) {
    parsed.colors = {}
    if (topL) parsed.colors.topL = '#' + topL.replace('#', '')
    if (topR) parsed.colors.topR = '#' + topR.replace('#', '')
    if (botL) parsed.colors.botL = '#' + botL.replace('#', '')
    if (botR) parsed.colors.botR = '#' + botR.replace('#', '')
  }

  // State parameters
  const thetaGlobal = urlParams.get('thetaGlobal')
  const thetaTop = urlParams.get('thetaTop')
  const thetaBottom = urlParams.get('thetaBottom')

  if (thetaGlobal || thetaTop || thetaBottom) {
    parsed.state = {}
    if (thetaGlobal) parsed.state.thetaGlobal = parseFloat(thetaGlobal)
    if (thetaTop) parsed.state.thetaTop = parseFloat(thetaTop)
    if (thetaBottom) parsed.state.thetaBottom = parseFloat(thetaBottom)
  }

  return parsed
}

// Deep merge helper
function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = { ...target }
  for (const key in source) {
    const sourceValue = source[key]
    const targetValue = result[key]
    if (sourceValue !== undefined) {
      if (typeof sourceValue === 'object' && sourceValue !== null && !Array.isArray(sourceValue) &&
          typeof targetValue === 'object' && targetValue !== null && !Array.isArray(targetValue)) {
        result[key] = deepMerge(targetValue, sourceValue as any)
      } else {
        result[key] = sourceValue as any
      }
    }
  }
  return result
}

const defaultParams: Params = {
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
    topPhaseOffset: 0,
    bottomPhaseOffset: 0,
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
    timerMs: 0,
  },
  actions: {
    clearTrails: () => {},
    resetAngles: () => {},
    resetAll: () => {},
    resetToDefault: () => {},
  },
}

// Merge URL parameters with defaults
const urlOverrides = parseURLParams()
const params: Params = deepMerge(defaultParams, urlOverrides)

type ControllerLike = { updateDisplay: () => void }
const guiControllers: ControllerLike[] = []

// Set up actions after params is created
params.actions = {
  clearTrails: () => {
    clearTrails()
    params.state.timerMs = 0
    if (!params.running) renderPausedState()
  },
  resetAngles: () => {
    params.state.thetaGlobal = 0
    params.state.thetaTop = 0
    params.state.thetaBottom = 0
    if (!params.running) renderPausedState()
  },
  resetAll: () => {
    params.actions.resetAngles()
    params.actions.clearTrails()
  },
  resetToDefault: () => {
    params.running = defaultParams.running

    params.motion.timeScale = defaultParams.motion.timeScale
    params.motion.omegaGlobal = defaultParams.motion.omegaGlobal
    params.motion.omegaTop = defaultParams.motion.omegaTop
    params.motion.omegaBottom = defaultParams.motion.omegaBottom
    params.motion.dtClampMax = defaultParams.motion.dtClampMax

    params.geometry.axisOffsetRatio = defaultParams.geometry.axisOffsetRatio
    params.geometry.armLenRatio = defaultParams.geometry.armLenRatio
    params.geometry.topPhaseOffset = defaultParams.geometry.topPhaseOffset
    params.geometry.bottomPhaseOffset = defaultParams.geometry.bottomPhaseOffset

    params.trails.fadeAlpha = defaultParams.trails.fadeAlpha
    params.trails.width = defaultParams.trails.width
    params.trails.alpha = defaultParams.trails.alpha
    params.trails.passes = defaultParams.trails.passes
    params.trails.maxSegmentRatio = defaultParams.trails.maxSegmentRatio

    params.overlay.rodWidth = defaultParams.overlay.rodWidth
    params.overlay.rodAlpha = defaultParams.overlay.rodAlpha
    params.overlay.rodColor = defaultParams.overlay.rodColor
    params.overlay.axisColor = defaultParams.overlay.axisColor
    params.overlay.axisShadowBlur = defaultParams.overlay.axisShadowBlur
    params.overlay.centerAxisRadius = defaultParams.overlay.centerAxisRadius
    params.overlay.rotorAxisRadius = defaultParams.overlay.rotorAxisRadius
    params.overlay.pointRadius = defaultParams.overlay.pointRadius
    params.overlay.pointShadowBlur = defaultParams.overlay.pointShadowBlur

    params.colors.topL = defaultParams.colors.topL
    params.colors.topR = defaultParams.colors.topR
    params.colors.botL = defaultParams.colors.botL
    params.colors.botR = defaultParams.colors.botR

    // Also reset current state & visuals.
    params.state.thetaGlobal = defaultParams.state.thetaGlobal
    params.state.thetaTop = defaultParams.state.thetaTop
    params.state.thetaBottom = defaultParams.state.thetaBottom
    params.actions.clearTrails()

    for (const c of guiControllers) c.updateDisplay()
    syncUrlFromParams()
    if (!params.running) renderPausedState()
  },
}

function syncUrlFromParams() {
  const url = new URL(window.location.href)
  const sp = url.searchParams

  // NOTE: we intentionally always set values (including defaults).
  // This makes it obvious the URL is updating and avoids string/float equality edge cases.
  const toUrlColor = (c: string) => c.trim().replace(/^#/, '').toLowerCase()

  // Don't store runtime state in URL.
  // Also clean up any legacy keys if present.
  sp.delete('running')
  sp.delete('isrunning')

  // motion
  sp.set('timeScale', String(params.motion.timeScale))
  sp.set('omegaGlobal', String(params.motion.omegaGlobal))
  sp.set('omegaTop', String(params.motion.omegaTop))
  sp.set('omegaBottom', String(params.motion.omegaBottom))
  sp.set('dtClampMax', String(params.motion.dtClampMax))

  // geometry
  sp.set('axisOffsetRatio', String(params.geometry.axisOffsetRatio))
  sp.set('armLenRatio', String(params.geometry.armLenRatio))
  sp.set('topPhaseOffset', String(params.geometry.topPhaseOffset))
  sp.set('bottomPhaseOffset', String(params.geometry.bottomPhaseOffset))

  // trails
  sp.set('fadeAlpha', String(params.trails.fadeAlpha))
  sp.set('width', String(params.trails.width))
  sp.set('alpha', String(params.trails.alpha))
  sp.set('passes', String(params.trails.passes))
  sp.set('maxSegmentRatio', String(params.trails.maxSegmentRatio))

  // overlay (GUI-exposed)
  sp.set('rodAlpha', String(params.overlay.rodAlpha))
  sp.set('axisColor', toUrlColor(params.overlay.axisColor))

  // colors
  sp.set('topL', toUrlColor(params.colors.topL))
  sp.set('topR', toUrlColor(params.colors.topR))
  sp.set('botL', toUrlColor(params.colors.botL))
  sp.set('botR', toUrlColor(params.colors.botR))

  history.replaceState(null, '', url)
}

let lastUrlSyncAtMs = 0

function onParamsChange() {
  syncUrlFromParams()
  if (!params.running) renderPausedState()
}

// --- GUI ---
const GUI_KEY = '__VORTEX_GUI__'
const prevGui = (globalThis as unknown as Record<string, unknown>)[GUI_KEY] as GUI | undefined
prevGui?.destroy()

const gui = new GUI({ title: 'Vortex' })
;(globalThis as unknown as Record<string, unknown>)[GUI_KEY] = gui

// Start collapsed on mobile-sized screens.
const mobileGuiMq = window.matchMedia('(max-width: 768px), (pointer: coarse)')
const onMobileGuiMqChange = () => {
  if (mobileGuiMq.matches) gui.close()
}
onMobileGuiMqChange()
if ('addEventListener' in mobileGuiMq) mobileGuiMq.addEventListener('change', onMobileGuiMqChange)
else (mobileGuiMq as any).addListener(onMobileGuiMqChange)

const runningController = gui.add(params, 'running').name('running').onChange(onParamsChange)
guiControllers.push(runningController)

const fMotion = gui.addFolder('motion')
guiControllers.push(
  fMotion.add(params.motion, 'timeScale', 0.05, 5, 0.05).name('timeScale').onChange(onParamsChange),
)
guiControllers.push(
  fMotion.add(params.motion, 'omegaGlobal', -10, 10, 0.01).name('omegaGlobal').onChange(onParamsChange),
)
guiControllers.push(fMotion.add(params.motion, 'omegaTop', -10, 10, 0.01).name('omegaTop').onChange(onParamsChange))
guiControllers.push(
  fMotion.add(params.motion, 'omegaBottom', -10, 10, 0.01).name('omegaBottom').onChange(onParamsChange),
)
guiControllers.push(
  fMotion.add(params.motion, 'dtClampMax', 0.001, 0.25, 0.001).name('dtClampMax').onChange(onParamsChange),
)

const fGeometry = gui.addFolder('geometry')
guiControllers.push(
  fGeometry
    .add(params.geometry, 'axisOffsetRatio', 0, 0.5, 0.001)
    .name('axisOffsetRatio')
    .onChange(onParamsChange),
)
guiControllers.push(
  fGeometry.add(params.geometry, 'armLenRatio', 0, 0.5, 0.001).name('armLenRatio').onChange(onParamsChange),
)
guiControllers.push(
  fGeometry
    .add(params.geometry, 'topPhaseOffset', 0, 90, 1)
    .name('topPhaseOffset')
    .onChange(onParamsChange),
)
guiControllers.push(
  fGeometry
    .add(params.geometry, 'bottomPhaseOffset', 0, 90, 1)
    .name('bottomPhaseOffset')
    .onChange(onParamsChange),
)

const fTrails = gui.addFolder('trails')
guiControllers.push(
  fTrails.add(params.trails, 'fadeAlpha', 0, 0.025, 0.005).name('fadeAlpha').onChange(onParamsChange),
)
guiControllers.push(fTrails.add(params.trails, 'width', 0.1, 5, 0.05).name('width').onChange(onParamsChange))
guiControllers.push(fTrails.add(params.trails, 'alpha', 0, 5, 0.05).name('alpha').onChange(onParamsChange))
guiControllers.push(fTrails.add(params.trails, 'passes', 1, 40, 1).name('passes').onChange(onParamsChange))
guiControllers.push(
  fTrails
    .add(params.trails, 'maxSegmentRatio', 0, 0.2, 0.01)
    .name('maxSegmentRatio')
    .onChange(onParamsChange),
)

const fOverlay = gui.addFolder('overlay')
guiControllers.push(fOverlay.add(params.overlay, 'rodAlpha', 0, 1, 0.01).name('rodAlpha').onChange(onParamsChange))
guiControllers.push(fOverlay.addColor(params.overlay, 'axisColor').name('axisColor').onChange(onParamsChange))

const fColors = gui.addFolder('colors')
guiControllers.push(fColors.addColor(params.colors, 'topL').name('topL').onChange(onParamsChange))
guiControllers.push(fColors.addColor(params.colors, 'topR').name('topR').onChange(onParamsChange))
guiControllers.push(fColors.addColor(params.colors, 'botL').name('botL').onChange(onParamsChange))
guiControllers.push(fColors.addColor(params.colors, 'botR').name('botR').onChange(onParamsChange))

const fActions = gui.addFolder('actions')
fActions.add(params.actions, 'clearTrails').name('clearTrails')
fActions.add(params.actions, 'resetAngles').name('resetAngles')
fActions.add(params.actions, 'resetAll').name('resetAll')
fActions.add(params.actions, 'resetToDefault').name('resetToDefault')

// Ensure URL reflects current GUI state immediately.
syncUrlFromParams()

afterResize = () => {
  if (!params.running) renderPausedState()
}

function getGeometry() {
  const minDim = Math.min(w, h)
  const center: Vec2 = { x: w / 2, y: h / 2 }
  const axisOffset = params.geometry.axisOffsetRatio * minDim
  const armLen = params.geometry.armLenRatio * minDim

  // Rotor centers orbit around the middle axis (big rotation).
  const topAxis = add(center, rotate({ x: 0, y: -axisOffset }, params.state.thetaGlobal))
  const bottomAxis = add(center, rotate({ x: 0, y: axisOffset }, params.state.thetaGlobal))

  // Arms rotate in the assembly frame (so total orientation is global + local).
  const degToRad = (deg: number) => (deg * Math.PI) / 180
  const topArmAngle = params.state.thetaGlobal + params.state.thetaTop + degToRad(params.geometry.topPhaseOffset)
  const bottomArmAngle = params.state.thetaGlobal + params.state.thetaBottom + degToRad(params.geometry.bottomPhaseOffset)

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

  // Timer (top-left)
  const formatTimer = (msTotal: number) => {
    const ms = Math.max(0, Math.floor(msTotal))
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    const millis = ms % 1000
    const mm = String(minutes).padStart(2, '0')
    const ss = String(seconds).padStart(2, '0')
    const mmm = String(millis).padStart(3, '0')
    return `${mm}:${ss}.${mmm}`
  }

  const timerText = formatTimer(params.state.timerMs)
  overlayCtx.save()
  overlayCtx.font = '400 20px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
  overlayCtx.textAlign = 'left'
  overlayCtx.textBaseline = 'top'
  const pad = 8
  const x = 10
  const y = 10
  const metrics = overlayCtx.measureText(timerText)
  const textW = Math.ceil(metrics.width)
  const textH = 18
  overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.45)'
  overlayCtx.fillRect(x - pad, y - pad, textW + pad * 2, textH + pad * 2)
  overlayCtx.fillStyle = 'rgba(255, 255, 255, 0.92)'
  overlayCtx.fillText(timerText, x, y)
  overlayCtx.restore()
}

function syncPointsToGeometry(geom: ReturnType<typeof getGeometry>) {
  const nextPositions: Record<PointId, Vec2> = {
    topL: geom.topL,
    topR: geom.topR,
    botL: geom.botL,
    botR: geom.botR,
  }

  for (const p of points) {
    const next = nextPositions[p.id]
    p.now = next
    p.prev = next
  }
}

function renderPausedState() {
  const geom = getGeometry()
  syncPointsToGeometry(geom)
  drawOverlay(geom)
}

function step(dt: number) {
  const dts = clamp(dt, 0, params.motion.dtClampMax) * params.motion.timeScale
  params.state.thetaGlobal += params.motion.omegaGlobal * dts
  params.state.thetaTop += params.motion.omegaTop * dts
  params.state.thetaBottom += params.motion.omegaBottom * dts
  params.state.timerMs += dts * 1000

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

  // Fallback: keep URL in sync even if GUI callbacks fail.
  if (t - lastUrlSyncAtMs > 250) {
    lastUrlSyncAtMs = t
    syncUrlFromParams()
  }

  rafId = requestAnimationFrame(frame)
}

let rafId = requestAnimationFrame(frame)

function onKeyDown(e: KeyboardEvent) {
  if (e.code === 'Space') {
    // Space should control pause ONLY (do not activate focused GUI buttons).
    e.preventDefault()
    e.stopPropagation()
    params.running = !params.running
    runningController.setValue(params.running)
  }
  if (e.key.toLowerCase() === 'r') {
    params.actions.clearTrails()
  }
}

// Small controls (optional but handy)
const keydownOptions = { capture: true } as const
window.addEventListener('keydown', onKeyDown, keydownOptions)

const hot = (import.meta as any).hot as { dispose(cb: () => void): void } | undefined
hot?.dispose(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('resize', resize)
  window.removeEventListener('keydown', onKeyDown, keydownOptions)
  if ('removeEventListener' in mobileGuiMq) mobileGuiMq.removeEventListener('change', onMobileGuiMqChange)
  else (mobileGuiMq as any).removeListener(onMobileGuiMqChange)
  gui.destroy()
  const store = globalThis as unknown as Record<string, unknown>
  if (store[GUI_KEY] === gui) delete store[GUI_KEY]
})

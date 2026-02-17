export const NUM_PARTICLES = 3000

// Euler time step (seconds, in "simulation time").
export const DT = 0.35

// Smoothing constant added to r^2 to avoid singular velocities at the vortex core.
// Per spec: r^2 = dx^2 + dy^2 + EPSILON
export const EPSILON = 25

export const VORTEX_GAMMAS = {
  // Circulation Γ (units: px^2 / s when positions are in px).
  center: 300_000,
  left: -150_000,
  right: -150_000,
} as const

// Visualization tuning
export const BACKGROUND_FADE_ALPHA = 0.08
export const COLOR_ALPHA = 0.08
export const COLOR_SATURATION = 85
export const COLOR_VALUE = 100

export const HUE_MIN = 180
export const HUE_MAX = 360

// Speed (px/s) where hue reaches HUE_MAX.
export const SPEED_FOR_HUE_MAX = 450


## Vortex Simulation (TypeScript + Canvas)

A **2D rotation-based trajectory simulation** that creates spirograph-like patterns:

- **Green points** are **rotation axes**
- **Colored points** move according to a kinematic setup and leave **colored trails**
- Trails are drawn on a separate canvas layer and **fade over time**

The implementation uses **two stacked `<canvas>` layers**:

- `trailsCanvas`: accumulated fading trails
- `overlayCanvas`: crisp current geometry (axes, rods, points)

## How to run

```bash
npm install
npm run dev
```

Open the printed local URL in your browser.

## Controls

### Keyboard

- **Space**: pause / resume
- **R**: clear trails

### URL Parameters

You can set initial parameters via URL query string. All GUI parameters are supported:

**Example:**
```
http://localhost:5173/?omegaGlobal=1.5&omegaTop=3&fadeAlpha=0.005&topL=ff0000
```

**Available parameters:**

- **Motion**: `timeScale`, `omegaGlobal`, `omegaTop`, `omegaBottom`, `dtClampMax`
- **Geometry**: `axisOffsetRatio`, `armLenRatio`, `topPhaseOffset`, `bottomPhaseOffset`
- **Trails**: `fadeAlpha`, `width`, `alpha`, `passes`, `maxSegmentRatio`
- **Overlay**: `rodWidth`, `rodAlpha`, `rodColor`, `axisColor`, `axisShadowBlur`, `centerAxisRadius`, `rotorAxisRadius`, `pointRadius`, `pointShadowBlur`
- **Colors**: `topL`, `topR`, `botL`, `botR` (hex colors without `#`, e.g., `ff3b30`)
- **State**: `thetaGlobal`, `thetaTop`, `thetaBottom` (initial angles in radians)
### GUI (lil-gui)

All simulation parameters can be adjusted in real-time via the GUI panel:

- **Motion**
  - `timeScale`: speed multiplier (0.05–5×) — slow down or speed up the simulation
  - `omegaGlobal`, `omegaTop`, `omegaBottom`: angular velocities (rad/s)
  - `dtClampMax`: max time step (prevents jumps after tab switching)

- **Geometry**
  - `axisOffsetRatio`: distance between rotation axes
  - `armLenRatio`: length of rotating arms
  - `topPhaseOffset`: phase offset for the top arm (degrees)
  - `bottomPhaseOffset`: phase offset for the bottom arm (degrees)

- **Trails**
  - `fadeAlpha`: trail fade rate (smaller = longer trails)
  - `width`: line thickness
  - `alpha`: segment intensity
  - `passes`: number of draw passes (higher = more contrast)
  - `maxSegmentRatio`: max segment length (prevents "tails" on jumps)

- **Overlay**
  - `rodAlpha`: opacity of connecting rods
  - `axisColor`: color of rotation axes

- **Colors**
  - Individual colors for each traced point (`topL`, `topR`, `botL`, `botR`)

- **Actions**
  - `clearTrails`: clear all trails
  - `resetAngles`: reset rotation angles to zero
  - `resetAll`: clear trails + reset angles

## Notes

- The trail renderer keeps trails **thin and sharp** (no blur/glow)
- Time step clamping prevents visual artifacts after tab switching or frame drops
- GUI state persists during Vite HMR (hot module replacement)

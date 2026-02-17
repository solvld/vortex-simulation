## Rotation / Trajectory Simulation (TypeScript + Canvas)

This project is a **2D rotation-based trajectory simulation** inspired by the provided sketch:

- **Green points** are **rotation axes**.
- **Colored points** move according to a simple kinematic setup and leave **colored trails** on the background.
- Trails are drawn on a separate canvas layer and **fade over time**.

The current implementation uses **two stacked `<canvas>` layers**:

- `trailsCanvas`: accumulated fading trails
- `overlayCanvas`: crisp current geometry (axes, rods, points)

## How to run

```bash
npm install
npm run dev
```

Open the printed local URL in your browser.

## Controls

- **Space**: pause / resume
- **R**: clear trails

## What to tweak

Most useful parameters are in `src/main.ts`:

- **Motion**
  - `omegaGlobal`, `omegaTop`, `omegaBottom` (angular velocities, rad/s)
  - geometry proportions inside `getGeometry()` (`axisOffset`, `armLen`)
- **Trails**
  - `trailFadeAlpha` (smaller = trails persist longer)
  - `trailWidth` (line thickness)
  - `trailAlpha` (segment intensity)
  - `trailPasses` (multiple passes for higher contrast without blur)

## Notes

- The trail renderer intentionally avoids blur/glow and keeps trails **thin and sharp**.
- To prevent long “tails” after tab switching or large frame-time jumps, the code skips drawing segments that exceed a distance threshold (`maxSegment` in `step()`).


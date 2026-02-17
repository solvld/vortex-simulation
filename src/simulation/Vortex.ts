import type { Vec2 } from '../utils/math.ts'
import { set } from '../utils/math.ts'

const TWO_PI = Math.PI * 2

export class Vortex {
  public readonly position: Vec2
  public gamma: number

  public constructor(position: Vec2, gamma: number) {
    // Store a copy to prevent accidental external mutation.
    this.position = { x: position.x, y: position.y }
    this.gamma = gamma
  }

  /**
   * Point vortex velocity field in 2D:
   *   v = Γ / (2π r²) * (-y, x)
   * where (x, y) is the displacement vector from vortex -> evaluation point.
   *
   * Per spec: r² = dx² + dy² + epsilon
   */
  public velocityAt(point: Vec2, epsilon: number, out: Vec2): void {
    const dx = point.x - this.position.x
    const dy = point.y - this.position.y
    const r2 = dx * dx + dy * dy + epsilon
    const factor = this.gamma / (TWO_PI * r2)

    // Perpendicular vector (-dy, dx)
    set(out, factor * (-dy), factor * dx)
  }
}


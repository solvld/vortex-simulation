import type p5 from 'p5'

import type { Vec2 } from '../utils/math.ts'
import { length, set } from '../utils/math.ts'

import type { Vortex } from './Vortex.ts'

export class Particle {
  public readonly position: Vec2
  private readonly previousPosition: Vec2
  private readonly velocity: Vec2

  private readonly tmp: Vec2

  public constructor(initialPosition: Vec2) {
    this.position = { x: initialPosition.x, y: initialPosition.y }
    this.previousPosition = { x: initialPosition.x, y: initialPosition.y }
    this.velocity = { x: 0, y: 0 }
    this.tmp = { x: 0, y: 0 }
  }

  /**
   * Euler integration:
   *   x_{n+1} = x_n + v(x_n) * dt
   *
   * Velocity is the sum of all vortex-induced velocities.
   *
   * Returns the velocity magnitude (speed) at the particle position.
   */
  public step(vortices: readonly Vortex[], dt: number, epsilon: number): number {
    set(this.previousPosition, this.position.x, this.position.y)

    let vx = 0
    let vy = 0

    for (const vortex of vortices) {
      vortex.velocityAt(this.position, epsilon, this.tmp)
      vx += this.tmp.x
      vy += this.tmp.y
    }

    set(this.velocity, vx, vy)

    this.position.x += vx * dt
    this.position.y += vy * dt

    return length(vx, vy)
  }

  public draw(p: p5, hue: number, saturation: number, value: number, alpha: number): void {
    p.stroke(hue, saturation, value, alpha)
    p.strokeWeight(1)
    p.line(
      this.previousPosition.x,
      this.previousPosition.y,
      this.position.x,
      this.position.y,
    )
  }
}


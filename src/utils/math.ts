export interface Vec2 {
  x: number
  y: number
}

export function length(x: number, y: number): number {
  return Math.hypot(x, y)
}

export function set(out: Vec2, x: number, y: number): void {
  out.x = x
  out.y = y
}

export function copy(out: Vec2, v: Vec2): void {
  out.x = v.x
  out.y = v.y
}


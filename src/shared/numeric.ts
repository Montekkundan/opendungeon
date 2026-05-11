export function wrap(value: number, count: number) {
  return (value + count) % count
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function lerp(from: number, to: number, progress: number) {
  return from + (to - from) * progress
}

export function easeOutCubic(progress: number) {
  const t = clamp(progress, 0, 1)
  return 1 - (1 - t) ** 3
}

export function easeInOutCubic(progress: number) {
  const t = clamp(progress, 0, 1)
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

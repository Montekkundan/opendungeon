export function wrap(value: number, count: number) {
  return (value + count) % count
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

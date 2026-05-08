type VirtualPoint = [number, number]

export function makeVirtual(width: number, height: number) {
  return Array.from<string | undefined>({ length: width * height })
}

export function makeVirtualSpriteCanvas(width: number, height: number) {
  const virtualWidth = Math.max(1, width)
  const virtualHeight = Math.max(1, height * 2)
  return {
    virtualWidth,
    virtualHeight,
    pixels: makeVirtual(virtualWidth, virtualHeight),
  }
}

export function setVirtual(pixels: Array<string | undefined>, width: number, height: number, x: number, y: number, color: string) {
  const px = Math.round(x)
  const py = Math.round(y)
  if (px < 0 || py < 0 || px >= width || py >= height) return
  pixels[py * width + px] = color
}

export function fillRect(pixels: Array<string | undefined>, width: number, height: number, x: number, y: number, w: number, h: number, color: string) {
  const startX = Math.floor(x)
  const startY = Math.floor(y)
  const endX = Math.ceil(x + w)
  const endY = Math.ceil(y + h)
  for (let py = startY; py < endY; py++) for (let px = startX; px < endX; px++) setVirtual(pixels, width, height, px, py, color)
}

export function fillPolygon(pixels: Array<string | undefined>, width: number, height: number, points: VirtualPoint[], color: string) {
  const minX = Math.floor(Math.min(...points.map((point) => point[0])))
  const maxX = Math.ceil(Math.max(...points.map((point) => point[0])))
  const minY = Math.floor(Math.min(...points.map((point) => point[1])))
  const maxY = Math.ceil(Math.max(...points.map((point) => point[1])))
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) if (insidePolygon(x + 0.5, y + 0.5, points)) setVirtual(pixels, width, height, x, y, color)
  }
}

export function fillEllipse(pixels: Array<string | undefined>, width: number, height: number, cx: number, cy: number, rx: number, ry: number, color: string) {
  const minX = Math.floor(cx - rx)
  const maxX = Math.ceil(cx + rx)
  const minY = Math.floor(cy - ry)
  const maxY = Math.ceil(cy + ry)
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = (x - cx) / Math.max(1, rx)
      const dy = (y - cy) / Math.max(1, ry)
      if (dx * dx + dy * dy <= 1) setVirtual(pixels, width, height, x, y, color)
    }
  }
}

export function drawLine(pixels: Array<string | undefined>, width: number, height: number, x0: number, y0: number, x1: number, y1: number, color: string) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)))
  for (let step = 0; step <= steps; step++) {
    const t = step / steps
    setVirtual(pixels, width, height, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, color)
  }
}

export function rgbToHex(r: number, g: number, b: number) {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function spriteFromVirtual(pixels: Array<string | undefined>, width: number, height: number) {
  const cells = []
  for (let row = 0; row < height; row++) {
    const cellsRow = []
    for (let col = 0; col < width; col++) {
      const top = pixels[row * 2 * width + col]
      const bottom = pixels[(row * 2 + 1) * width + col]
      if (top && bottom) cellsRow.push({ ch: "▀", fg: top, bg: bottom })
      else if (top) cellsRow.push({ ch: "▀", fg: top })
      else if (bottom) cellsRow.push({ ch: "▄", fg: bottom })
      else cellsRow.push({ ch: " ", fg: "#000000" })
    }
    cells.push(cellsRow)
  }
  return { width, height, cells }
}

function toHex(value: number) {
  return value.toString(16).padStart(2, "0")
}

function insidePolygon(x: number, y: number, points: VirtualPoint[]) {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i]?.[0] ?? 0
    const yi = points[i]?.[1] ?? 0
    const xj = points[j]?.[0] ?? 0
    const yj = points[j]?.[1] ?? 0
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1) + xi
    if (intersect) inside = !inside
  }
  return inside
}

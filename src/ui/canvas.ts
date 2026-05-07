import { RGBA, StyledText, fg, type OptimizedBuffer, type TextChunk } from "@opentui/core"

type Cell = {
  text: string
  fg: string
  bg?: string
}

const colorCache = new Map<string, RGBA>()

export class Canvas {
  private cells: Cell[][]

  constructor(
    readonly width: number,
    readonly height: number,
    private defaultFg = "#1f2933",
    private defaultBg = "#05070a",
  ) {
    this.cells = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => ({ text: " ", fg: defaultFg, bg: defaultBg })),
    )
  }

  write(x: number, y: number, text: string, fgColor = "#d8dee9", bgColor?: string) {
    if (y < 0 || y >= this.height) return
    for (let i = 0; i < text.length; i++) {
      const cellX = x + i
      if (cellX < 0 || cellX >= this.width) continue
      this.cells[y][cellX] = { text: text[i], fg: fgColor, bg: bgColor }
    }
  }

  center(y: number, text: string, fgColor = "#d8dee9", bgColor?: string) {
    this.write(Math.max(0, Math.floor((this.width - text.length) / 2)), y, text, fgColor, bgColor)
  }

  fill(x: number, y: number, width: number, height: number, text = " ", fgColor = this.defaultFg, bgColor = this.defaultBg) {
    for (let row = y; row < y + height; row++) {
      for (let col = x; col < x + width; col++) this.write(col, row, text[0] ?? " ", fgColor, bgColor)
    }
  }

  border(x: number, y: number, width: number, height: number, fgColor = "#d8dee9") {
    if (width < 2 || height < 2) return
    this.write(x, y, "╭" + "─".repeat(width - 2) + "╮", fgColor)
    for (let row = y + 1; row < y + height - 1; row++) {
      this.write(x, row, "│", fgColor)
      this.write(x + width - 1, row, "│", fgColor)
    }
    this.write(x, y + height - 1, "╰" + "─".repeat(width - 2) + "╯", fgColor)
  }

  toStyledText(): StyledText {
    const chunks: TextChunk[] = []
    for (let y = 0; y < this.height; y++) {
      for (const cell of this.cells[y]) chunks.push(toChunk(cell))
      if (y < this.height - 1) chunks.push(toChunk({ text: "\n", fg: this.defaultFg, bg: this.defaultBg }))
    }
    return new StyledText(chunks)
  }

  paint(buffer: OptimizedBuffer) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = this.cells[y][x]
        buffer.setCell(x, y, cell.text, rgba(cell.fg), rgba(cell.bg ?? this.defaultBg))
      }
    }
  }
}

function toChunk(cell: Cell): TextChunk {
  const chunk = fg(cell.fg)(cell.text)
  if (cell.bg) chunk.bg = RGBA.fromHex(cell.bg)
  return chunk
}

function rgba(color: string) {
  const cached = colorCache.get(color)
  if (cached) return cached
  const parsed = RGBA.fromHex(color)
  colorCache.set(color, parsed)
  return parsed
}

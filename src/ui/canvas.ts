import { StyledText, fg, type TextChunk } from "@opentui/core"

type Cell = {
  text: string
  fg: string
}

export class Canvas {
  private cells: Cell[][]

  constructor(
    readonly width: number,
    readonly height: number,
    private defaultFg = "#1f2933",
  ) {
    this.cells = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => ({ text: " ", fg: defaultFg })),
    )
  }

  write(x: number, y: number, text: string, fgColor = "#d8dee9") {
    if (y < 0 || y >= this.height) return
    for (let i = 0; i < text.length; i++) {
      const cellX = x + i
      if (cellX < 0 || cellX >= this.width) continue
      this.cells[y][cellX] = { text: text[i], fg: fgColor }
    }
  }

  center(y: number, text: string, fgColor = "#d8dee9") {
    this.write(Math.max(0, Math.floor((this.width - text.length) / 2)), y, text, fgColor)
  }

  fill(x: number, y: number, width: number, height: number, text = " ", fgColor = this.defaultFg) {
    for (let row = y; row < y + height; row++) {
      for (let col = x; col < x + width; col++) this.write(col, row, text[0] ?? " ", fgColor)
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
      for (const cell of this.cells[y]) chunks.push(fg(cell.fg)(cell.text))
      if (y < this.height - 1) chunks.push(fg(this.defaultFg)("\n"))
    }
    return new StyledText(chunks)
  }
}

export type Rgb = readonly [number, number, number]

export type DiceSkin = {
  id: string
  name: string
  base: Rgb
  light: Rgb
  mid: Rgb
  dark: Rgb
  shadow: Rgb
  ink: Rgb
}

export const diceSkins = [
  {
    id: "cobalt",
    name: "Cobalt",
    base: [72, 82, 184],
    light: [107, 148, 238],
    mid: [82, 95, 192],
    dark: [33, 31, 89],
    shadow: [21, 19, 53],
    ink: [238, 244, 255],
  },
  {
    id: "sunstone",
    name: "Sunstone",
    base: [206, 151, 59],
    light: [251, 217, 102],
    mid: [196, 128, 51],
    dark: [105, 58, 32],
    shadow: [54, 30, 29],
    ink: [54, 34, 32],
  },
  {
    id: "verdant",
    name: "Verdant",
    base: [98, 173, 116],
    light: [151, 219, 116],
    mid: [90, 151, 128],
    dark: [40, 65, 86],
    shadow: [25, 30, 64],
    ink: [233, 255, 230],
  },
  {
    id: "amethyst",
    name: "Amethyst",
    base: [139, 83, 176],
    light: [213, 91, 221],
    mid: [117, 67, 165],
    dark: [45, 49, 111],
    shadow: [28, 28, 72],
    ink: [247, 224, 255],
  },
  {
    id: "ember",
    name: "Ember",
    base: [210, 94, 49],
    light: [250, 146, 57],
    mid: [179, 75, 42],
    dark: [110, 36, 31],
    shadow: [59, 25, 30],
    ink: [255, 240, 210],
  },
  {
    id: "crimson",
    name: "Crimson",
    base: [213, 45, 79],
    light: [255, 74, 91],
    mid: [187, 45, 104],
    dark: [117, 35, 94],
    shadow: [47, 25, 71],
    ink: [255, 230, 237],
  },
] as const satisfies readonly DiceSkin[]

export type DiceSkinId = (typeof diceSkins)[number]["id"]

export const diceSkinIds = diceSkins.map((skin) => skin.id) as DiceSkinId[]
export const defaultDiceSkin: DiceSkinId = "crimson"

export function diceSkinName(id: string) {
  return diceSkins.find((skin) => skin.id === id)?.name ?? diceSkins.find((skin) => skin.id === defaultDiceSkin)?.name ?? "Crimson"
}

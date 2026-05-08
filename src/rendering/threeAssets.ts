export function shouldUseThreeRenderer() {
  return (process.env.OPENDUNGEON_RENDERER ?? process.env.DUNGEON_RENDERER) === "three"
}

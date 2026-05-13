import type { Actor } from "./dungeon.js"
import type { NpcActorId } from "./domainTypes.js"
import type { ConversationOption } from "./session.js"

export type StoryBeat = {
  floor: number
  title: string
  text: string
}

export type StoryDialog = {
  speaker: string
  text: string
  options: ConversationOption[]
}

export type StoryKnowledge = {
  id: string
  title: string
  text: string
  kind: "memory" | "note" | "npc" | "tutorial" | "hub" | "monster"
  floor?: number
}

export const localStoryBeats: StoryBeat[] = [
  {
    floor: 1,
    title: "The Waking Cell",
    text: "You wake on cold stone with no name for the place and no memory of entering it. A torn ledger says every descent starts here.",
  },
  {
    floor: 2,
    title: "The Quiet Wards",
    text: "Old healers sealed their names in the stone. Their notes imply you have recovered from this wound before.",
  },
  {
    floor: 3,
    title: "The Salted Shrine",
    text: "A shrine bell rings without a hand. The relics remember pieces of you, but each answer asks for power in return.",
  },
  {
    floor: 4,
    title: "The Broken Gaol",
    text: "The jail has no prisoners left, only keys, hungry doors, and cells labeled with versions of your forgotten name.",
  },
  {
    floor: 5,
    title: "The Root Throne",
    text: "The grave-root has worn too many endings. At the last gate it chooses one voice and claims it wrote your past.",
  },
]

export function openingStoryText() {
  return "You wake in the dungeon with no memory. The first lesson is simple: survive long enough to learn why the doors know you."
}

export function openingStoryBranches(heroName = "Mira"): ConversationOption[] {
  const name = heroName.trim() || "Mira"
  return [
    {
      id: "follow-voice",
      label: "Follow the voice",
      text: `${name} follows the first voice through the bars. The route ahead feels slightly less impossible.`,
    },
    {
      id: "read-ledger",
      label: "Read the ledger",
      text: "The ledger page lists rooms you have not seen yet and leaves a scrap in your pack.",
    },
    {
      id: "check-wound",
      label: "Check the wound",
      text: "The wound is old. You steady your breathing and recover a little focus before moving.",
    },
  ]
}

export function initialKnowledgeEntries(): StoryKnowledge[] {
  return [
    {
      id: "memory-waking-cell",
      title: "Waking Cell",
      text: "You woke in a dungeon cell with no memory, a weapon within reach, and a ledger page that already knew your handwriting.",
      kind: "memory",
      floor: 1,
    },
    {
      id: "tutorial-first-steps",
      title: "First Steps",
      text: "Movement, combat rolls, inventory, quests, and NPC choices are not just controls here. They are the way you reconstruct what happened.",
      kind: "tutorial",
      floor: 1,
    },
    {
      id: "hub-portal-room-rumor",
      title: "Portal Room Rumor",
      text: "A margin note mentions a personal room beyond the first clear: a place to build, cook, sell, repair, and prepare for another descent.",
      kind: "hub",
    },
  ]
}

export function storyBeatForFloor(floor: number) {
  return localStoryBeats.find((beat) => beat.floor === floor) ?? localStoryBeats[localStoryBeats.length - 1]
}

export function floorKnowledgeEntry(floor: number): StoryKnowledge {
  const beat = storyBeatForFloor(floor)
  return {
    id: `floor-${beat.floor}-${slug(beat.title)}`,
    title: beat.title,
    text: beat.text,
    kind: floor === 1 ? "memory" : "note",
    floor: beat.floor,
  }
}

export function skillCheckKnowledgeEntry(source: string, floor: number, success: boolean): StoryKnowledge {
  const beat = storyBeatForFloor(floor)
  const label = source === "relic" ? "Relic Note" : source === "chest" ? "Cache Note" : "Courier Note"
  return {
    id: `note-${source}-${floor}-${success ? "kept" : "damaged"}`,
    title: `${label}: ${beat.title}`,
    text: success
      ? `You preserved a note from ${beat.title}. It points toward the portal room, village workbenches, and the reason your memory keeps resetting.`
      : `You recovered a damaged note from ${beat.title}. Enough remains to prove someone has been preparing supplies between runs.`,
    kind: "note",
    floor,
  }
}

export function collectibleNoteEntry(floor: number, id: string): StoryKnowledge {
  return collectibleKnowledgeEntry("note", floor, id)
}

export type StoryCollectibleKind = "note" | "recipe" | "tool" | "deed" | "fossil" | "boss-memory" | "keepsake" | "story-relic"

export function collectibleKnowledgeEntry(kind: StoryCollectibleKind, floor: number, id: string): StoryKnowledge {
  const beat = storyBeatForFloor(floor)
  const variants: Record<StoryCollectibleKind, string[]> = {
    note: [
      `The page describes ${beat.title} as if someone mapped it from memory. A margin sketch shows a portal room, a blacksmith mark, and a garden square.`,
      `This note warns that dungeon loot should not all be spent inside the run. Some goods belong in the village economy, where trust unlocks better tools.`,
      `A torn house plan lists a quarry, kitchen, storage room, and spare beds for friends. The handwriting looks familiar, but the name is gone.`,
      `The ink says death is not the end of the project. Food, upgraded gear, and village help can make the next descent less blind.`,
    ],
    recipe: [
      `A stained recipe says dungeon moss and salt can become travel rations. The kitchen will matter once the portal room is safe.`,
      `This cooking card describes a focus broth that should carry into the next descent if prepared before leaving the village.`,
    ],
    tool: [
      `A broken tool part is stamped with a blacksmith mark. Enough pieces could upgrade weapons without waiting for dungeon luck.`,
      `This quarry wedge looks useless in a fight, but perfect for opening a hub station that feeds long-term upgrades.`,
    ],
    deed: [
      `A village deed names a house beside the portal room. More houses could make co-op feel like shared settlement work, not just shared combat.`,
      `This property scrap mentions farm plots, a shop counter, and trust ledgers. It belongs outside the dungeon.`,
    ],
    fossil: [
      `A fossilized root remembers an older dungeon under ${beat.title}. The quarry can turn finds like this into building stone.`,
      `The fossil is older than the rooms around it. A village collector would pay well, or trade trust for it.`,
    ],
    "boss-memory": [
      `A boss memory shows the Root Throne practicing endings where the village never opens. Keeping it may change a later ending.`,
      `The memory is a shard of a failed clear. It hints that the end boss can be argued with, not only killed.`,
    ],
    keepsake: [
      `A small keepsake carries an NPC's initials. Returning gifts like this should raise trust faster than gold alone.`,
      `The keepsake survived several resets. It belongs in the village ledger, beside names you do not remember yet.`,
    ],
    "story-relic": [
      `This story relic is written in admin-like margins: endings can be replaced, motives can be revised, but consequences must stay readable.`,
      `The relic describes a future dev tool that lets an AI Admin remix the dungeon's script without deleting local saves.`,
    ],
  }
  const options = variants[kind]
  const index = Math.abs(id.split("").reduce((total, char) => total + char.charCodeAt(0), floor)) % options.length
  const title =
    kind === "recipe"
      ? "Recovered Recipe"
      : kind === "tool"
        ? "Recovered Tool Part"
        : kind === "deed"
          ? "Village Deed"
          : kind === "fossil"
            ? "Recovered Fossil"
            : kind === "boss-memory"
              ? "Boss Memory"
              : kind === "keepsake"
                ? "Friendship Keepsake"
                : kind === "story-relic"
                  ? "AI Admin Story Relic"
                  : "Recovered Note"
  return {
    id: `collectible-${kind}-${id}`,
    title: `${title}: ${beat.title}`,
    text: options[index],
    kind: kind === "deed" || kind === "fossil" || kind === "keepsake" || kind === "story-relic" ? "hub" : "note",
    floor,
  }
}

export function localNpcStoryDialog(kind: NpcActorId, floor: number): StoryDialog {
  const beat = storyBeatForFloor(floor)
  const base = npcStoryBase[kind]
  return {
    speaker: base.speaker,
    text: `${base.text} ${beat.title}: ${base.floorHook(floor)}`,
    options: base.options(floor, beat),
  }
}

export function bossStoryLine(actor: Actor, floor: number, phase = actor.phase ?? 1) {
  if (actor.kind === "grave-root-boss") {
    return phase >= 2
      ? "The Root Throne enters phase 2 and splits open. It offers an ending where every saved run belongs to it."
      : "The grave-root boss rises from every failed descent and asks whose story survives this seed."
  }
  if (actor.kind === "necromancer") return phase >= 2 ? `The necromancer enters phase 2 and rehearses the final ending in a smaller room.` : `The necromancer on floor ${floor} rehearses the final ending in a smaller room.`
  return ""
}

export function victoryStoryText() {
  return "The final gate opens. The local story resolves: the dungeon keeps the seed, but releases the crawler and the first clear unlocks the road home."
}

const npcStoryBase: Record<NpcActorId, { speaker: string; text: string; floorHook: (floor: number) => string; options: (floor: number, beat: StoryBeat) => ConversationOption[] }> = {
  cartographer: {
    speaker: "Cartographer Venn",
    text: "You asked me this before, though you never remember the answer.",
    floorHook: (floor) => `I can mark the route to floor ${Math.min(5, floor + 1)} and the way back to the portal room, if it still opens for you.`,
    options: (floor, beat) => [
      { id: "map", label: "Mark map", text: `Venn marks ${beat.title}. Your next objective feels less like noise.` },
      { id: "route", label: "Ask route", text: `The route bends around floor ${floor}'s loudest room, then cuts back toward the stairs.` },
      { id: "rumor", label: "Rumor", text: "The stairs do not move, but the rooms around them lie about distance. Trust doors you opened yourself." },
    ],
  },
  "wound-surgeon": {
    speaker: "Wound Surgeon Iri",
    text: "Keep pressure on the bright cuts. The old ones are where memory leaks out.",
    floorHook: (floor) => `The deeper wound is floor ${floor}'s habit of making panic look efficient.`,
    options: (_floor, beat) => [
      { id: "heal", label: "Patch wounds", text: `Iri stitches a mark shaped like ${beat.title}. Health returns.` },
      { id: "advice", label: "Ask advice", text: "Guard before the big swing. Survival is a rhythm, not a prayer." },
      { id: "rumor", label: "Rumor", text: "If a check feels wrong, step back before the roll. Pride kills faster than poison." },
    ],
  },
  "shrine-keeper": {
    speaker: "Shrine Keeper Sol",
    text: "Every relic asks for a stat because memory alone is too easy to steal.",
    floorHook: (floor) => `On floor ${floor}, the bell likes focus more than gold.`,
    options: (_floor, beat) => [
      { id: "blessing", label: "Take blessing", text: `Sol rings the quiet bell for ${beat.title}. Focus gathers behind your eyes.` },
      { id: "lore", label: "Ask relic lore", text: "Relics answer stats, not wishes. Read the demand before you roll." },
      { id: "rumor", label: "Rumor", text: "The dungeon records choices more faithfully than memories. Your Book is less fragile than your head." },
    ],
  },
  jailer: {
    speaker: "Jailer Maro",
    text: "Mimics wake slowly. Prisoners wake slower.",
    floorHook: (floor) => `The old cells below floor ${floor} still lock from the inside, and one cell has your marks on the wall.`,
    options: (_floor, beat) => [
      { id: "warning", label: "Ask warning", text: `Maro scratches mimic tells beside ${beat.title}. False wood hates patient hands.` },
      { id: "key", label: "Request key", text: "A bent lockpick changes hands. It remembers one door too many." },
      { id: "rumor", label: "Rumor", text: "A locked room is not always treasure. Sometimes it is a fight waiting for you to spend focus first." },
    ],
  },
  merchant: {
    speaker: "Ash Merchant Pell",
    text: "Twelve gold buys a salve. Better goods wait in the village, if you live to open it.",
    floorHook: (floor) => `Past floor ${floor}, debt starts walking behind you.`,
    options: (_floor, beat) => [
      { id: "trade", label: "Trade", text: `Pell opens the case marked ${beat.title}. The salve is ugly and useful.` },
      { id: "rumor", label: "Rumor", text: "The room that pays best usually sounds empty twice." },
      { id: "advice", label: "Ask advice", text: "Buy only what keeps the run moving. Greed is just another heavy item." },
    ],
  },
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

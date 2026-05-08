import { exportSave, importSave, listSaves, renameSave, validateSave } from "./saveStore.js"

export async function handleSaveCommand(args: string[]): Promise<number | null> {
  if (args[0] !== "saves") return null
  const command = args[1]

  try {
    if (command === "list") {
      for (const save of listSaves()) {
        console.log(`${save.id}\t${save.slot}\t${save.savedAt}\t${save.name}`)
      }
      return 0
    }

    if (command === "rename") {
      const id = args[2]
      const name = args.slice(3).join(" ")
      if (!id || !name) throw new Error("Usage: opendungeon saves rename <id> <name>")
      const save = renameSave(id, name)
      console.log(`Renamed ${save.id}: ${save.name}`)
      return 0
    }

    if (command === "export") {
      const id = args[2]
      const path = args[3]
      if (!id || !path) throw new Error("Usage: opendungeon saves export <id> <path>")
      const save = exportSave(id, path)
      console.log(`Exported ${save.id} to ${path}`)
      return 0
    }

    if (command === "import") {
      const path = args[2]
      const name = args.slice(3).join(" ")
      if (!path) throw new Error("Usage: opendungeon saves import <path> [name]")
      const save = importSave(path, name || "Imported save")
      console.log(`Imported ${save.id}: ${save.name}`)
      return 0
    }

    if (command === "check") {
      const id = args[2]
      if (!id) throw new Error("Usage: opendungeon saves check <id>")
      const errors = validateSave(id)
      if (errors.length) {
        console.error(errors.join("\n"))
        return 1
      }
      console.log(`Save ${id} is valid.`)
      return 0
    }

    console.error(saveCommandHelp())
    return 1
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Save command failed.")
    return 1
  }
}

export function saveCommandHelp() {
  return `Save commands:
  opendungeon saves list
  opendungeon saves rename <id> <name>
  opendungeon saves export <id> <path>
  opendungeon saves import <path> [name]
  opendungeon saves check <id>`
}

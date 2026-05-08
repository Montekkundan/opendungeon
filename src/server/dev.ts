import app from "./api.js"

const port = Number(process.env.PORT || process.env.OPENDUNGEON_API_PORT || 3740)

Bun.serve({
  port,
  fetch: app.fetch,
})

console.log(`opendungeon API listening on http://localhost:${port}`)

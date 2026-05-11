import { spawn } from "node:child_process"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { authSessionPath, saveAuthSession, type AuthSession } from "./authStore.js"
import { createSupabaseBrowserlessClient, sessionFromSupabase, usernameToEmail } from "./supabase.js"

type CommandResult = number | null
type OAuthCallbackPayload = Record<string, unknown>

export async function handleAuthCommand(args: string[]): Promise<CommandResult> {
  if (args[0] === "login") return handlePasswordLogin(args)
  if (args[0] === "--login") return handleProviderLogin(args)
  return null
}

export function authHelpText() {
  return `Auth:
  opendungeon login <username>  Prompt for a password and store a Supabase session
  opendungeon --login github    Open Supabase GitHub OAuth

Auth environment:
  OPENDUNGEON_AUTH_DIR          Override local auth session directory
  OPENDUNGEON_SUPABASE_URL      Supabase project URL
  OPENDUNGEON_SUPABASE_PUBLISHABLE_KEY Supabase publishable/anon key
  OPENDUNGEON_AUTH_EMAIL_DOMAIN Username-to-email domain for password login
  OPENDUNGEON_AUTH_TOKEN        Use this token for password-login smoke tests
  OPENDUNGEON_SUPABASE_ACCESS_TOKEN Use this token for GitHub-login smoke tests
  OPENDUNGEON_PASSWORD          Non-TTY password source for password login
  OPENDUNGEON_AUTH_REDIRECT_URL OAuth callback URL for GitHub login
  OPENDUNGEON_AUTH_CALLBACK_TIMEOUT_MS Local OAuth callback wait timeout

Local test account:
  username: test
  password: opendungeon
`
}

async function handlePasswordLogin(args: string[]) {
  const username = cleanUsername(args[1])
  if (!username || args.length !== 2) {
    console.error("Usage: opendungeon login <username>")
    return 1
  }

  try {
    const password = await readPassword("Password: ")
    if (!password) throw new Error("Password is required.")
    const session = await authenticatePassword(username, password)
    saveAuthSession(session)
    console.log(`Logged in as ${session.username}. Session saved to ${authSessionPath()}.`)
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Login failed.")
    return 1
  }
}

async function handleProviderLogin(args: string[]) {
  if (args[1] !== "github" || args.length !== 2) {
    console.error("Usage: opendungeon --login github")
    return 1
  }

  try {
    const session = await startGithubOAuth()
    if (session) {
      saveAuthSession(session)
      console.log(`Logged in with GitHub as ${session.username}. Session saved to ${authSessionPath()}.`)
    }
    return session ? 0 : 2
  } catch (error) {
    console.error(error instanceof Error ? error.message : "GitHub login failed.")
    return 1
  }
}

async function authenticatePassword(username: string, password: string): Promise<AuthSession> {
  if (isLocalTestUser(username, password)) return createSession("password", "test", "local-test-user-session")

  const envToken = tokenFromEnv("OPENDUNGEON_AUTH_TOKEN")
  if (envToken) return createSession("password", username, envToken)

  const supabase = createSupabaseBrowserlessClient()
  if (!supabase) throw new Error("Password login requires Supabase env vars or OPENDUNGEON_AUTH_TOKEN.")
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  })
  if (error) throw new Error(`Supabase password login failed: ${error.message}`)
  if (!data.session) throw new Error("Supabase password login did not return a session.")
  return sessionFromSupabase(data.session, username)
}

async function startGithubOAuth(): Promise<AuthSession | null> {
  const envToken = tokenFromEnv("OPENDUNGEON_SUPABASE_ACCESS_TOKEN")
  if (envToken) return createSession("github", cleanUsername(process.env.OPENDUNGEON_GITHUB_USERNAME) || "github-user", envToken)

  const supabase = createSupabaseBrowserlessClient()
  if (!supabase) throw new Error("GitHub login requires Supabase env vars.")
  const redirectTo = process.env.OPENDUNGEON_AUTH_REDIRECT_URL || "http://localhost:3738/auth/callback"
  const callback = startOAuthCallbackCapture(redirectTo)
  let response: Awaited<ReturnType<typeof supabase.auth.signInWithOAuth>>
  try {
    response = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    })
  } catch (error) {
    await callback.close()
    throw error
  }

  const { data, error } = response
  if (error) {
    await callback.close()
    throw new Error(`Supabase GitHub login failed: ${error.message}`)
  }
  if (!data.url) {
    await callback.close()
    throw new Error("Supabase did not return a GitHub OAuth URL.")
  }
  console.log(`Open this GitHub login URL:\n${data.url}`)
  console.log(`Waiting for OAuth callback on ${redirectTo}.`)
  await openBrowser(data.url)
  return callback.session
}

function createSession(provider: AuthSession["provider"], username: string, token: string, expiresAt?: string, refreshToken?: string): AuthSession {
  return {
    provider,
    username,
    accessToken: token,
    refreshToken,
    tokenType: "bearer",
    createdAt: new Date().toISOString(),
    expiresAt,
  }
}

async function readPassword(prompt: string) {
  const envPassword = process.env.OPENDUNGEON_PASSWORD
  if (envPassword !== undefined) return envPassword

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    const text = await readStdinText()
    return text.replace(/\r?\n$/, "")
  }

  return readHiddenLine(prompt)
}

async function readStdinText() {
  let text = ""
  for await (const chunk of process.stdin) text += String(chunk)
  return text
}

function readHiddenLine(prompt: string) {
  return new Promise<string>((resolve, reject) => {
    const stdin = process.stdin as typeof process.stdin & { isRaw?: boolean; setRawMode?: (mode: boolean) => void }
    const wasRaw = Boolean(stdin.isRaw)
    let value = ""

    function finish(error?: Error) {
      stdin.off("data", onData)
      stdin.setRawMode?.(wasRaw)
      stdin.pause()
      process.stdout.write("\n")
      if (error) reject(error)
      else resolve(value)
    }

    function onData(chunk: Buffer) {
      const input = chunk.toString("utf8")
      for (const char of input) {
        if (char === "\u0003") {
          finish(new Error("Login cancelled."))
          return
        }
        if (char === "\r" || char === "\n") {
          finish()
          return
        }
        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1)
          continue
        }
        value += char
      }
    }

    process.stdout.write(prompt)
    stdin.setRawMode?.(true)
    stdin.resume()
    stdin.on("data", onData)
  })
}

function tokenFromEnv(name: string) {
  const value = process.env[name]?.trim()
  return value || null
}

function cleanUsername(value: unknown) {
  if (typeof value !== "string") return ""
  return value.replace(/[^\w .-]/g, "").trim().slice(0, 64)
}

function isLocalTestUser(username: string, password: string) {
  return username.toLowerCase() === "test" && password === (process.env.OPENDUNGEON_TEST_PASSWORD || "opendungeon")
}

function startOAuthCallbackCapture(redirectTo: string) {
  const target = callbackTarget(redirectTo)
  let settled = false
  let timeout: ReturnType<typeof setTimeout> | null = null
  let resolveSession: (session: AuthSession) => void = () => {}
  let rejectSession: (error: Error) => void = () => {}

  const session = new Promise<AuthSession>((resolve, reject) => {
    resolveSession = resolve
    rejectSession = reject
  })

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${target.hostname}:${target.port}`}`)
    if (request.method === "GET" && url.pathname === target.callbackPath) {
      sendText(response, 200, oauthCallbackHtml(target.sessionPath), "text/html; charset=utf-8")
      return
    }

    if (request.method === "POST" && url.pathname === target.sessionPath) {
      try {
        const payload = (await readJsonBody(request)) as OAuthCallbackPayload
        const captured = sessionFromOAuthCallbackPayload(payload)
        settle(null, captured)
        sendText(response, 200, "Captured. You can close this tab.")
      } catch (error) {
        const message = error instanceof Error ? error.message : "OAuth callback capture failed."
        settle(new Error(message))
        sendText(response, 400, message)
      }
      return
    }

    sendText(response, 404, "Not found")
  })
  server.on("error", (error) => settle(error instanceof Error ? error : new Error(String(error))))
  server.listen(target.port, target.hostname)

  timeout = setTimeout(() => settle(new Error(`Timed out waiting for OAuth callback after ${oauthCallbackTimeoutMs()}ms.`)), oauthCallbackTimeoutMs())

  function settle(error: Error | null, captured?: AuthSession) {
    if (settled) return
    settled = true
    if (timeout) clearTimeout(timeout)
    server.close()
    if (error) rejectSession(error)
    else resolveSession(captured!)
  }

  return {
    session,
    close: async () => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      await closeServer(server)
    },
  }
}

export function sessionFromOAuthCallbackPayload(payload: OAuthCallbackPayload, now = new Date()): AuthSession {
  const error = stringPayload(payload.error_description) || stringPayload(payload.error)
  if (error) throw new Error(`OAuth callback returned an error: ${error}`)

  const accessToken = stringPayload(payload.access_token)
  if (!accessToken) throw new Error("OAuth callback did not include an access token.")

  const tokenPayload = decodeJwtPayload(accessToken) ?? decodeJwtPayload(stringPayload(payload.id_token))
  const email = stringPayload(payload.email) || stringPayload(tokenPayload?.email)
  const username =
    cleanUsername(process.env.OPENDUNGEON_GITHUB_USERNAME) ||
    cleanUsername(stringPayload((tokenPayload?.user_metadata as Record<string, unknown> | undefined)?.user_name)) ||
    cleanUsername(stringPayload((tokenPayload?.user_metadata as Record<string, unknown> | undefined)?.preferred_username)) ||
    cleanUsername(stringPayload((tokenPayload?.user_metadata as Record<string, unknown> | undefined)?.name)) ||
    cleanUsername(email?.split("@")[0]) ||
    "github-user"

  return {
    provider: "github",
    username,
    accessToken,
    refreshToken: stringPayload(payload.refresh_token),
    tokenType: "bearer",
    createdAt: now.toISOString(),
    expiresAt: callbackExpiresAt(payload, now),
    userId: stringPayload(payload.user_id) || stringPayload(tokenPayload?.sub),
    email,
  }
}

export function oauthCallbackHtml(sessionPath: string) {
  return `<!doctype html>
<meta charset="utf-8">
<title>OpenDungeon login</title>
<body style="font-family: system-ui, sans-serif; background: #101014; color: #f4efe5;">
<h1>OpenDungeon login</h1>
<p id="status">Finishing GitHub login...</p>
<script>
const params = new URLSearchParams(location.hash.slice(1));
for (const [key, value] of new URLSearchParams(location.search)) params.set(key, value);
fetch(${JSON.stringify(sessionPath)}, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(Object.fromEntries(params.entries()))
}).then(async (response) => {
  document.getElementById("status").textContent = response.ok ? "Login captured. You can close this tab." : await response.text();
}).catch((error) => {
  document.getElementById("status").textContent = error instanceof Error ? error.message : "Login capture failed.";
});
</script>`
}

function callbackTarget(redirectTo: string) {
  const url = new URL(redirectTo)
  const hostname = url.hostname === "[::1]" ? "::1" : url.hostname
  if (url.protocol !== "http:") throw new Error("GitHub OAuth callback capture requires an http localhost redirect URL.")
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) throw new Error("GitHub OAuth callback capture only listens on localhost redirect URLs.")
  const port = Number(url.port)
  if (!Number.isInteger(port) || port <= 0) throw new Error("GitHub OAuth callback URL must include an explicit localhost port.")
  const callbackPath = url.pathname || "/auth/callback"
  return {
    hostname,
    port,
    callbackPath,
    sessionPath: `${callbackPath.replace(/\/$/, "")}/session`,
  }
}

function callbackExpiresAt(payload: OAuthCallbackPayload, now: Date) {
  const explicit = stringPayload(payload.expires_at)
  if (explicit) {
    const seconds = Number(explicit)
    if (Number.isFinite(seconds)) return new Date(seconds * 1000).toISOString()
    if (!Number.isNaN(Date.parse(explicit))) return explicit
  }

  const expiresIn = Number(stringPayload(payload.expires_in))
  if (Number.isFinite(expiresIn) && expiresIn > 0) return new Date(now.getTime() + expiresIn * 1000).toISOString()
  return undefined
}

function decodeJwtPayload(token: string | undefined) {
  if (!token) return null
  const [, payload] = token.split(".")
  if (!payload) return null
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>
  } catch {
    return null
  }
}

function stringPayload(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function oauthCallbackTimeoutMs() {
  const parsed = Number(process.env.OPENDUNGEON_AUTH_CALLBACK_TIMEOUT_MS)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120000
}

async function openBrowser(url: string) {
  if (process.env.OPENDUNGEON_OPEN_BROWSER === "0") return
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open"
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url]
  const child = spawn(command, args, { stdio: "ignore", detached: true })
  child.unref()
}

function sendText(response: ServerResponse, status: number, body: string, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, { "content-type": contentType })
  response.end(body)
}

function readJsonBody(request: IncomingMessage) {
  return new Promise<unknown>((resolve, reject) => {
    let body = ""
    request.setEncoding("utf8")
    request.on("data", (chunk) => {
      body += chunk
      if (body.length > 64_000) {
        request.destroy()
        reject(new Error("OAuth callback payload is too large."))
      }
    })
    request.on("error", reject)
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"))
      } catch {
        reject(new Error("OAuth callback payload was not valid JSON."))
      }
    })
  })
}

function closeServer(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

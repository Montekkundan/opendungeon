import { authSessionPath, saveAuthSession, type AuthSession } from "./authStore.js"
import { createSupabaseBrowserlessClient, sessionFromSupabase, usernameToEmail } from "./supabase.js"

type CommandResult = number | null

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
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  })
  if (error) throw new Error(`Supabase GitHub login failed: ${error.message}`)
  if (!data.url) throw new Error("Supabase did not return a GitHub OAuth URL.")
  console.log(`Open this GitHub login URL:\n${data.url}`)
  await openBrowser(data.url)
  console.log("OAuth callback capture is not automatic yet. After the browser flow, paste a Supabase access token with OPENDUNGEON_SUPABASE_ACCESS_TOKEN for CLI smoke tests.")
  return null
}

function createSession(provider: AuthSession["provider"], username: string, token: string, expiresAt?: string): AuthSession {
  return {
    provider,
    username,
    accessToken: token,
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

async function openBrowser(url: string) {
  if (process.env.OPENDUNGEON_OPEN_BROWSER === "0") return
  if (process.platform !== "darwin") return
  const child = Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" })
  await child.exited
}

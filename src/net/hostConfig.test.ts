import { describe, expect, test } from "bun:test"
import {
  advertisedLobbyUrls,
  hostListenErrorMessage,
  lobbyEnvCommand,
  lobbyInviteErrorMessage,
  lobbyInviteMismatchNotice,
  lobbyJoinCommand,
  lobbyJoinUsageMessage,
  normalizeLobbyBaseUrl,
  parseLobbyHostArgs,
  preferredAdvertisedLobbyUrl,
  requestLobbyUrl,
} from "./hostConfig.js"

describe("lobby host config", () => {
  test("defaults to a server-ready bind host and port", () => {
    const options = parseLobbyHostArgs([], {})

    expect(options.bindHost).toBe("0.0.0.0")
    expect(options.port).toBe(3737)
    expect(options.mode).toBe("coop")
  })

  test("accepts LAN and public server advertise options", () => {
    const options = parseLobbyHostArgs(["--host", "0.0.0.0", "--public-url", "dungeon.example.com:3737", "--mode", "coop", "--seed", "42"], {})

    expect(options.bindHost).toBe("0.0.0.0")
    expect(options.publicUrl).toBe("http://dungeon.example.com:3737")
    expect(options.mode).toBe("coop")
    expect(options.seed).toBe(42)
  })

  test("prefers explicit public URL for invite payloads behind proxies", () => {
    const options = parseLobbyHostArgs(["--public-url", "https://play.example.com"], {})

    expect(requestLobbyUrl("127.0.0.1:3737", options, "http")).toBe("https://play.example.com")
  })

  test("uses request host when no public URL is configured", () => {
    const options = parseLobbyHostArgs(["--port", "4444"], {})

    expect(requestLobbyUrl("192.168.1.20:4444", options)).toBe("http://192.168.1.20:4444")
    expect(requestLobbyUrl("play.example.com", options, "https")).toBe("https://play.example.com")
  })

  test("prints localhost and LAN addresses for local network sharing", () => {
    const options = parseLobbyHostArgs(["--port", "3737"], {})
    const urls = advertisedLobbyUrls(options, {
      lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true, cidr: "127.0.0.1/8", mac: "", netmask: "255.0.0.0" }],
      en0: [{ address: "192.168.1.25", family: "IPv4", internal: false, cidr: "192.168.1.25/24", mac: "", netmask: "255.255.255.0" }],
    })

    expect(urls).toEqual(["http://localhost:3737", "http://192.168.1.25:3737"])
    expect(preferredAdvertisedLobbyUrl(options, urls)).toBe("http://192.168.1.25:3737")
  })

  test("does not advertise unreachable LAN addresses for loopback binds", () => {
    const options = parseLobbyHostArgs(["--host", "127.0.0.1", "--port", "3737"], {})
    const urls = advertisedLobbyUrls(options, {
      lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true, cidr: "127.0.0.1/8", mac: "", netmask: "255.0.0.0" }],
      en0: [{ address: "192.168.1.25", family: "IPv4", internal: false, cidr: "192.168.1.25/24", mac: "", netmask: "255.255.255.0" }],
    })

    expect(urls).toEqual(["http://127.0.0.1:3737", "http://localhost:3737"])
    expect(preferredAdvertisedLobbyUrl(options, urls)).toBe("http://127.0.0.1:3737")
  })

  test("advertises only the bound address for explicit LAN binds", () => {
    const options = parseLobbyHostArgs(["--host", "192.168.1.25", "--port", "3737"], {})
    const urls = advertisedLobbyUrls(options, {
      en0: [{ address: "192.168.1.25", family: "IPv4", internal: false, cidr: "192.168.1.25/24", mac: "", netmask: "255.255.255.0" }],
      en1: [{ address: "10.0.1.33", family: "IPv4", internal: false, cidr: "10.0.1.33/24", mac: "", netmask: "255.255.255.0" }],
    })

    expect(urls).toEqual(["http://192.168.1.25:3737"])
    expect(preferredAdvertisedLobbyUrl(options, urls)).toBe("http://192.168.1.25:3737")
  })

  test("normalizes join URLs and keeps a legacy env command", () => {
    expect(normalizeLobbyBaseUrl("play.example.com:3737/invite?x=1")).toBe("http://play.example.com:3737")
    expect(lobbyJoinCommand("http://play.example.com:3737")).toBe("opendungeon join http://play.example.com:3737")
    expect(lobbyEnvCommand("http://play.example.com:3737", { mode: "coop", seed: 123 })).toContain("OPENDUNGEON_LOBBY_URL=http://play.example.com:3737")
  })

  test("explains bad lobby URLs and unreachable hosts", () => {
    expect(lobbyJoinUsageMessage("not a url")).toContain("Could not parse lobby URL")
    expect(lobbyInviteErrorMessage("http://127.0.0.1:3737", { code: "ECONNREFUSED" })).toContain("No host is listening")
    expect(lobbyInviteErrorMessage("http://127.0.0.1:3737", { name: "AbortError" })).toContain("timed out")
    expect(lobbyInviteErrorMessage("http://127.0.0.1:3737", new Error("HTTP 404"))).toContain("opendungeon-host URL")
  })

  test("explains lobby seed and mode overrides", () => {
    expect(lobbyInviteMismatchNotice("coop", 123, { OPENDUNGEON_MODE: "race", OPENDUNGEON_SEED: "999" })).toBe(" Lobby mode coop overrides race and seed 123 overrides 999.")
    expect(lobbyInviteMismatchNotice("coop", 123, { OPENDUNGEON_MODE: "coop", OPENDUNGEON_SEED: "123" })).toBe("")
  })

  test("prints friendly host listen errors", () => {
    const options = parseLobbyHostArgs(["--host", "127.0.0.1", "--port", "3737"], {})

    expect(hostListenErrorMessage({ code: "EADDRINUSE" }, options)).toContain("already in use")
    expect(hostListenErrorMessage({ code: "EADDRNOTAVAIL" }, options)).toContain("not available")
    expect(hostListenErrorMessage({ code: "EACCES" }, options)).toContain("above 1024")
  })
})

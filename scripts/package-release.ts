import { createHash } from "node:crypto"
import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"

type Target = {
  id: string
  bunTarget: string
  archive: string
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { version: string }
const version = packageJson.version
const releaseDir = "dist/release"
const stageRoot = "dist/stage"
const allTargets: Target[] = [
  { id: "darwin-arm64", bunTarget: "bun-darwin-arm64", archive: `opendungeon-v${version}-darwin-arm64.tar.gz` },
  { id: "darwin-x64", bunTarget: "bun-darwin-x64", archive: `opendungeon-v${version}-darwin-x64.tar.gz` },
  { id: "linux-x64", bunTarget: "bun-linux-x64-baseline", archive: `opendungeon-v${version}-linux-x64.tar.gz` },
  { id: "linux-arm64", bunTarget: "bun-linux-arm64", archive: `opendungeon-v${version}-linux-arm64.tar.gz` },
]
const targets = selectedTargets()

rmSync(releaseDir, { force: true, recursive: true })
rmSync(stageRoot, { force: true, recursive: true })
mkdirSync(releaseDir, { recursive: true })
mkdirSync(stageRoot, { recursive: true })

const checksums = new Map<string, string>()

for (const target of targets) {
  const stage = join(stageRoot, target.id)
  const binDir = join(stage, "bin")
  mkdirSync(binDir, { recursive: true })

  run(["bun", "build", "--compile", `--target=${target.bunTarget}`, "--outfile", join(binDir, "opendungeon"), "src/main.ts"])
  run(["bun", "build", "--compile", `--target=${target.bunTarget}`, "--outfile", join(binDir, "opendungeon-host"), "src/net/host.ts"])
  chmodSync(join(binDir, "opendungeon"), 0o755)
  chmodSync(join(binDir, "opendungeon-host"), 0o755)

  copyReleasePayload(stage)
  archive(stage, join(releaseDir, target.archive))
  checksums.set(target.archive, sha256(join(releaseDir, target.archive)))
}

writeFileSync(join(releaseDir, "SHA256SUMS"), [...checksums].map(([file, hash]) => `${hash}  ${file}`).join("\n") + "\n")
if (allTargets.every((target) => checksums.has(target.archive))) {
  writeFileSync(join(releaseDir, "opendungeon.rb"), renderHomebrewFormula(checksums))
  writeFileSync(join(releaseDir, "PKGBUILD"), renderPkgbuild(checksums))
}

function copyReleasePayload(stage: string) {
  cpSync("assets", join(stage, "assets"), { recursive: true })
  cpSync("README.md", join(stage, "README.md"))
  cpSync("LICENSE", join(stage, "LICENSE"))
  writeFileSync(join(stage, "VERSION"), `${version}\n`)
}

function archive(stage: string, out: string) {
  run(["tar", "-czf", out, "-C", stage, "."])
}

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function run(command: string[]) {
  const result = Bun.spawnSync(command, { stdout: "inherit", stderr: "inherit" })
  if (!result.success) throw new Error(`${command.join(" ")} failed with exit code ${result.exitCode}`)
}

function renderHomebrewFormula(checksums: Map<string, string>) {
  const base = "https://github.com/Montekkundan/opendungeon/releases/download"
  return `class Opendungeon < Formula
  desc "Terminal roguelike RPG built with OpenTUI"
  homepage "https://github.com/Montekkundan/opendungeon"
  version "${version}"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "${base}/v${version}/opendungeon-v${version}-darwin-arm64.tar.gz"
      sha256 "${required(checksums, `opendungeon-v${version}-darwin-arm64.tar.gz`)}"
    else
      url "${base}/v${version}/opendungeon-v${version}-darwin-x64.tar.gz"
      sha256 "${required(checksums, `opendungeon-v${version}-darwin-x64.tar.gz`)}"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "${base}/v${version}/opendungeon-v${version}-linux-arm64.tar.gz"
      sha256 "${required(checksums, `opendungeon-v${version}-linux-arm64.tar.gz`)}"
    else
      url "${base}/v${version}/opendungeon-v${version}-linux-x64.tar.gz"
      sha256 "${required(checksums, `opendungeon-v${version}-linux-x64.tar.gz`)}"
    end
  end

  def install
    bin.install "bin/opendungeon", "bin/opendungeon-host"
    pkgshare.install "assets"
    doc.install "README.md"
    prefix.install "LICENSE"
  end

  test do
    assert_match "opendungeon", shell_output("#{bin}/opendungeon --help 2>&1", 0)
  end
end
`
}

function renderPkgbuild(checksums: Map<string, string>) {
  return `# Maintainer: Montek Kkundan <montekkundan@gmail.com>
pkgname=opendungeon-bin
pkgver=${version}
pkgrel=1
pkgdesc="Terminal roguelike RPG built with OpenTUI"
arch=("x86_64" "aarch64")
url="https://github.com/Montekkundan/opendungeon"
license=("MIT")
provides=("opendungeon")
conflicts=("opendungeon")

source_x86_64=("opendungeon-v$pkgver-linux-x64.tar.gz::https://github.com/Montekkundan/opendungeon/releases/download/v$pkgver/opendungeon-v$pkgver-linux-x64.tar.gz")
source_aarch64=("opendungeon-v$pkgver-linux-arm64.tar.gz::https://github.com/Montekkundan/opendungeon/releases/download/v$pkgver/opendungeon-v$pkgver-linux-arm64.tar.gz")
sha256sums_x86_64=("${required(checksums, `opendungeon-v${version}-linux-x64.tar.gz`)}")
sha256sums_aarch64=("${required(checksums, `opendungeon-v${version}-linux-arm64.tar.gz`)}")

package() {
  install -Dm755 "$srcdir/bin/opendungeon" "$pkgdir/usr/bin/opendungeon"
  install -Dm755 "$srcdir/bin/opendungeon-host" "$pkgdir/usr/bin/opendungeon-host"
  install -Dm644 "$srcdir/LICENSE" "$pkgdir/usr/share/licenses/opendungeon/LICENSE"
  mkdir -p "$pkgdir/usr/share/opendungeon"
  cp -R "$srcdir/assets" "$pkgdir/usr/share/opendungeon/assets"
}
`
}

function required(checksums: Map<string, string>, file: string) {
  const value = checksums.get(file)
  if (!value) throw new Error(`missing checksum for ${file}`)
  return value
}

function selectedTargets() {
  const requested = process.env.OPENDUNGEON_RELEASE_TARGETS ?? "native"
  if (requested === "all") return allTargets
  if (requested === "native") {
    const native = nativeTargetId()
    return allTargets.filter((target) => target.id === native)
  }

  const ids = new Set(requested.split(",").map((id) => id.trim()).filter(Boolean))
  const targets = allTargets.filter((target) => ids.has(target.id))
  if (targets.length !== ids.size) {
    const available = allTargets.map((target) => target.id).join(", ")
    throw new Error(`Unknown release target in ${requested}. Available: ${available}`)
  }
  return targets
}

function nativeTargetId() {
  const os = process.platform
  const arch = process.arch
  if (os === "darwin" && arch === "arm64") return "darwin-arm64"
  if (os === "darwin" && arch === "x64") return "darwin-x64"
  if (os === "linux" && arch === "arm64") return "linux-arm64"
  if (os === "linux" && arch === "x64") return "linux-x64"
  throw new Error(`Unsupported native release target: ${os}-${arch}`)
}

console.log(`Built ${targets.length} release archives in ${releaseDir}`)
for (const [file, hash] of checksums) console.log(`${hash}  ${basename(file)}`)

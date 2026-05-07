import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { version: string }
const version = packageJson.version
const releaseDir = "dist/release"
const checksums = readChecksums(join(releaseDir, "SHA256SUMS"))

writeFileSync(join(releaseDir, "opendungeon.rb"), renderHomebrewFormula(checksums))
writeFileSync(join(releaseDir, "PKGBUILD"), renderPkgbuild(checksums))

function readChecksums(path: string) {
  const map = new Map<string, string>()
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/)
    if (match) map.set(match[2].trim(), match[1])
  }
  return map
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

console.log(`Wrote Homebrew formula and AUR PKGBUILD to ${releaseDir}`)

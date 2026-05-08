import "./index.css"
import { Meta, Title } from "@solidjs/meta"
import { A } from "@solidjs/router"
import { Header } from "~/component/header"
import { Footer } from "~/component/footer"
import { CopyStatus } from "~/component/copy-status"
import { LocaleLinks } from "~/component/locale-links"
import { useI18n } from "~/context/i18n"
import { useLanguage } from "~/context/language"

function Command(props: { value: string }) {
  const handleCopyClick = (event: Event) => {
    const button = event.currentTarget as HTMLButtonElement
    void navigator.clipboard.writeText(props.value)
    button.setAttribute("data-copied", "")
    setTimeout(() => button.removeAttribute("data-copied"), 1500)
  }

  return (
    <button data-copy data-slot="command" onClick={handleCopyClick}>
      <span>{props.value}</span>
      <CopyStatus />
    </button>
  )
}

export default function Home() {
  const i18n = useI18n()
  const language = useLanguage()

  return (
    <main data-page="opendungeon">
      <Title>{i18n.t("home.title")}</Title>
      <Meta property="og:image" content="/social-share.png" />
      <LocaleLinks path="/" />
      <div data-component="container">
        <Header />

        <div data-component="content">
          <section data-component="hero">
            <div data-component="desktop-app-banner">
              <span data-slot="badge">{i18n.t("home.banner.badge")}</span>
              <div data-slot="content">
                <span data-slot="text">{i18n.t("home.banner.text")}.</span>
                <A href={language.route("/docs")} data-slot="link">
                  {i18n.t("home.banner.link")}
                </A>
              </div>
            </div>

            <div data-slot="hero-copy">
              <h1>{i18n.t("home.hero.title")}</h1>
              <p>
                {i18n.t("home.hero.subtitle.a")} <span data-slot="br"></span>
                {i18n.t("home.hero.subtitle.b")}
              </p>
            </div>

            <section aria-label={i18n.t("home.install.ariaLabel")} data-component="install">
              <Command value={i18n.t("home.install.bun")} />
              <Command value={i18n.t("home.install.run")} />
              <Command value={i18n.t("home.install.login")} />
              <Command value={i18n.t("home.install.github")} />
            </section>
          </section>

          <section data-component="terminal-preview">
            <div data-slot="chrome">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div data-slot="screen">
              <p>OPENDUNGEON</p>
              <pre>{`╭─ Crawler ───────╮ ╭─ Vitals ─────────────╮ ╭─ Run ─────────╮
│ Mira            │ │ HP    █████████ 25/25│ │ Floor 1/5     │
│ Ranger          │ │ FOCUS ████████  11/11│ │ Quest active  │
╰─────────────────╯ ╰──────────────────────╯ ╰───────────────╯

        @        explore the seed. complete events. wake the admin.

╭─ Pack ──────────────────────────────────────────────────────╮
│ [1] Strike   [H] Potion   [G] Gold   [R] Relic   [I] Pack   │
╰──────────────────────────────────────────────────────────────╯`}</pre>
            </div>
          </section>

          <section data-component="what">
            <div data-slot="section-title">
              <h3>{i18n.t("home.what.title")}</h3>
              <p>{i18n.t("home.what.body")}</p>
            </div>
            <ul>
              <li>
                <span>[*]</span>
                <div>
                  <strong>{i18n.t("home.what.seeded.title")}</strong> {i18n.t("home.what.seeded.body")}
                </div>
              </li>
              <li>
                <span>[*]</span>
                <div>
                  <strong>{i18n.t("home.what.ai.title")}</strong> {i18n.t("home.what.ai.body")}
                </div>
              </li>
              <li>
                <span>[*]</span>
                <div>
                  <strong>{i18n.t("home.what.assets.title")}</strong> {i18n.t("home.what.assets.body")}
                </div>
              </li>
            </ul>
            <A href={language.route("/docs")}>
              <span>{i18n.t("home.what.docs")} </span>
              <span aria-hidden="true">-&gt;</span>
            </A>
          </section>

          <section data-component="preview-copy">
            <h3>{i18n.t("home.preview.title")}</h3>
            <p>{i18n.t("home.preview.body")}</p>
          </section>
        </div>

        <Footer />
      </div>
    </main>
  )
}

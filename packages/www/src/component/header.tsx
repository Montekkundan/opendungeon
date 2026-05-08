import { A } from "@solidjs/router"
import { useI18n } from "~/context/i18n"
import { useLanguage } from "~/context/language"

export function Header() {
  const i18n = useI18n()
  const language = useLanguage()

  return (
    <header data-component="top">
      <A href={language.route("/")} data-component="brand" aria-label="opendungeon home">
        <span data-slot="mark">◆</span>
        <span data-slot="wordmark">opendungeon</span>
      </A>
      <nav data-component="nav-desktop">
        <a href={language.route("/docs")}>{i18n.t("nav.docs")}</a>
        <a href="https://github.com/Montekkundan/opendungeon" target="_blank">
          {i18n.t("nav.github")}
        </a>
        <a href={language.route("/docs#login")}>{i18n.t("nav.login")}</a>
      </nav>
      <div data-component="language-switch">
        {language.locales.map((locale) => (
          <button type="button" data-active={language.locale() === locale ? "" : undefined} onClick={() => language.setLocale(locale)}>
            {language.label(locale)}
          </button>
        ))}
      </div>
    </header>
  )
}

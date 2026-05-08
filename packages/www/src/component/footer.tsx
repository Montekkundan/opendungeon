import { A } from "@solidjs/router"
import { useI18n } from "~/context/i18n"
import { useLanguage } from "~/context/language"

export function Footer() {
  const i18n = useI18n()
  const language = useLanguage()

  return (
    <footer data-component="footer">
      <A href={language.route("/")}>opendungeon</A>
      <nav>
        <A href={language.route("/docs")}>{i18n.t("nav.docs")}</A>
        <a href="https://github.com/Montekkundan/opendungeon" target="_blank">
          {i18n.t("nav.github")}
        </a>
      </nav>
    </footer>
  )
}

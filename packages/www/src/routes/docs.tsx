import "./index.css"
import { Title } from "@solidjs/meta"
import { Header } from "~/component/header"
import { Footer } from "~/component/footer"
import { LocaleLinks } from "~/component/locale-links"
import { useI18n } from "~/context/i18n"

export default function Docs() {
  const i18n = useI18n()

  return (
    <main data-page="opendungeon">
      <Title>{i18n.t("docs.title")}</Title>
      <LocaleLinks path="/docs" />
      <div data-component="container">
        <Header />
        <article data-component="docs">
          <p data-slot="eyebrow">opendungeon</p>
          <h1>{i18n.t("docs.heading")}</h1>
          <p>{i18n.t("docs.intro")}</p>

          <section>
            <h2>{i18n.t("docs.quickstart.title")}</h2>
            <ol>
              <li>{i18n.t("docs.quickstart.install")}</li>
              <li>{i18n.t("docs.quickstart.play")}</li>
              <li id="login">{i18n.t("docs.quickstart.login")}</li>
            </ol>
          </section>

          <section>
            <h2>{i18n.t("docs.arch.title")}</h2>
            <ul>
              <li>{i18n.t("docs.arch.engine")}</li>
              <li>{i18n.t("docs.arch.admin")}</li>
              <li>{i18n.t("docs.arch.storage")}</li>
            </ul>
          </section>

          <section>
            <h2>{i18n.t("docs.links.title")}</h2>
            <ul>
              <li>
                <a href="https://vercel.com/docs/workflow">Vercel Workflow</a>
              </li>
              <li>
                <a href="https://vercel.com/docs/ai-gateway">Vercel AI Gateway</a>
              </li>
              <li>
                <a href="https://supabase.com/docs">Supabase</a>
              </li>
            </ul>
          </section>
        </article>
        <Footer />
      </div>
    </main>
  )
}

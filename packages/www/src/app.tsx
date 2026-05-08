import { Meta, MetaProvider, Title } from "@solidjs/meta"
import { Router } from "@solidjs/router"
import { FileRoutes } from "@solidjs/start/router"
import { Suspense } from "solid-js"
import "@ibm/plex/css/ibm-plex.css"
import "./app.css"
import { I18nProvider, useI18n } from "~/context/i18n"
import { LanguageProvider } from "~/context/language"
import { strip } from "~/lib/language"

function AppMeta() {
  const i18n = useI18n()
  return (
    <>
      <Title>opendungeon</Title>
      <Meta name="description" content={i18n.t("app.meta.description")} />
      <link rel="icon" href="/favicon.svg" />
    </>
  )
}

export default function App() {
  return (
    <Router
      explicitLinks={true}
      transformUrl={strip}
      root={(props) => (
        <LanguageProvider>
          <I18nProvider>
            <MetaProvider>
              <AppMeta />
              <Suspense>{props.children}</Suspense>
            </MetaProvider>
          </I18nProvider>
        </LanguageProvider>
      )}
    >
      <FileRoutes />
    </Router>
  )
}

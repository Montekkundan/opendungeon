import { createEffect, createMemo, createSignal, type JSX } from "solid-js"
import { getRequestEvent } from "solid-js/web"
import {
  LOCALES,
  type Locale,
  clearCookie,
  cookie,
  detectFromLanguages,
  dir as localeDir,
  label as localeLabel,
  localeFromCookieHeader,
  localeFromRequest,
  parseLocale,
  route as localeRoute,
  tag as localeTag,
} from "~/lib/language"
import { createContext, useContext } from "solid-js"

type LanguageContextValue = {
  locale(): Locale
  locales: readonly Locale[]
  label(locale: Locale): string
  tag(locale: Locale): string
  dir(locale: Locale): "ltr" | "rtl"
  route(pathname: string): string
  setLocale(next: Locale): void
  clear(): void
}

const LanguageContext = createContext<LanguageContextValue>()

function initial(): Locale {
  const evt = getRequestEvent()
  if (evt) return localeFromRequest(evt.request)

  if (typeof document === "object") {
    const fromDom = parseLocale(document.documentElement.dataset.locale)
    if (fromDom) return fromDom

    const fromCookie = localeFromCookieHeader(document.cookie)
    if (fromCookie) return fromCookie
  }

  if (typeof navigator !== "object") return "en"
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
  return detectFromLanguages(languages)
}

export function LanguageProvider(props: { children: JSX.Element }) {
  const [locale, setLocaleSignal] = createSignal<Locale>(initial())
  const value = createMemo<LanguageContextValue>(() => ({
    locale,
    locales: LOCALES,
    label: localeLabel,
    tag: localeTag,
    dir: localeDir,
    route(pathname) {
      return localeRoute(locale(), pathname)
    },
    setLocale(next) {
      setLocaleSignal(next)
      if (typeof document !== "object") return
      document.cookie = cookie(next)
    },
    clear() {
      if (typeof document !== "object") return
      document.cookie = clearCookie()
    },
  }))

  createEffect(() => {
    if (typeof document !== "object") return
    document.documentElement.lang = localeTag(locale())
    document.documentElement.dir = localeDir(locale())
    document.documentElement.dataset.locale = locale()
  })

  return <LanguageContext.Provider value={value()}>{props.children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) throw new Error("Language context is missing.")
  return context
}

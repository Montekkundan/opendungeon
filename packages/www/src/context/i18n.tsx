import { createContext, createMemo, useContext, type JSX } from "solid-js"
import { i18n, type Key } from "~/i18n"
import { useLanguage } from "~/context/language"

type I18nContextValue = {
  t(key: Key, params?: Record<string, string | number>): string
}

const I18nContext = createContext<I18nContextValue>()

function resolve(text: string, params?: Record<string, string | number>) {
  if (!params) return text
  return text.replace(/\{\{(\w+)\}\}/g, (raw, key) => {
    const value = params[key]
    return value === undefined || value === null ? raw : String(value)
  })
}

export function I18nProvider(props: { children: JSX.Element }) {
  const language = useLanguage()
  const dict = createMemo(() => i18n(language.locale()))

  const value: I18nContextValue = {
    t(key, params) {
      return resolve(dict()[key], params)
    },
  }

  return <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) throw new Error("I18n context is missing.")
  return context
}

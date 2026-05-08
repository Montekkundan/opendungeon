import { Link } from "@solidjs/meta"
import { For } from "solid-js"
import { useLanguage } from "~/context/language"

export function LocaleLinks(props: { path: string }) {
  const language = useLanguage()
  return (
    <For each={language.locales}>
      {(locale) => <Link rel="alternate" hreflang={language.tag(locale)} href={language.route(props.path)} />}
    </For>
  )
}

import type { Locale } from "~/lib/language"
import { enDict, type EnKey } from "~/i18n/en"
import { frDict } from "~/i18n/fr"

export type Key = EnKey
export type Dict = Record<Key, string>

const base = enDict satisfies Dict

export function i18n(locale: Locale): Dict {
  if (locale === "fr") return { ...base, ...frDict }
  return base
}

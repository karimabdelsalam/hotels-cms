import { getRequestConfig } from "next-intl/server";
import type { AbstractIntlMessages } from "next-intl";
import { DEFAULT_LOCALE, isKnownLocale } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested && isKnownLocale(requested) ? requested : DEFAULT_LOCALE;

  // UI strings are compiled from the database in a later phase; the English
  // catalogue in messages/ is the source of keys.
  const loaded = await import(`../../messages/${locale}.json`).catch(
    () => import(`../../messages/${DEFAULT_LOCALE}.json`),
  );

  return { locale, messages: loaded.default as AbstractIntlMessages };
});

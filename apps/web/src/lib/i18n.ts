import { getRequestConfig } from "next-intl/server";
import type { AbstractIntlMessages } from "next-intl";
import { getUiMessages } from "@fantazia/db/i18n";
import { DEFAULT_LOCALE, isKnownLocale } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested && isKnownLocale(requested) ? requested : DEFAULT_LOCALE;

  /**
   * Strings come from the database, with the fallback chain already applied —
   * requested locale, its fallback, then English. They are edited in the admin
   * Translation Manager, so a wording change does not need a deploy.
   *
   * apps/web/messages/en.json remains the source of the KEYS: it is what the
   * sync reconciles the database against.
   */
  let messages: AbstractIntlMessages;
  try {
    messages = (await getUiMessages(locale)) as AbstractIntlMessages;
  } catch {
    // A database that is briefly unreachable should degrade to the shipped
    // English catalogue rather than render raw keys at a guest.
    const fallback = await import(`../../messages/${DEFAULT_LOCALE}.json`);
    messages = fallback.default as AbstractIntlMessages;
  }

  return { locale, messages };
});

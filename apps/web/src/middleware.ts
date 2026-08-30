import createMiddleware from "next-intl/middleware";
import { DEFAULT_LOCALE, KNOWN_LOCALES } from "./lib/routing";

export default createMiddleware({
  locales: [...KNOWN_LOCALES],
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
  localeDetection: false, // suggest via a banner; never auto-redirect — it breaks shared links
});

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};

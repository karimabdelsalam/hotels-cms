"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type Locale = { code: string; nativeName: string };

/**
 * Every page already emits a correct hreflang set, including translated slugs.
 * The switcher reads those, so switching language from a resort page lands on
 * the same resort — not the homepage, which is what most multilingual sites do.
 * If a page has no alternates, it falls back to swapping the locale segment.
 */
export function LocaleSwitcher({ locale, locales }: { locale: string; locales: Locale[] }) {
  const pathname = usePathname();
  const [hrefs, setHrefs] = useState<Record<string, string>>({});

  useEffect(() => {
    const found: Record<string, string> = {};
    document
      .querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]')
      .forEach((el) => {
        const code = el.getAttribute("hreflang");
        if (code && code !== "x-default") {
          try {
            found[code] = new URL(el.href).pathname;
          } catch {
            /* ignore a malformed alternate rather than breaking the switcher */
          }
        }
      });
    setHrefs(found);
  }, [pathname]);

  const swap = (code: string) => {
    if (hrefs[code]) return hrefs[code];
    const segments = (pathname || `/${locale}`).split("/");
    segments[1] = code;
    return segments.join("/") || `/${code}`;
  };

  return (
    <div className="lang">
      {locales.map((l) => (
        <a
          key={l.code}
          href={swap(l.code)}
          className={l.code === locale ? "on" : ""}
          lang={l.code}
          hrefLang={l.code}
        >
          {l.code.toUpperCase()}
        </a>
      ))}
    </div>
  );
}

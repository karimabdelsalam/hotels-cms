"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "./LocaleSwitcher";

type Item = { id: string; label: string; href: string; newTab: boolean; children: Item[] };
type Locale = { code: string; nativeName: string };

export function SiteHeader({
  locale,
  primary,
  utility,
  locales,
}: {
  locale: string;
  primary: Item[];
  utility: Item[];
  locales: Locale[];
}) {
  const t = useTranslations("nav");
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <a className="skip" href="#content">
        {t("skipToContent")}
      </a>
      <nav className={`nav${stuck ? " stuck" : ""}`} aria-label="Primary">
        <div className="wrap nav-inner">
          <Link href={`/${locale}`} className="mark" aria-label="Fantazia Hotels & Resorts, home">
            <b>FANTAZIA</b>
            <span>Marsa Alam</span>
          </Link>

          <ul className="nav-links">
            {primary.map((item) => (
              <li key={item.id} className="nav-li">
                <Link href={item.href}>{item.label}</Link>
                {item.children.length > 0 && (
                  <ul className="nav-sub">
                    {item.children.map((c) => (
                      <li key={c.id}>
                        <Link href={c.href}>{c.label}</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>

          <div className="nav-right">
            <LocaleSwitcher locale={locale} locales={locales} />
            {utility.map((item) => (
              <Link key={item.id} href={item.href} className="util-link">
                {item.label}
              </Link>
            ))}
            <Link href={`/${locale}/resorts`} className="btn btn--coral">
              {t("book")}
              <span className="ar" aria-hidden="true">
                →
              </span>
            </Link>
          </div>
        </div>
      </nav>
    </>
  );
}

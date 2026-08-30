import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getResorts, getExperiences } from "@fantazia/db/content";

type Item = { id: string; label: string; href: string };

export async function SiteFooter({ locale, support }: { locale: string; support: Item[] }) {
  const t = await getTranslations("footer");
  const [resorts, experiences] = await Promise.all([getResorts(locale), getExperiences(locale)]);

  return (
    <footer className="footer">
      <div className="wrap">
        <div className="foot">
          <div className="foot-brand">
            <Link href={`/${locale}`} className="mark" aria-label="Fantazia Hotels & Resorts, home">
              <b>FANTAZIA</b>
              <span>Marsa Alam</span>
            </Link>
            <p>{t("blurb")}</p>
          </div>

          <div className="fcol">
            <h3>{t("resorts")}</h3>
            <ul>
              {resorts.map((r) => (
                <li key={r.id}>
                  <Link href={`/${locale}/resorts/${r.slug}`}>{r.name}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="fcol">
            <h3>{t("theCoast")}</h3>
            <ul>
              {experiences.slice(0, 4).map((x) => (
                <li key={x.id}>
                  <Link href={`/${locale}/experiences/${x.slug}`}>{x.name}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="fcol">
            <h3>{t("support")}</h3>
            <ul>
              {support.map((i) => (
                <li key={i.id}>
                  <Link href={i.href}>{i.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="fbar">
          <span>© {new Date().getFullYear()} {t("rights")}</span>
        </div>
      </div>
    </footer>
  );
}

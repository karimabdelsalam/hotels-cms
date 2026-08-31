import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <section className="section sec-shell page-top">
      <div className="wrap prose">
        <span className="tag">404</span>
        <h1 className="d2">{t("title")}</h1>
        <p className="lede">{t("body")}</p>
        <Link href="/en" className="btn btn--sea">
          {t("home")}
          <span className="ar" aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}

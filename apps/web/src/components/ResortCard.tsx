import Link from "next/link";
import { formatMoney } from "@fantazia/db/content";

const FILLS = ["f-1", "f-2", "f-3"] as const;

export type ResortCardData = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  shortDescription: string | null;
  stars: number | null;
  currency: string;
  fromRateMinor: number | null;
  amenities: string[];
};

export function ResortCard({
  resort,
  locale,
  index,
  labels,
}: {
  resort: ResortCardData;
  locale: string;
  index: number;
  labels: { from: string; perNight: string; book: string };
}) {
  const price = formatMoney(resort.fromRateMinor, resort.currency, locale);
  const fill = FILLS[index % FILLS.length];

  return (
    <article className="house">
      <Link href={`/${locale}/resorts/${resort.slug}`} className="h-media" tabIndex={-1} aria-hidden="true">
        <div className={`fill ${fill}`} />
      </Link>
      <div className="h-body">
        {resort.tagline && <span className="tag tag--sea">{resort.tagline}</span>}
        <h3 className="d3">
          <Link href={`/${locale}/resorts/${resort.slug}`}>{resort.name}</Link>
        </h3>
        {resort.shortDescription && <p>{resort.shortDescription}</p>}
        {resort.amenities.length > 0 && (
          <div className="facts">
            {resort.amenities.slice(0, 3).map((a) => (
              <span className="fact" key={a}>{a}</span>
            ))}
          </div>
        )}
        <div className="h-foot">
          {price && (
            <div className="rate">
              <span className="k">{labels.from}</span>
              <span className="v">{price}</span> <span className="u">{labels.perNight}</span>
            </div>
          )}
          <Link href={`/${locale}/resorts/${resort.slug}`} className="btn btn--sea">
            {labels.book}
            <span className="ar" aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </article>
  );
}

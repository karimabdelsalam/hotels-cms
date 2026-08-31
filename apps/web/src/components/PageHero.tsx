import { Reveal } from "./Reveal";

/**
 * Inner-page hero. Shorter than the homepage's, and a still colour field
 * rather than the animated plate — the caustics belong to arrival, not to
 * every page.
 */
export function PageHero({
  eyebrow,
  title,
  lede,
  fill = "f-1",
}: {
  eyebrow?: string | null;
  title: string;
  lede?: string | null;
  fill?: string;
}) {
  return (
    <header className="page-hero">
      <div className={`fill ${fill}`} />
      <div className="wrap page-hero-inner">
        {eyebrow && (
          <Reveal>
            <span className="tag tag--surf">{eyebrow}</span>
          </Reveal>
        )}
        <Reveal delay={0.06}>
          <h1 className="d2">{title}</h1>
        </Reveal>
        {lede && (
          <Reveal delay={0.12}>
            <p className="lede on-deep-lede">{lede}</p>
          </Reveal>
        )}
      </div>
    </header>
  );
}

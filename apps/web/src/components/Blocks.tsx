import Link from "next/link";
import { Reveal } from "./Reveal";

/**
 * Content pages are composed from the same components the homepage uses,
 * which is what stops a new page drifting away from the design system.
 * An unknown block type renders nothing rather than throwing — an editor
 * mistake should never take a page down.
 */
export type Block = { type: string; props: Record<string, unknown> };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

export function Blocks({ blocks, locale }: { blocks: Block[]; locale: string }) {
  return (
    <>
      {blocks.map((block, i) => {
        const key = `${block.type}-${i}`;
        switch (block.type) {
          case "richText": {
            const html = str(block.props.html);
            if (!html) return null;
            return (
              <Reveal key={key} delay={i * 0.05}>
                <div className="prose-body" dangerouslySetInnerHTML={{ __html: html }} />
              </Reveal>
            );
          }
          case "lede": {
            const text = str(block.props.text);
            if (!text) return null;
            return (
              <Reveal key={key} delay={i * 0.05}>
                <p className="lede">{text}</p>
              </Reveal>
            );
          }
          case "heading": {
            const text = str(block.props.text);
            if (!text) return null;
            return (
              <Reveal key={key} delay={i * 0.05}>
                <h2 className="d3">{text}</h2>
              </Reveal>
            );
          }
          case "quote": {
            const text = str(block.props.text);
            if (!text) return null;
            return (
              <Reveal key={key} delay={i * 0.05}>
                <blockquote className="pull">
                  <p>{text}</p>
                  {str(block.props.attribution) && <cite>{str(block.props.attribution)}</cite>}
                </blockquote>
              </Reveal>
            );
          }
          case "facts": {
            const items = Array.isArray(block.props.items) ? block.props.items : [];
            if (!items.length) return null;
            return (
              <Reveal key={key} delay={i * 0.05}>
                <div className="facts">
                  {items.map((f, n) => {
                    const label = str(f);
                    return label ? (
                      <span className="fact" key={n}>
                        {label}
                      </span>
                    ) : null;
                  })}
                </div>
              </Reveal>
            );
          }
          case "cta": {
            const label = str(block.props.label);
            const href = str(block.props.href);
            if (!label || !href) return null;
            return (
              <Reveal key={key} delay={i * 0.05}>
                <Link
                  href={href.startsWith("/") ? `/${locale}${href}` : href}
                  className="btn btn--sea"
                >
                  {label}
                  <span className="ar" aria-hidden="true">→</span>
                </Link>
              </Reveal>
            );
          }
          default:
            return null;
        }
      })}
    </>
  );
}

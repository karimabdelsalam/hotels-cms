"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Media, type MediaRef } from "./Media";

export type HeroSlide =
  | { kind: "video"; poster: string; sources: { src: string; type: string; media?: string }[] }
  | { kind: "image"; media: MediaRef; fallbackClass: string; caption: string | null };

const INTERVAL = 7000;

/**
 * The hero backdrop: a video plate followed by the properties.
 *
 * Autoplay is muted and inline because every browser refuses it otherwise, and
 * the video is only ever decorative — the headline and the search never depend
 * on it having loaded.
 */
export function HeroSlider({ slides, labels }: {
  slides: HeroSlide[];
  labels: { previous: string; next: string; goTo: string; pause: string; play: string };
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [reduced, setReduced] = useState(false);
  const region = useRef<HTMLDivElement>(null);

  const count = slides.length;
  const go = useCallback((n: number) => setIndex(((n % count) + count) % count), [count]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Advancing stops while the tab is hidden, while a pointer is over the hero,
  // and while focus is inside it — a carousel that moves under someone reading
  // it, or tabbing through it, is worse than one that does not move at all.
  useEffect(() => {
    if (!playing || reduced || count < 2) return;
    const node = region.current;
    let paused = false;
    const hold = () => { paused = true; };
    const release = () => { paused = false; };

    node?.addEventListener("pointerenter", hold);
    node?.addEventListener("pointerleave", release);
    node?.addEventListener("focusin", hold);
    node?.addEventListener("focusout", release);

    const id = window.setInterval(() => {
      if (!paused && !document.hidden) setIndex((i) => (i + 1) % count);
    }, INTERVAL);

    return () => {
      window.clearInterval(id);
      node?.removeEventListener("pointerenter", hold);
      node?.removeEventListener("pointerleave", release);
      node?.removeEventListener("focusin", hold);
      node?.removeEventListener("focusout", release);
    };
  }, [playing, reduced, count]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
  };

  return (
    <div
      className="plate"
      ref={region}
      role="region"
      aria-roledescription="carousel"
      aria-label="Fantazia"
      onKeyDown={onKey}
    >
      {slides.map((slide, i) => (
        <div
          key={i}
          className={`plate-slide${i === index ? " is-on" : ""}`}
          aria-hidden={i !== index}
          // Inert while off-screen so a link inside a hidden slide never takes
          // focus from a keyboard user.
          {...(i !== index ? { inert: "" as unknown as boolean } : {})}
        >
          {slide.kind === "video" ? (
            <video
              poster={slide.poster}
              autoPlay={!reduced}
              muted
              loop
              playsInline
              preload={i === 0 ? "auto" : "none"}
              tabIndex={-1}
              aria-hidden="true"
            >
              {slide.sources.map((s) => (
                <source key={s.src} src={s.src} type={s.type} media={s.media} />
              ))}
            </video>
          ) : (
            <Media
              media={slide.media}
              fallbackClass={slide.fallbackClass}
              sizes="100vw"
              priority={i === 0}
            />
          )}
        </div>
      ))}

      {count > 1 && (
        <div className="plate-ui">
          <button type="button" className="plate-arrow" onClick={() => go(index - 1)} aria-label={labels.previous}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M15 4 7 12l8 8" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>

          <div className="plate-dots">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                className={i === index ? "is-on" : undefined}
                aria-label={`${labels.goTo} ${i + 1}`}
                aria-current={i === index}
                onClick={() => go(i)}
              />
            ))}
          </div>

          <button type="button" className="plate-arrow" onClick={() => go(index + 1)} aria-label={labels.next}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M9 4l8 8-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>

          <button
            type="button"
            className="plate-arrow plate-hold"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? labels.pause : labels.play}
          >
            {playing ? (
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path d="M9 5v14M15 5v14" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path d="M8 5l11 7-11 7z" fill="currentColor" />
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

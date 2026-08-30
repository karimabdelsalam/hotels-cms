"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { SearchBar } from "./SearchBar";

/**
 * The hero renders the production video markup. Until the group's footage
 * exists, a canvas caustics plate stands in — same layering, same overlays,
 * so swapping in <video> later is one element.
 */
export function Hero() {
  const t = useTranslations("home");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cells = Array.from({ length: 16 }, () => ({
      x: Math.random(), y: Math.random(),
      ax: 0.1 + Math.random() * 0.16, ay: 0.07 + Math.random() * 0.13,
      sx: 0.00013 + Math.random() * 0.00026, sy: 0.00011 + Math.random() * 0.00022,
      p: Math.random() * 6.28, r: 0.1 + Math.random() * 0.17,
    }));

    const size = () => {
      const d = Math.min(window.devicePixelRatio || 1, 1.4);
      cv.width = Math.max(1, Math.round(window.innerWidth * 0.34 * d));
      cv.height = Math.max(1, Math.round(window.innerHeight * 0.34 * d));
    };
    size();
    window.addEventListener("resize", size);

    const draw = (time: number) => {
      const { width: w, height: h } = cv;
      ctx.globalCompositeOperation = "source-over";
      const base = ctx.createLinearGradient(0, 0, w * 0.25, h);
      base.addColorStop(0, "#5FE9DC");
      base.addColorStop(0.34, "#0BB8B0");
      base.addColorStop(0.68, "#0787A3");
      base.addColorStop(1, "#043D57");
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = "screen";
      const m = Math.max(w, h);
      for (const c of cells) {
        const cx = (c.x + Math.sin(time * c.sx + c.p) * c.ax) * w;
        const cy = (c.y + Math.cos(time * c.sy + c.p * 1.3) * c.ay) * h;
        const rr = c.r * m * (0.82 + Math.sin(time * c.sx * 2.3 + c.p) * 0.18);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
        g.addColorStop(0, "rgba(226,255,251,0.50)");
        g.addColorStop(0.42, "rgba(150,244,232,0.18)");
        g.addColorStop(1, "rgba(120,230,220,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, 6.2832);
        ctx.fill();
      }
    };

    let raf = 0;
    if (reduce) {
      draw(0);
    } else {
      let last = 0;
      const loop = (time: number) => {
        if (!document.hidden && time - last > 33) {
          draw(time);
          last = time;
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
    };
  }, []);

  return (
    <header className="hero">
      <div className="plate">
        <canvas ref={canvasRef} aria-hidden="true" />
      </div>

      <div className="hero-inner wrap">
        <div className="hero-copy">
          <span className="tag tag--surf fade-up">{t("eyebrow")}</span>
          <h1 className="d1">
            <span className="reveal-line"><span>{t("headline1")}</span></span>
            <span className="reveal-line"><span>{t("headline2")}</span></span>
            <span className="reveal-line"><span><em>{t("headline3")}</em></span></span>
          </h1>
          <p className="lede on-deep-lede fade-up">{t("lede")}</p>
        </div>

        <SearchBar />

        <div className="cue fade-up">
          <i aria-hidden="true" /> {t("scroll")}
        </div>
      </div>
    </header>
  );
}

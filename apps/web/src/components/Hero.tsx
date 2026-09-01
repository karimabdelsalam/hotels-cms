"use client";

import { useTranslations } from "next-intl";
import { SearchBar } from "./SearchBar";
import { HeroSlider, type HeroSlide } from "./HeroSlider";

/**
 * The hero. Its backdrop is a slider: a video plate first, then the
 * properties, all of it decorative — the headline and the search bar are
 * server-rendered and never wait on any of it.
 */
export function Hero({ slides }: { slides: HeroSlide[] }) {
  const t = useTranslations("home");

  return (
    <header className="hero">
      <HeroSlider
        slides={slides}
        labels={{
          previous: t("sliderPrev"),
          next: t("sliderNext"),
          goTo: t("sliderGoTo"),
          pause: t("sliderPause"),
          play: t("sliderPlay"),
        }}
      />

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

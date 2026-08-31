"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

/**
 * Three fields on the surface, the rest in a popover.
 *
 * Eight controls in a row looks like a form from 2011, and most guests only
 * ever touch dates and party size.
 */
export function SearchBar({ resortId }: { resortId?: string }) {
  const t = useTranslations("search");
  const locale = useLocale();
  const router = useRouter();

  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const plus = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return iso(d);
  };

  const [checkIn, setCheckIn] = useState(plus(30));
  const [checkOut, setCheckOut] = useState(plus(33));
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [rooms, setRooms] = useState(1);
  const [openWho, setOpenWho] = useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams({
      checkIn,
      checkOut,
      adults: String(adults),
      children: String(children),
      rooms: String(rooms),
    });
    if (resortId) params.set("resort", resortId);
    router.push(`/${locale}/book?${params.toString()}`);
  };

  // Leaving must be after arriving. Enforced here as well as on the server,
  // because a date picker that lets you pick an impossible stay is worse than
  // one that quietly moves the second date along with the first.
  const onCheckIn = (value: string) => {
    setCheckIn(value);
    if (value >= checkOut) {
      const next = new Date(`${value}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      setCheckOut(next.toISOString().slice(0, 10));
    }
  };

  const nights = Math.max(
    0,
    Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000),
  );

  return (
    <form className="search fade-up" role="search" aria-label={t("label")} onSubmit={submit}>
      <label className="fld">
        <span className="k">{t("checkIn")}</span>
        <input
          className="v"
          type="date"
          value={checkIn}
          min={iso(today)}
          onChange={(e) => onCheckIn(e.target.value)}
        />
      </label>

      <label className="fld">
        <span className="k">{t("checkOut")}</span>
        <input
          className="v"
          type="date"
          value={checkOut}
          min={checkIn}
          onChange={(e) => setCheckOut(e.target.value)}
        />
      </label>

      <div className="fld fld--who">
        <button type="button" className="who-toggle" onClick={() => setOpenWho(!openWho)} aria-expanded={openWho}>
          <span className="k">{t("who")}</span>
          <span className="v">
            {adults} {t("adults")}
            {children > 0 ? `, ${children} ${t("children")}` : ""} · {rooms} {t("rooms")}
          </span>
        </button>

        {openWho && (
          <div className="who-pop">
            <Counter label={t("adults")} value={adults} min={1} max={20} onChange={setAdults} />
            <Counter label={t("children")} value={children} min={0} max={20} onChange={setChildren} />
            <Counter label={t("rooms")} value={rooms} min={1} max={9} onChange={setRooms} />
            <button type="button" className="btn btn--sm" onClick={() => setOpenWho(false)}>
              {t("done")}
            </button>
          </div>
        )}
      </div>

      <button className="btn btn--coral" type="submit" disabled={nights < 1}>
        {t("submit")}
        <span className="ar" aria-hidden="true">
          →
        </span>
      </button>
    </form>
  );
}

function Counter({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="counter">
      <span>{label}</span>
      <span className="counter-ctrls">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`${label} −`}>
          −
        </button>
        <b aria-live="polite">{value}</b>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`${label} +`}>
          +
        </button>
      </span>
    </div>
  );
}

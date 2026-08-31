"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

/**
 * One request goes to every resort that fits, which is the whole point of a
 * group site. Submission is wired to the API in a later phase; the form
 * validates and reports state today rather than pretending to send.
 */
export function EnquiryForm({ resorts }: { resorts: { id: string; name: string }[] }) {
  const t = useTranslations("enquiry");
  const [selected, setSelected] = useState<string[]>(resorts.map((r) => r.id));
  const [sent, setSent] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <form
      className="enquiry"
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
    >
      <div className="enq-grid">
        <div className="field">
          <label htmlFor="enq-name">{t("name")}</label>
          <input id="enq-name" name="name" className="inp" required autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="enq-email">{t("email")}</label>
          <input id="enq-email" name="email" type="email" className="inp" required autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="enq-date">{t("date")}</label>
          <input id="enq-date" name="date" type="date" className="inp" />
        </div>
        <div className="field">
          <label htmlFor="enq-guests">{t("guests")}</label>
          <input id="enq-guests" name="guests" type="number" min={1} className="inp" />
        </div>
      </div>

      <fieldset className="field">
        <legend>{t("whichResorts")}</legend>
        <div className="checks">
          {resorts.map((r) => (
            <label className="chk" key={r.id}>
              <input
                type="checkbox"
                checked={selected.includes(r.id)}
                onChange={() => toggle(r.id)}
              />
              {r.name}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="enq-msg">{t("message")}</label>
        <textarea id="enq-msg" name="message" className="inp" rows={4} />
      </div>

      <div className="enq-foot">
        <button className="btn btn--sea" type="submit" disabled={selected.length === 0}>
          {t("submit")}
          <span className="ar" aria-hidden="true">→</span>
        </button>
        <p role="status" className="enq-status">
          {sent ? t("received") : t("goesTo", { count: selected.length })}
        </p>
      </div>
    </form>
  );
}

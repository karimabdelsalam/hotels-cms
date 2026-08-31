"use client";

import { useActionState, useState } from "react";
import { Field } from "@/components/editor/Field";
import { SaveBar } from "@/components/editor/SaveBar";
import { LocaleTabs, type LocaleView } from "@/components/editor/LocaleTabs";
import { saveOfferDetails, saveOfferTranslation } from "../actions";

type Translation = {
  localeCode: string;
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  terms: string | null;
  validityLabel: string | null;
};

export function OfferEditor({
  offer,
  resorts,
  locales,
  translations,
  canWrite,
}: {
  offer: {
    id: string;
    promoCode: string | null;
    resortId: string | null;
    status: string;
    displayOrder: number;
  };
  resorts: { id: string; name: string }[];
  locales: LocaleView[];
  translations: Translation[];
  canWrite: boolean;
}) {
  const [tab, setTab] = useState(locales[0]?.code ?? "en");
  const source = translations.find((t) => t.localeCode === "en");
  const [detailState, detailAction, detailPending] = useActionState(saveOfferDetails, null);

  return (
    <div className="editor">
      <section className="card">
        <h2>Details</h2>
        <form action={detailAction} className="form">
          <input type="hidden" name="offerId" value={offer.id} />
          <div className="grid">
            <div className="field">
              <label htmlFor="promoCode">Promo code</label>
              <input
                id="promoCode"
                name="promoCode"
                className="inp mono"
                defaultValue={offer.promoCode ?? ""}
                disabled={!canWrite}
              />
            </div>
            <div className="field">
              <label htmlFor="resortId">Applies at</label>
              <select
                id="resortId"
                name="resortId"
                className="inp"
                defaultValue={offer.resortId ?? ""}
                disabled={!canWrite}
              >
                <option value="">All resorts (group-wide)</option>
                {resorts.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="displayOrder">Order</label>
              <input
                id="displayOrder"
                name="displayOrder"
                type="number"
                min={0}
                className="inp"
                defaultValue={offer.displayOrder}
                disabled={!canWrite}
              />
            </div>
            <div className="field">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" className="inp" defaultValue={offer.status} disabled={!canWrite}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
          {canWrite && <SaveBar state={detailState} pending={detailPending} label="Save details" />}
        </form>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Content</h2>
          <LocaleTabs
            locales={locales}
            active={tab}
            onSelect={setTab}
            isTranslated={(code) =>
              Boolean(translations.find((t) => t.localeCode === code)?.title?.trim())
            }
          />
        </div>
        {locales
          .filter((l) => l.code === tab)
          .map((l) => (
            <TranslationForm
              key={l.code}
              offerId={offer.id}
              locale={l}
              value={translations.find((t) => t.localeCode === l.code)}
              source={l.isDefault ? undefined : source}
              canWrite={canWrite}
            />
          ))}
      </section>
    </div>
  );
}

function TranslationForm({
  offerId,
  locale,
  value,
  source,
  canWrite,
}: {
  offerId: string;
  locale: LocaleView;
  value?: Translation;
  source?: Translation;
  canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(saveOfferTranslation, null);
  const rtl = locale.direction === "rtl";
  const dir = rtl ? "rtl" : "ltr";
  const k = (n: string) => `${n}-${locale.code}`;

  return (
    <form action={action} className="form">
      <input type="hidden" name="offerId" value={offerId} />
      <input type="hidden" name="localeCode" value={locale.code} />

      <Field id={k("title")} label="Title" source={source?.title} rtl={rtl}>
        <input id={k("title")} name="title" className="inp" defaultValue={value?.title ?? ""}
          dir={dir} lang={locale.code} required disabled={!canWrite} />
      </Field>

      <Field id={k("slug")} label="Slug" source={source?.slug} hint="Used in the address.">
        <input id={k("slug")} name="slug" className="inp mono" defaultValue={value?.slug ?? ""}
          required disabled={!canWrite} />
      </Field>

      <Field id={k("validity")} label="Validity label" source={source?.validityLabel} rtl={rtl}
        hint="Shown on the card, e.g. “Until 20 December”.">
        <input id={k("validity")} name="validityLabel" className="inp"
          defaultValue={value?.validityLabel ?? ""} dir={dir} lang={locale.code} disabled={!canWrite} />
      </Field>

      <Field id={k("summary")} label="Summary" source={source?.summary} rtl={rtl}>
        <textarea id={k("summary")} name="summary" className="inp" rows={2}
          defaultValue={value?.summary ?? ""} dir={dir} lang={locale.code} disabled={!canWrite} />
      </Field>

      <Field id={k("description")} label="Description" source={source?.description} rtl={rtl}>
        <textarea id={k("description")} name="description" className="inp" rows={5}
          defaultValue={value?.description ?? ""} dir={dir} lang={locale.code} disabled={!canWrite} />
      </Field>

      <Field id={k("terms")} label="Terms" source={source?.terms} rtl={rtl}
        hint="Shown at the bottom of the offer page. Must match what the resort will honour.">
        <textarea id={k("terms")} name="terms" className="inp" rows={4}
          defaultValue={value?.terms ?? ""} dir={dir} lang={locale.code} disabled={!canWrite} />
      </Field>

      {canWrite && <SaveBar state={state} pending={pending} label={`Save ${locale.nativeName}`} />}
    </form>
  );
}

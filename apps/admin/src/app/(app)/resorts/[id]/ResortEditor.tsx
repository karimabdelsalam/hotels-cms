"use client";

import { useActionState, useState } from "react";
import { saveResortDetails, saveResortTranslation } from "./actions";

type Locale = { code: string; nativeName: string; direction: string; isDefault: boolean };
type Translation = {
  localeCode: string;
  name: string;
  slug: string;
  tagline: string | null;
  shortDescription: string | null;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
};
type Resort = {
  id: string;
  code: string;
  starRating: number | null;
  checkInTime: string;
  checkOutTime: string;
  phone: string | null;
  email: string | null;
  fromRateMinor: number | null;
  currency: string;
  status: string;
};

export function ResortEditor({
  resort,
  locales,
  translations,
  rooms,
  canWrite,
}: {
  resort: Resort;
  locales: Locale[];
  translations: Translation[];
  rooms: { id: string; name: string; maxOccupancy: number; externalCode: string | null }[];
  canWrite: boolean;
}) {
  const [tab, setTab] = useState<string>(locales[0]?.code ?? "en");
  const source = translations.find((t) => t.localeCode === "en");

  return (
    <div className="editor">
      <section className="card">
        <h2>Details</h2>
        <p className="note">Shared across every language.</p>
        <DetailsForm resort={resort} canWrite={canWrite} />
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Content</h2>
          <div className="tabs" role="tablist">
            {locales.map((l) => {
              const done = translations.find((t) => t.localeCode === l.code)?.name;
              return (
                <button
                  key={l.code}
                  type="button"
                  role="tab"
                  aria-selected={tab === l.code}
                  onClick={() => setTab(l.code)}
                >
                  {l.nativeName}
                  {!done && <span className="dot" title="Not translated" />}
                </button>
              );
            })}
          </div>
        </div>

        {locales
          .filter((l) => l.code === tab)
          .map((l) => (
            <TranslationForm
              key={l.code}
              resortId={resort.id}
              locale={l}
              value={translations.find((t) => t.localeCode === l.code)}
              source={l.isDefault ? undefined : source}
              canWrite={canWrite}
            />
          ))}
      </section>

      <section className="card">
        <h2>Room types</h2>
        <div className="scroller">
          <table>
            <thead>
              <tr>
                <th>Room</th>
                <th className="num">Sleeps</th>
                <th>PMS code</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.name}</b>
                  </td>
                  <td className="num">{r.maxOccupancy}</td>
                  <td>
                    {r.externalCode ? (
                      <code>{r.externalCode}</code>
                    ) : (
                      <span className="chip chip--warn">Needs mapping</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">
          PMS codes stay empty until the OPERA mapping is done — content goes live without
          waiting for the integration.
        </p>
      </section>
    </div>
  );
}

function Status({ state }: { state: { error?: string; ok?: true; savedAt?: number } | null }) {
  if (!state) return null;
  if (state.error)
    return (
      <p className="err" role="alert">
        {state.error}
      </p>
    );
  if (state.ok)
    return (
      <p className="ok" role="status">
        Saved
      </p>
    );
  return null;
}

function DetailsForm({ resort, canWrite }: { resort: Resort; canWrite: boolean }) {
  const [state, action, pending] = useActionState(saveResortDetails, null);

  return (
    <form action={action} className="form">
      <input type="hidden" name="resortId" value={resort.id} />
      <div className="grid">
        <div className="field">
          <label htmlFor="starRating">Star rating</label>
          <input
            id="starRating"
            name="starRating"
            type="number"
            min={1}
            max={5}
            className="inp"
            defaultValue={resort.starRating ?? ""}
            disabled={!canWrite}
          />
        </div>
        <div className="field">
          <label htmlFor="fromRate">From rate ({resort.currency})</label>
          <input
            id="fromRate"
            name="fromRate"
            type="number"
            min={0}
            step="1"
            className="inp"
            defaultValue={resort.fromRateMinor != null ? resort.fromRateMinor / 100 : ""}
            disabled={!canWrite}
          />
        </div>
        <div className="field">
          <label htmlFor="checkInTime">Check in</label>
          <input
            id="checkInTime"
            name="checkInTime"
            className="inp"
            defaultValue={resort.checkInTime}
            disabled={!canWrite}
          />
        </div>
        <div className="field">
          <label htmlFor="checkOutTime">Check out</label>
          <input
            id="checkOutTime"
            name="checkOutTime"
            className="inp"
            defaultValue={resort.checkOutTime}
            disabled={!canWrite}
          />
        </div>
        <div className="field">
          <label htmlFor="phone">Phone</label>
          <input id="phone" name="phone" className="inp" defaultValue={resort.phone ?? ""} disabled={!canWrite} />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="inp" defaultValue={resort.email ?? ""} disabled={!canWrite} />
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" className="inp" defaultValue={resort.status} disabled={!canWrite}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>
      {canWrite && (
        <div className="form-foot">
          <button className="btn btn--pri" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save details"}
          </button>
          <Status state={state} />
        </div>
      )}
    </form>
  );
}

function TranslationForm({
  resortId,
  locale,
  value,
  source,
  canWrite,
}: {
  resortId: string;
  locale: Locale;
  value?: Translation;
  source?: Translation;
  canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(saveResortTranslation, null);
  const rtl = locale.direction === "rtl";

  return (
    <form action={action} className="form">
      <input type="hidden" name="resortId" value={resortId} />
      <input type="hidden" name="localeCode" value={locale.code} />

      <Field id={`name-${locale.code}`} label="Name" source={source?.name} rtl={rtl}>
        <input
          id={`name-${locale.code}`}
          name="name"
          className="inp"
          defaultValue={value?.name ?? ""}
          dir={rtl ? "rtl" : "ltr"}
          lang={locale.code}
          required
          disabled={!canWrite}
        />
      </Field>

      <Field id={`slug-${locale.code}`} label="Slug" source={source?.slug} hint="Used in the address. Lowercase, hyphens.">
        <input
          id={`slug-${locale.code}`}
          name="slug"
          className="inp mono"
          defaultValue={value?.slug ?? ""}
          required
          disabled={!canWrite}
        />
      </Field>

      <Field id={`tagline-${locale.code}`} label="Tagline" source={source?.tagline} rtl={rtl}>
        <input
          id={`tagline-${locale.code}`}
          name="tagline"
          className="inp"
          defaultValue={value?.tagline ?? ""}
          dir={rtl ? "rtl" : "ltr"}
          lang={locale.code}
          disabled={!canWrite}
        />
      </Field>

      <Field id={`short-${locale.code}`} label="Short description" source={source?.shortDescription} rtl={rtl}>
        <textarea
          id={`short-${locale.code}`}
          name="shortDescription"
          className="inp"
          rows={2}
          defaultValue={value?.shortDescription ?? ""}
          dir={rtl ? "rtl" : "ltr"}
          lang={locale.code}
          disabled={!canWrite}
        />
      </Field>

      <Field id={`desc-${locale.code}`} label="Description" source={source?.description} rtl={rtl}>
        <textarea
          id={`desc-${locale.code}`}
          name="description"
          className="inp"
          rows={5}
          defaultValue={value?.description ?? ""}
          dir={rtl ? "rtl" : "ltr"}
          lang={locale.code}
          disabled={!canWrite}
        />
      </Field>

      <div className="grid">
        <Field id={`mt-${locale.code}`} label="Meta title" source={source?.metaTitle} rtl={rtl}>
          <input
            id={`mt-${locale.code}`}
            name="metaTitle"
            className="inp"
            defaultValue={value?.metaTitle ?? ""}
            dir={rtl ? "rtl" : "ltr"}
            lang={locale.code}
            disabled={!canWrite}
          />
        </Field>
        <Field id={`md-${locale.code}`} label="Meta description" source={source?.metaDescription} rtl={rtl}>
          <input
            id={`md-${locale.code}`}
            name="metaDescription"
            className="inp"
            defaultValue={value?.metaDescription ?? ""}
            dir={rtl ? "rtl" : "ltr"}
            lang={locale.code}
            disabled={!canWrite}
          />
        </Field>
      </div>

      {canWrite && (
        <div className="form-foot">
          <button className="btn btn--pri" type="submit" disabled={pending}>
            {pending ? "Saving…" : `Save ${locale.nativeName}`}
          </button>
          <Status state={state} />
        </div>
      )}
    </form>
  );
}

/**
 * The English source sits beside the field being translated, so a translator
 * never works blind.
 */
function Field({
  id,
  label,
  source,
  hint,
  rtl,
  children,
}: {
  id: string;
  label: string;
  source?: string | null;
  hint?: string;
  rtl?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
      {source && (
        <span className="source" dir="ltr">
          <em>English:</em> {source}
        </span>
      )}
      {rtl && <span className="hint">Right to left</span>}
    </div>
  );
}

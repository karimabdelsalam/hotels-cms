"use client";

import { useActionState, useState } from "react";
import { Field } from "@/components/editor/Field";
import { SaveBar } from "@/components/editor/SaveBar";
import { LocaleTabs, type LocaleView } from "@/components/editor/LocaleTabs";
import { saveExperienceDetails, saveExperienceTranslation } from "../actions";

type Translation = {
  localeCode: string;
  name: string;
  slug: string;
  summary: string | null;
  description: string | null;
};

export function ExperienceEditor({
  experience,
  locales,
  translations,
  canWrite,
}: {
  experience: {
    id: string;
    category: string;
    durationHours: number | null;
    priceMinor: number | null;
    status: string;
    displayOrder: number;
  };
  locales: LocaleView[];
  translations: Translation[];
  canWrite: boolean;
}) {
  const [tab, setTab] = useState(locales[0]?.code ?? "en");
  const source = translations.find((t) => t.localeCode === "en");
  const [state, action, pending] = useActionState(saveExperienceDetails, null);

  return (
    <div className="editor">
      <section className="card">
        <h2>Details</h2>
        <form action={action} className="form">
          <input type="hidden" name="experienceId" value={experience.id} />
          <div className="grid">
            <div className="field">
              <label htmlFor="category">Category</label>
              <select id="category" name="category" className="inp"
                defaultValue={experience.category} disabled={!canWrite}>
                <option value="water">Water</option>
                <option value="desert">Desert</option>
                <option value="wellness">Wellness</option>
                <option value="family">Family</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="durationHours">Duration (hours)</label>
              <input id="durationHours" name="durationHours" type="number" step="0.5" min={0}
                className="inp" defaultValue={experience.durationHours ?? ""} disabled={!canWrite} />
            </div>
            <div className="field">
              <label htmlFor="price">Price (EGP)</label>
              <input id="price" name="price" type="number" min={0} step="1" className="inp"
                defaultValue={experience.priceMinor != null ? experience.priceMinor / 100 : ""}
                disabled={!canWrite} />
            </div>
            <div className="field">
              <label htmlFor="displayOrder">Order</label>
              <input id="displayOrder" name="displayOrder" type="number" min={0} className="inp"
                defaultValue={experience.displayOrder} disabled={!canWrite} />
            </div>
            <div className="field">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" className="inp"
                defaultValue={experience.status} disabled={!canWrite}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
          {canWrite && <SaveBar state={state} pending={pending} label="Save details" />}
        </form>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Content</h2>
          <LocaleTabs locales={locales} active={tab} onSelect={setTab}
            isTranslated={(code) =>
              Boolean(translations.find((t) => t.localeCode === code)?.name?.trim())} />
        </div>
        {locales
          .filter((l) => l.code === tab)
          .map((l) => (
            <TranslationForm key={l.code} experienceId={experience.id} locale={l}
              value={translations.find((t) => t.localeCode === l.code)}
              source={l.isDefault ? undefined : source} canWrite={canWrite} />
          ))}
      </section>
    </div>
  );
}

function TranslationForm({
  experienceId,
  locale,
  value,
  source,
  canWrite,
}: {
  experienceId: string;
  locale: LocaleView;
  value?: Translation;
  source?: Translation;
  canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(saveExperienceTranslation, null);
  const rtl = locale.direction === "rtl";
  const dir = rtl ? "rtl" : "ltr";
  const k = (n: string) => `${n}-${locale.code}`;

  return (
    <form action={action} className="form">
      <input type="hidden" name="experienceId" value={experienceId} />
      <input type="hidden" name="localeCode" value={locale.code} />

      <Field id={k("name")} label="Name" source={source?.name} rtl={rtl}>
        <input id={k("name")} name="name" className="inp" defaultValue={value?.name ?? ""}
          dir={dir} lang={locale.code} required disabled={!canWrite} />
      </Field>

      <Field id={k("slug")} label="Slug" source={source?.slug}>
        <input id={k("slug")} name="slug" className="inp mono" defaultValue={value?.slug ?? ""}
          required disabled={!canWrite} />
      </Field>

      <Field id={k("summary")} label="Summary" source={source?.summary} rtl={rtl}
        hint="One line, shown on the card.">
        <input id={k("summary")} name="summary" className="inp" defaultValue={value?.summary ?? ""}
          dir={dir} lang={locale.code} disabled={!canWrite} />
      </Field>

      <Field id={k("description")} label="Description" source={source?.description} rtl={rtl}>
        <textarea id={k("description")} name="description" className="inp" rows={6}
          defaultValue={value?.description ?? ""} dir={dir} lang={locale.code} disabled={!canWrite} />
      </Field>

      {canWrite && <SaveBar state={state} pending={pending} label={`Save ${locale.nativeName}`} />}
    </form>
  );
}

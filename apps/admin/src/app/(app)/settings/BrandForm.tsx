"use client";

import { useActionState } from "react";
import { Field } from "@/components/editor/Field";
import { SaveBar } from "@/components/editor/SaveBar";
import type { LocaleView } from "@/components/editor/LocaleTabs";
import { saveBrand } from "./actions";

export function BrandForm({
  name,
  wordmark,
  locations,
  taglines,
  locales,
  canWrite,
}: {
  name: string;
  wordmark: string;
  locations: Record<string, string>;
  taglines: Record<string, string>;
  locales: LocaleView[];
  canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(saveBrand, null);

  return (
    <form action={action} className="editor">
      <section className="card">
        <h2>Group identity</h2>
        <div className="grid">
          <Field id="name" label="Name" hint="Used in page titles and the footer.">
            <input id="name" name="name" className="inp" defaultValue={name} required disabled={!canWrite} />
          </Field>
          <Field
            id="wordmark"
            label="Wordmark"
            hint="Set in the display face at the top of every page. Usually the name in capitals."
          >
            <input
              id="wordmark"
              name="wordmark"
              className="inp"
              defaultValue={wordmark}
              required
              disabled={!canWrite}
            />
          </Field>
        </div>
        <p className="note">
          The name is a proper noun and is not translated. Where it sits — and the line beneath
          it — are, since those are read as words rather than as a mark.
        </p>
      </section>

      <section className="card">
        <h2>Location &amp; tagline</h2>
        {locales.map((l) => {
          const rtl = l.direction === "rtl";
          return (
            <div className="grid" key={l.code}>
              <Field
                id={`location-${l.code}`}
                label={`Location — ${l.nativeName}`}
                source={l.isDefault ? undefined : locations.en}
                rtl={rtl}
              >
                <input
                  id={`location-${l.code}`}
                  name={`location.${l.code}`}
                  className="inp"
                  defaultValue={locations[l.code] ?? ""}
                  dir={rtl ? "rtl" : "ltr"}
                  lang={l.code}
                  disabled={!canWrite}
                />
              </Field>
              <Field
                id={`tagline-${l.code}`}
                label={`Tagline — ${l.nativeName}`}
                source={l.isDefault ? undefined : taglines.en}
                rtl={rtl}
              >
                <input
                  id={`tagline-${l.code}`}
                  name={`tagline.${l.code}`}
                  className="inp"
                  defaultValue={taglines[l.code] ?? ""}
                  dir={rtl ? "rtl" : "ltr"}
                  lang={l.code}
                  disabled={!canWrite}
                />
              </Field>
            </div>
          );
        })}
        {canWrite ? (
          <SaveBar state={state} pending={pending} label="Save settings" />
        ) : (
          <p className="note">Changing the group identity requires the publish permission.</p>
        )}
      </section>
    </form>
  );
}

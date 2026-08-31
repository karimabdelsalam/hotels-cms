"use client";

import { useActionState, useState } from "react";
import { Field } from "@/components/editor/Field";
import { SaveBar } from "@/components/editor/SaveBar";
import { LocaleTabs, type LocaleView } from "@/components/editor/LocaleTabs";
import { savePageDetails, savePageTranslation } from "../actions";
import { BLOCK_TYPES, emptyBlock, type Block } from "./blocks";

type Translation = {
  localeCode: string;
  title: string;
  slug: string;
  metaTitle: string | null;
  metaDescription: string | null;
  blocks: Block[];
};

export function PageEditor({
  page,
  locales,
  translations,
  canWrite,
  canPublish,
}: {
  page: { id: string; key: string; status: string; isSystem: boolean };
  locales: LocaleView[];
  translations: Translation[];
  canWrite: boolean;
  canPublish: boolean;
}) {
  const [tab, setTab] = useState(locales[0]?.code ?? "en");
  const source = translations.find((t) => t.localeCode === "en");
  const [state, action, pending] = useActionState(savePageDetails, null);

  return (
    <div className="editor">
      <section className="card">
        <h2>Publishing</h2>
        <form action={action} className="form">
          <input type="hidden" name="pageId" value={page.id} />
          <div className="grid">
            <div className="field">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" className="inp" defaultValue={page.status} disabled={!canPublish}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
              <span className="hint">
                A draft returns 404 on the site and stays out of the sitemap.
              </span>
            </div>
          </div>
          {canPublish ? (
            <SaveBar state={state} pending={pending} label="Save" />
          ) : (
            <p className="note">Publishing is a separate permission from editing.</p>
          )}
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
              pageId={page.id}
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
  pageId,
  locale,
  value,
  source,
  canWrite,
}: {
  pageId: string;
  locale: LocaleView;
  value?: Translation;
  source?: Translation;
  canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(savePageTranslation, null);
  const [blocks, setBlocks] = useState<Block[]>(value?.blocks ?? []);
  const rtl = locale.direction === "rtl";
  const dir = rtl ? "rtl" : "ltr";
  const k = (n: string) => `${n}-${locale.code}`;

  const update = (i: number, next: Block) =>
    setBlocks((prev) => prev.map((b, n) => (n === i ? next : b)));
  const move = (i: number, by: number) =>
    setBlocks((prev) => {
      const j = i + by;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      const a = copy[i]!;
      copy[i] = copy[j]!;
      copy[j] = a;
      return copy;
    });

  return (
    <form action={action} className="form">
      <input type="hidden" name="pageId" value={pageId} />
      <input type="hidden" name="localeCode" value={locale.code} />
      <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />

      <div className="grid">
        <Field id={k("title")} label="Title" source={source?.title} rtl={rtl}>
          <input id={k("title")} name="title" className="inp" defaultValue={value?.title ?? ""}
            dir={dir} lang={locale.code} required disabled={!canWrite} />
        </Field>
        <Field id={k("slug")} label="Slug" source={source?.slug} hint="The address after the language.">
          <input id={k("slug")} name="slug" className="inp mono" defaultValue={value?.slug ?? ""}
            required disabled={!canWrite} />
        </Field>
      </div>

      <div className="blocks">
        <div className="blocks-head">
          <span className="blocks-label">Content blocks</span>
          <span className="hint">{blocks.length} block{blocks.length === 1 ? "" : "s"}</span>
        </div>

        {blocks.length === 0 && (
          <p className="empty">
            Empty. Add a block below — the page is built from the same components the site uses.
          </p>
        )}

        {blocks.map((block, i) => (
          <div className="block" key={`${block.type}-${i}`}>
            <div className="block-head">
              <b>{BLOCK_TYPES.find((t) => t.type === block.type)?.label ?? block.type}</b>
              {canWrite && (
                <span className="ctrls">
                  <button type="button" className="ic" onClick={() => move(i, -1)}
                    disabled={i === 0} aria-label="Move up">↑</button>
                  <button type="button" className="ic" onClick={() => move(i, 1)}
                    disabled={i === blocks.length - 1} aria-label="Move down">↓</button>
                  <button type="button" className="ic ic--del"
                    onClick={() => setBlocks((p) => p.filter((_, n) => n !== i))}
                    aria-label="Remove block">✕</button>
                </span>
              )}
            </div>
            <BlockFields block={block} dir={dir} lang={locale.code} disabled={!canWrite}
              onChange={(next) => update(i, next)} />
          </div>
        ))}

        {canWrite && (
          <div className="block-add">
            {BLOCK_TYPES.map((t) => (
              <button key={t.type} type="button" className="btn btn--sm" title={t.hint}
                onClick={() => setBlocks((p) => [...p, emptyBlock(t.type)])}>
                + {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid">
        <Field id={k("mt")} label="Meta title" source={source?.metaTitle} rtl={rtl}>
          <input id={k("mt")} name="metaTitle" className="inp" defaultValue={value?.metaTitle ?? ""}
            dir={dir} lang={locale.code} disabled={!canWrite} />
        </Field>
        <Field id={k("md")} label="Meta description" source={source?.metaDescription} rtl={rtl}>
          <input id={k("md")} name="metaDescription" className="inp"
            defaultValue={value?.metaDescription ?? ""} dir={dir} lang={locale.code} disabled={!canWrite} />
        </Field>
      </div>

      {canWrite && <SaveBar state={state} pending={pending} label={`Save ${locale.nativeName}`} />}
    </form>
  );
}

function BlockFields({
  block,
  dir,
  lang,
  disabled,
  onChange,
}: {
  block: Block;
  dir: string;
  lang: string;
  disabled: boolean;
  onChange: (b: Block) => void;
}) {
  const common = { className: "inp", dir, lang, disabled } as const;

  switch (block.type) {
    case "lede":
    case "heading":
      return (
        <textarea {...common} rows={block.type === "lede" ? 3 : 2} value={block.props.text}
          onChange={(e) => onChange({ ...block, props: { text: e.target.value } })} />
      );
    case "richText":
      return (
        <textarea {...common} rows={7} value={block.props.html}
          placeholder="<p>…</p>"
          onChange={(e) => onChange({ type: "richText", props: { html: e.target.value } })} />
      );
    case "quote":
      return (
        <div className="grid">
          <textarea {...common} rows={3} value={block.props.text}
            onChange={(e) => onChange({ ...block, props: { ...block.props, text: e.target.value } })} />
          <input {...common} value={block.props.attribution ?? ""} placeholder="Attribution"
            onChange={(e) =>
              onChange({ ...block, props: { ...block.props, attribution: e.target.value } })} />
        </div>
      );
    case "facts":
      return (
        <div className="fact-rows">
          {block.props.items.map((item, i) => (
            <div className="fact-row" key={i}>
              <input {...common} value={item}
                onChange={(e) =>
                  onChange({
                    ...block,
                    props: {
                      items: block.props.items.map((v, n) => (n === i ? e.target.value : v)),
                    },
                  })} />
              {!disabled && (
                <button type="button" className="ic ic--del" aria-label="Remove"
                  onClick={() =>
                    onChange({ ...block, props: { items: block.props.items.filter((_, n) => n !== i) } })}>
                  ✕
                </button>
              )}
            </div>
          ))}
          {!disabled && (
            <button type="button" className="btn btn--sm"
              onClick={() => onChange({ ...block, props: { items: [...block.props.items, ""] } })}>
              + Add
            </button>
          )}
        </div>
      );
    case "cta":
      return (
        <div className="grid">
          <input {...common} value={block.props.label} placeholder="Button label"
            onChange={(e) => onChange({ ...block, props: { ...block.props, label: e.target.value } })} />
          <input className="inp mono" dir="ltr" disabled={disabled} value={block.props.href}
            placeholder="/resorts"
            onChange={(e) => onChange({ ...block, props: { ...block.props, href: e.target.value } })} />
        </div>
      );
  }
}

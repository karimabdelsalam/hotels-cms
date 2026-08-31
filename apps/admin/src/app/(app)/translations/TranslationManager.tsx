"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import {
  saveString,
  markReviewed,
  publishTranslations,
  exportTranslations,
  previewImport,
  commitImport,
  autoTranslateLocale,
  suggestTranslation,
} from "./actions";

type LocaleView = {
  code: string;
  nativeName: string;
  direction: string;
  isDefault: boolean;
  isEnabled: boolean;
};
type Row = {
  id: string;
  namespace: string;
  key: string;
  value: string;
  status: string;
  humanEdited: boolean;
  machineModel: string | null;
  source: string;
};
type Completeness = {
  code: string;
  total: number;
  translated: number;
  missing: number;
  needsReview: number;
  machine: number;
  percent: number;
};

const STATUS_LABEL: Record<string, string> = {
  missing: "Missing",
  machine: "Machine",
  draft: "Draft",
  translated: "Done",
  needs_review: "Needs review",
};

export function TranslationManager({
  locales,
  completeness,
  active,
  namespaces,
  filters,
  rows,
  aiConfigured,
  canWrite,
  canPublish,
}: {
  locales: LocaleView[];
  completeness: Completeness[];
  active: string;
  namespaces: { name: string; count: number }[];
  filters: { namespace: string; status: string; q: string };
  rows: Row[];
  aiConfigured: boolean;
  canWrite: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  const locale = locales.find((l) => l.code === active);
  const rtl = locale?.direction === "rtl";
  const stats = completeness.find((c) => c.code === active);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/translations?${next.toString()}`);
  };

  return (
    <div className="editor">
      <section className="card">
        <div className="card-head">
          <h2>Progress</h2>
          {canPublish && (
            <button
              type="button"
              className="btn"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const result = await publishTranslations();
                  setNotice(
                    result === "ok"
                      ? "Published — the site is showing the current wording."
                      : result === "skipped"
                        ? "Saved. The site will pick these up within five minutes."
                        : "Saved, but the site could not be reached. It will pick these up within five minutes.",
                  );
                })
              }
            >
              Publish to the site
            </button>
          )}
        </div>
        <div className="stat-row">
          {completeness.map((c) => {
            const l = locales.find((x) => x.code === c.code);
            return (
              <button
                key={c.code}
                type="button"
                className={`stat${c.code === active ? " on" : ""}`}
                onClick={() => setParam("locale", c.code)}
              >
                <b>{c.percent}%</b>
                <span>{l?.nativeName ?? c.code}</span>
                <em>
                  {c.missing > 0 && `${c.missing} missing`}
                  {c.missing > 0 && c.needsReview > 0 && " · "}
                  {c.needsReview > 0 && `${c.needsReview} to review`}
                  {c.missing === 0 && c.needsReview === 0 && l?.isEnabled && "Complete"}
                  {c.missing === 0 && c.needsReview === 0 && !l?.isEnabled && "Ready to publish"}
                </em>
              </button>
            );
          })}
        </div>
        {notice && (
          <p className="ok" role="status">
            {notice}
          </p>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>{locale?.nativeName ?? active}</h2>
          <div className="filters">
            <input
              className="inp"
              placeholder="Search key or text"
              defaultValue={filters.q}
              onKeyDown={(e) => {
                if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value);
              }}
            />
            <select
              className="inp"
              value={filters.namespace}
              onChange={(e) => setParam("namespace", e.target.value)}
            >
              <option value="">All sections</option>
              {namespaces.map((n) => (
                <option key={n.name} value={n.name}>
                  {n.name} ({n.count})
                </option>
              ))}
            </select>
            <select
              className="inp"
              value={filters.status}
              onChange={(e) => setParam("status", e.target.value)}
            >
              <option value="">Any state</option>
              <option value="missing">Missing</option>
              <option value="needs_review">Needs review</option>
              <option value="machine">Machine</option>
              <option value="translated">Done</option>
            </select>
          </div>
        </div>

        {locale?.isDefault ? (
          <p className="note">
            English is the source language. Its wording lives in the code catalogue and is
            reconciled on every deploy — editing it here would be overwritten silently.
          </p>
        ) : rows.length === 0 ? (
          <p className="empty">Nothing matches those filters.</p>
        ) : (
          <div className="strings">
            {rows.map((row) => (
              <StringRow
              key={row.id}
              row={row}
              rtl={rtl}
              locale={active}
              canWrite={canWrite}
              aiConfigured={aiConfigured}
            />
            ))}
          </div>
        )}
        {rows.length === 400 && (
          <p className="note">Showing the first 400. Narrow the filters to see the rest.</p>
        )}
      </section>

      {canWrite && !locale?.isDefault && (
        <AutoTranslatePanel
          locale={active}
          nativeName={locale?.nativeName ?? active}
          configured={aiConfigured}
        />
      )}

      {canWrite && !locale?.isDefault && (
        <TransferPanel locale={active} nativeName={locale?.nativeName ?? active} />
      )}

      {stats && stats.missing + stats.needsReview > 0 && locale && !locale.isEnabled && (
        <p className="note">
          {locale.nativeName} is not published yet. It stays out of the language switcher, the
          sitemap and every hreflang set until it is complete — a half-translated site is worse
          than one language.
        </p>
      )}
    </div>
  );
}

function StringRow({
  row,
  rtl,
  locale,
  canWrite,
  aiConfigured,
}: {
  row: Row;
  rtl: boolean;
  locale: string;
  canWrite: boolean;
  aiConfigured: boolean;
}) {
  const [value, setValue] = useState(row.value);
  const [status, setStatus] = useState(row.status);
  const [humanEdited, setHumanEdited] = useState(row.humanEdited);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  const commit = async () => {
    if (value === row.value) return;
    setSaving("saving");
    try {
      const result = await saveString(row.id, value);
      setStatus(result.status);
      setHumanEdited(true);
      setSaving("saved");
      setTimeout(() => setSaving("idle"), 1500);
    } catch {
      setSaving("error");
    }
  };

  return (
    <div className={`string${status === "needs_review" ? " drift" : ""}`}>
      <div className="string-key">
        <code>
          {row.namespace}.{row.key}
        </code>
        <span className={`chip chip--${chipFor(status)}`}>{STATUS_LABEL[status] ?? status}</span>
        {humanEdited && (
          <span className="chip chip--lock" title="Edited by a person — automatic translation will not touch it">
            Yours
          </span>
        )}
        {status === "machine" && row.machineModel && (
          <span className="hint">by {row.machineModel}</span>
        )}
      </div>
      <p className="string-source" dir="ltr">
        {row.source}
      </p>
      <textarea
        className="inp"
        rows={value.length > 90 ? 3 : 1}
        value={value}
        dir={rtl ? "rtl" : "ltr"}
        lang={locale}
        disabled={!canWrite}
        placeholder="Not translated"
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
      />
      {suggestion !== null && (
        <div className="suggestion">
          <span className="picker-label">Suggested</span>
          <p dir={rtl ? "rtl" : "ltr"} lang={locale}>
            {suggestion}
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => {
                setValue(suggestion);
                setSuggestion(null);
              }}
            >
              Use it
            </button>
            <button type="button" className="btn btn--sm" onClick={() => setSuggestion(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="string-foot">
        {saving === "saving" && <span className="hint">Saving…</span>}
        {saving === "saved" && <span className="ok">Saved</span>}
        {saving === "error" && <span className="err">Could not save</span>}
        {suggestError && <span className="err">{suggestError}</span>}

        {canWrite && aiConfigured && suggestion === null && (
          <button
            type="button"
            className="btn btn--sm"
            disabled={suggesting}
            onClick={async () => {
              setSuggesting(true);
              setSuggestError(null);
              const result = await suggestTranslation(row.id);
              setSuggesting(false);
              if (result.ok) setSuggestion(result.value);
              else setSuggestError(result.error);
            }}
          >
            {suggesting ? "Thinking…" : "Suggest"}
          </button>
        )}

        {status === "machine" && canWrite && (
          <button
            type="button"
            className="btn btn--sm"
            onClick={async () => {
              await markReviewed(row.id);
              setStatus(value.trim() ? "translated" : "missing");
              setHumanEdited(true);
            }}
          >
            Approve
          </button>
        )}
      </div>
    </div>
  );
}

function chipFor(status: string) {
  if (status === "translated") return "ok";
  if (status === "missing" || status === "needs_review" || status === "machine") return "warn";
  return "ok";
}

function TransferPanel({ locale, nativeName }: { locale: string; nativeName: string }) {
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<
    | { changes: { id: string; path: string; from: string; to: string }[]; unknown: number; identical: number; total: number }
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const download = (format: "json" | "csv" | "xliff") =>
    start(async () => {
      const file = await exportTranslations(locale, format);
      const blob = new Blob([file.body], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.filename;
      a.click();
      URL.revokeObjectURL(url);
    });

  return (
    <section className="card">
      <h2>Send out &amp; bring back</h2>
      <p className="note">
        Export {nativeName} for an agency to work in offline, then import their file. The import
        shows a diff first — a bad file cannot quietly overwrite a language.
      </p>

      <div className="transfer">
        <div className="transfer-group">
          <span className="picker-label">Export</span>
          <div className="btn-row">
            <button type="button" className="btn btn--sm" disabled={pending} onClick={() => download("json")}>
              JSON
            </button>
            <button type="button" className="btn btn--sm" disabled={pending} onClick={() => download("csv")}>
              CSV
            </button>
            <button type="button" className="btn btn--sm" disabled={pending} onClick={() => download("xliff")}>
              XLIFF
            </button>
          </div>
        </div>

        <div className="transfer-group">
          <span className="picker-label">Import</span>
          <input
            type="file"
            accept=".json,.csv,.xlf,.xliff,text/plain"
            className="inp"
            disabled={pending}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setError(null);
              setDone(null);
              const raw = await file.text();
              start(async () => {
                const result = await previewImport(locale, raw);
                if (result.ok) setPreview(result);
                else {
                  setError(result.error);
                  setPreview(null);
                }
              });
            }}
          />
        </div>
      </div>

      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="ok" role="status">
          {done}
        </p>
      )}

      {preview && (
        <div className="import-preview">
          <p className="note">
            <b>{preview.changes.length}</b> would change · {preview.identical} identical ·{" "}
            {preview.unknown} unknown key{preview.unknown === 1 ? "" : "s"} ignored · {preview.total}{" "}
            in the file
          </p>
          {preview.changes.length > 0 && (
            <>
              <div className="scroller" style={{ maxHeight: 280 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Key</th>
                      <th>Now</th>
                      <th>Would become</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.changes.slice(0, 60).map((c) => (
                      <tr key={c.id}>
                        <td>
                          <code>{c.path}</code>
                        </td>
                        <td>{c.from || <span className="hint">empty</span>}</td>
                        <td>
                          <b>{c.to}</b>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn--pri"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const result = await commitImport(
                        locale,
                        preview.changes.map((c) => ({ id: c.id, to: c.to })),
                      );
                      setDone(`${result.applied} strings updated.`);
                      setPreview(null);
                    })
                  }
                >
                  Apply {preview.changes.length} change{preview.changes.length === 1 ? "" : "s"}
                </button>
                <button type="button" className="btn btn--sm" onClick={() => setPreview(null)}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}


function AutoTranslatePanel({
  locale,
  nativeName,
  configured,
}: {
  locale: string;
  nativeName: string;
  configured: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
    rejected: { path: string; reason: string }[];
  } | null>(null);

  const run = (scope: "missing" | "missing_and_stale") =>
    start(async () => {
      setResult(null);
      const outcome = await autoTranslateLocale(locale, scope);
      setResult({ ok: outcome.ok, message: outcome.message, rejected: outcome.rejected });
    });

  return (
    <section className="card">
      <h2>Translate with AI</h2>
      <p className="note">
        Fills {nativeName} from the English source. Output is marked as machine work and
        counts as unreviewed until someone approves it — it is a first draft, not something
        the site quietly starts saying. The second button also picks up strings whose English
        has changed since they were translated, so editing the English re-translates the rest.
      </p>
      <p className="note">
        <b>Anything you have edited by hand is never touched</b>, whatever state it is in. A
        string becomes yours the moment you save it, and stays yours until you change it again.
      </p>

      {!configured ? (
        <p className="err">
          Not configured. Set <code>ANTHROPIC_API_KEY</code> on the server to enable this.
        </p>
      ) : (
        <div className="btn-row">
          <button type="button" className="btn btn--pri" disabled={pending} onClick={() => run("missing")}>
            {pending ? "Translating…" : "Translate what is missing"}
          </button>
          <button type="button" className="btn" disabled={pending} onClick={() => run("missing_and_stale")}>
            Also redo drafts and strings whose English changed
          </button>
        </div>
      )}

      {result && (
        <>
          <p className={result.ok ? "ok" : "err"} role="status">
            {result.message}
          </p>
          {result.rejected.length > 0 && (
            <div className="scroller" style={{ maxHeight: 220 }}>
              <table>
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Why it was rejected</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rejected.map((r) => (
                    <tr key={r.path}>
                      <td>
                        <code>{r.path}</code>
                      </td>
                      <td>{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

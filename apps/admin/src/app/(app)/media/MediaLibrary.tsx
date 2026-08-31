"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { mediaUrl } from "@fantazia/media";
import { Field } from "@/components/editor/Field";
import { SaveBar } from "@/components/editor/SaveBar";
import { LocaleTabs, type LocaleView } from "@/components/editor/LocaleTabs";
import { saveAltText, saveFocalPoint, removeMedia } from "./actions";

type Asset = {
  id: string;
  storageKey: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  placeholder: string | null;
  originalName: string | null;
  focalX: number;
  focalY: number;
  uses: number;
  uploadedBy: string | null;
  translations: { localeCode: string; alt: string; caption: string | null }[];
};

export function MediaLibrary({
  assets,
  locales,
  canWrite,
}: {
  assets: Asset[];
  locales: LocaleView[];
  canWrite: boolean;
}) {
  const [selected, setSelected] = useState<Asset | null>(null);

  return (
    <div className="media-layout">
      <div>
        {canWrite && <Uploader />}
        {assets.length === 0 ? (
          <p className="empty">Nothing uploaded yet.</p>
        ) : (
          <div className="media-grid">
            {assets.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`media-tile${selected?.id === a.id ? " on" : ""}`}
                onClick={() => setSelected(a)}
              >
                <img
                  src={mediaUrl(a.storageKey, "thumb")}
                  alt={a.translations.find((t) => t.localeCode === "en")?.alt || ""}
                  loading="lazy"
                  style={{
                    objectPosition: `${a.focalX * 100}% ${a.focalY * 100}%`,
                    backgroundImage: a.placeholder ? `url(${a.placeholder})` : undefined,
                  }}
                />
                {a.uses === 0 && <span className="media-flag">Unused</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <MediaDetail
          key={selected.id}
          asset={selected}
          locales={locales}
          canWrite={canWrite}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function Uploader() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    let ok = 0;
    for (const file of Array.from(files)) {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/media", { method: "POST", body });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(`${file.name}: ${payload.error ?? "upload failed"}`);
        break;
      }
      ok += 1;
    }
    setDone(ok);
    setBusy(false);
    if (ok > 0) window.location.reload();
  }

  return (
    <div className="uploader">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,image/tiff"
        multiple
        hidden
        onChange={(e) => upload(e.target.files)}
      />
      <button
        type="button"
        className="btn btn--pri"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? "Uploading…" : "Upload images"}
      </button>
      <span className="hint">JPEG, PNG, WebP, AVIF or TIFF. Up to 25 MB each.</span>
      {done > 0 && !busy && <span className="ok">{done} uploaded</span>}
      {error && (
        <span className="err" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function MediaDetail({
  asset,
  locales,
  canWrite,
  onClose,
}: {
  asset: Asset;
  locales: LocaleView[];
  canWrite: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState(locales[0]?.code ?? "en");
  const source = asset.translations.find((t) => t.localeCode === "en");
  const [focal, setFocal] = useState({ x: asset.focalX, y: asset.focalY });
  const [pending, start] = useTransition();
  const [removeError, setRemoveError] = useState<string | null>(null);

  return (
    <aside className="media-detail">
      <div className="card-head">
        <h2>Image</h2>
        <button type="button" className="ic" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div
        className="focal-pick"
        onClick={(e) => {
          if (!canWrite) return;
          const box = e.currentTarget.getBoundingClientRect();
          const x = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
          const y = Math.min(1, Math.max(0, (e.clientY - box.top) / box.height));
          setFocal({ x, y });
          start(async () => {
            await saveFocalPoint(asset.id, x, y);
          });
        }}
      >
        <img src={mediaUrl(asset.storageKey, "card")} alt="" />
        <span className="focal-dot" style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }} />
      </div>
      <p className="hint">
        Click to set the focal point. Every card crops this image differently — the focal point
        is what keeps a face in frame.
        {pending && " Saving…"}
      </p>

      <dl className="kv">
        <div>
          <dt>Size</dt>
          <dd>
            {asset.width} × {asset.height}
            {asset.bytes ? ` · ${Math.round(asset.bytes / 1024)} KB` : ""}
          </dd>
        </div>
        <div>
          <dt>Used in</dt>
          <dd>{asset.uses === 0 ? "Nowhere yet" : `${asset.uses} place${asset.uses === 1 ? "" : "s"}`}</dd>
        </div>
        {asset.uploadedBy && (
          <div>
            <dt>Uploaded by</dt>
            <dd>{asset.uploadedBy}</dd>
          </div>
        )}
        {asset.originalName && (
          <div>
            <dt>File</dt>
            <dd>
              <code>{asset.originalName}</code>
            </dd>
          </div>
        )}
      </dl>

      <div className="card-head">
        <h2>Alt text</h2>
        <LocaleTabs
          locales={locales}
          active={tab}
          onSelect={setTab}
          isTranslated={(code) =>
            Boolean(asset.translations.find((t) => t.localeCode === code)?.alt?.trim())
          }
        />
      </div>

      {locales
        .filter((l) => l.code === tab)
        .map((l) => (
          <AltForm
            key={l.code}
            mediaId={asset.id}
            locale={l}
            value={asset.translations.find((t) => t.localeCode === l.code)}
            source={l.isDefault ? undefined : source}
            canWrite={canWrite}
          />
        ))}

      {canWrite && (
        <div className="danger-zone">
          <button
            type="button"
            className="btn btn--sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await removeMedia(asset.id);
                if (result?.error) setRemoveError(result.error);
                else window.location.reload();
              })
            }
          >
            Delete image
          </button>
          {removeError && (
            <p className="err" role="alert">
              {removeError}
            </p>
          )}
        </div>
      )}
    </aside>
  );
}

function AltForm({
  mediaId,
  locale,
  value,
  source,
  canWrite,
}: {
  mediaId: string;
  locale: LocaleView;
  value?: { alt: string; caption: string | null };
  source?: { alt: string; caption: string | null };
  canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(saveAltText, null);
  const rtl = locale.direction === "rtl";
  const dir = rtl ? "rtl" : "ltr";

  return (
    <form action={action} className="form">
      <input type="hidden" name="mediaId" value={mediaId} />
      <input type="hidden" name="localeCode" value={locale.code} />
      <Field
        id={`alt-${locale.code}`}
        label="Alt text"
        source={source?.alt}
        rtl={rtl}
        hint="What the image shows, for screen readers and search. Leave empty only if it is purely decorative."
      >
        <input
          id={`alt-${locale.code}`}
          name="alt"
          className="inp"
          defaultValue={value?.alt ?? ""}
          dir={dir}
          lang={locale.code}
          disabled={!canWrite}
        />
      </Field>
      <Field id={`cap-${locale.code}`} label="Caption" source={source?.caption} rtl={rtl}>
        <input
          id={`cap-${locale.code}`}
          name="caption"
          className="inp"
          defaultValue={value?.caption ?? ""}
          dir={dir}
          lang={locale.code}
          disabled={!canWrite}
        />
      </Field>
      {canWrite && <SaveBar state={state} pending={pending} label={`Save ${locale.nativeName}`} />}
    </form>
  );
}

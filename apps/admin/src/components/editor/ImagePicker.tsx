"use client";

import { useState, useTransition } from "react";
import { mediaUrl } from "@fantazia/media";

export type PickerAsset = {
  id: string;
  storageKey: string;
  alt: string;
  focalX: number;
  focalY: number;
};

/**
 * Choose one image from the library. Deliberately not an upload control —
 * uploading belongs in Media, so every image gets alt text and a focal point
 * before it can be placed anywhere.
 */
export function ImagePicker({
  label,
  assets,
  selectedId,
  onSelect,
  canWrite,
  emptyHint,
}: {
  label: string;
  assets: PickerAsset[];
  selectedId: string | null;
  onSelect: (id: string | null) => Promise<void>;
  canWrite: boolean;
  emptyHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(selectedId);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const chosen = assets.find((a) => a.id === current) ?? null;

  const choose = (id: string | null) => {
    const previous = current;
    setCurrent(id);
    setOpen(false);
    setError(null);
    start(async () => {
      try {
        await onSelect(id);
      } catch {
        setCurrent(previous);
        setError("Could not save. Nothing changed.");
      }
    });
  };

  return (
    <div className="picker">
      <span className="picker-label">{label}</span>

      {chosen ? (
        <div className="picker-current">
          <img
            src={mediaUrl(chosen.storageKey, "card")}
            alt={chosen.alt}
            style={{ objectPosition: `${chosen.focalX * 100}% ${chosen.focalY * 100}%` }}
          />
          {canWrite && (
            <div className="picker-actions">
              <button type="button" className="btn btn--sm" onClick={() => setOpen((v) => !v)}>
                Change
              </button>
              <button type="button" className="btn btn--sm" onClick={() => choose(null)}>
                Remove
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="picker-empty">
          <p>{emptyHint ?? "No image chosen. The page falls back to a colour field."}</p>
          {canWrite && (
            <button type="button" className="btn btn--sm" onClick={() => setOpen((v) => !v)}>
              Choose image
            </button>
          )}
        </div>
      )}

      {pending && <span className="hint">Saving…</span>}
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}

      {open && (
        <div className="picker-grid">
          {assets.length === 0 ? (
            <p className="empty">Nothing in the library yet. Upload in Media first.</p>
          ) : (
            assets.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`media-tile${a.id === current ? " on" : ""}`}
                onClick={() => choose(a.id)}
                title={a.alt || undefined}
              >
                <img
                  src={mediaUrl(a.storageKey, "thumb")}
                  alt={a.alt}
                  loading="lazy"
                  style={{ objectPosition: `${a.focalX * 100}% ${a.focalY * 100}%` }}
                />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

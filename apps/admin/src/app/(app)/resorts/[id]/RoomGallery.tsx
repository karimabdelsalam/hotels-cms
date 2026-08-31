"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { mediaUrl } from "@fantazia/media";
import type { PickerAsset } from "@/components/editor/ImagePicker";
import { addRoomImage, removeRoomImage, moveRoomImage } from "./rooms";

/**
 * The photos on one room, in the order the site shows them.
 *
 * Images are chosen from the library rather than uploaded here, which is what
 * guarantees each one already has alt text and a focal point. The first photo
 * is the one the room card uses, so the order is stated plainly rather than
 * left to be discovered.
 */
export function RoomGallery({
  roomId,
  images,
  assets,
  canWrite,
}: {
  roomId: string;
  images: { id: string; storageKey: string; alt: string }[];
  assets: PickerAsset[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ error?: string } | { ok: true }>) =>
    start(async () => {
      setError(null);
      const outcome = await fn();
      if ("error" in outcome && outcome.error) {
        setError(outcome.error);
        return;
      }
      router.refresh();
    });

  const used = new Set(images.map((i) => i.id));
  const available = assets.filter((a) => !used.has(a.id));

  return (
    <div className="picker">
      <span className="picker-label">Photos</span>

      {images.length === 0 ? (
        <p className="hint">No photos yet. The room shows a colour panel until one is added.</p>
      ) : (
        <div className="picker-grid">
          {images.map((img, i) => (
            <figure key={img.id} className={`shot${i === 0 ? " shot--first" : ""}`}>
              <img src={mediaUrl(img.storageKey, "thumb", "webp")} alt={img.alt} />
              {i === 0 && <figcaption>On the card</figcaption>}
              {canWrite && (
                <div className="shot-ctrls">
                  <button
                    type="button"
                    className="ic"
                    title="Move earlier"
                    aria-label={`Move ${img.alt || "photo"} earlier`}
                    disabled={i === 0 || pending}
                    onClick={() => run(() => moveRoomImage(roomId, img.id, "up"))}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="ic"
                    title="Move later"
                    aria-label={`Move ${img.alt || "photo"} later`}
                    disabled={i === images.length - 1 || pending}
                    onClick={() => run(() => moveRoomImage(roomId, img.id, "down"))}
                  >
                    →
                  </button>
                  <button
                    type="button"
                    className="ic ic--del"
                    title="Take this photo off the room"
                    aria-label={`Remove ${img.alt || "photo"}`}
                    disabled={pending}
                    onClick={() => run(() => removeRoomImage(roomId, img.id))}
                  >
                    ✕
                  </button>
                </div>
              )}
            </figure>
          ))}
        </div>
      )}

      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}

      {canWrite && (
        <div className="picker-actions">
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => setOpen(!open)}
            disabled={pending}
          >
            {open ? "Close the library" : "Add a photo"}
          </button>
        </div>
      )}

      {open && canWrite && (
        available.length === 0 ? (
          <p className="hint">
            Every image in the library is already on this room. Upload more under Media.
          </p>
        ) : (
          <div className="picker-grid">
            {available.map((a) => (
              <button
                key={a.id}
                type="button"
                className="shot shot--pick"
                title={a.alt || "Untitled image"}
                disabled={pending}
                onClick={() => {
                  setOpen(false);
                  run(() => addRoomImage(roomId, a.id));
                }}
              >
                <img src={mediaUrl(a.storageKey, "thumb", "webp")} alt={a.alt} />
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}

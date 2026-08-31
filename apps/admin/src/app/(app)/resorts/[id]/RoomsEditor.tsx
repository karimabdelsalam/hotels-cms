"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/editor/Field";
import type { PickerAsset } from "@/components/editor/ImagePicker";
import { RoomGallery } from "./RoomGallery";
import { LocaleTabs, type LocaleView } from "@/components/editor/LocaleTabs";
import {
  saveRoomDetails,
  saveRoomTranslation,
  createRoom,
  deleteRoom,
  moveRoom,
} from "./rooms";

export type RoomTranslation = {
  localeCode: string;
  name: string;
  slug: string;
  description: string | null;
};

export type Room = {
  id: string;
  externalCode: string | null;
  maxAdults: number;
  maxChildren: number;
  maxOccupancy: number;
  sizeSqm: number | null;
  bedConfig: string | null;
  fromRateMinor: number | null;
  active: boolean;
  translations: RoomTranslation[];
  images: { id: string; storageKey: string; alt: string }[];
};

export function RoomsEditor({
  resortId,
  rooms,
  locales,
  currency,
  assets,
  canWrite,
}: {
  resortId: string;
  rooms: Room[];
  locales: LocaleView[];
  currency: string;
  assets: PickerAsset[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const add = () =>
    start(async () => {
      const id = await createRoom(resortId);
      setOpen(id);
      router.refresh();
    });

  return (
    <section className="card">
      <div className="card-head">
        <h2>Rooms</h2>
        {canWrite && (
          <button type="button" className="btn btn--sm" onClick={add} disabled={pending}>
            {pending ? "Adding…" : "Add a room"}
          </button>
        )}
      </div>

      {rooms.length === 0 ? (
        <p className="empty">No rooms yet.</p>
      ) : (
        <ul className="rows">
          {rooms.map((room, i) => (
            <RoomRow
              key={room.id}
              room={room}
              index={i}
              count={rooms.length}
              locales={locales}
              currency={currency}
              assets={assets}
              canWrite={canWrite}
              isOpen={open === room.id}
              onToggle={() => setOpen(open === room.id ? null : room.id)}
            />
          ))}
        </ul>
      )}

      <p className="note">
        The order here is the order on the site. A room that is switched off keeps its
        content but does not appear — which is how a room comes back for a season without
        being rebuilt.
      </p>
      <p className="note">
        PMS codes stay empty until the OPERA mapping is done, so content goes live without
        waiting for the integration. Once a code is set it must be unique within the resort,
        or availability would be ambiguous.
      </p>
    </section>
  );
}

function RoomRow({
  room,
  index,
  count,
  locales,
  currency,
  assets,
  canWrite,
  isOpen,
  onToggle,
}: {
  room: Room;
  index: number;
  count: number;
  locales: LocaleView[];
  currency: string;
  assets: PickerAsset[];
  canWrite: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const en = room.translations.find((t) => t.localeCode === "en");
  const name = en?.name?.trim() || "Untitled room";

  const run = (fn: () => Promise<{ error?: string } | void>) =>
    start(async () => {
      setError(null);
      const outcome = await fn();
      if (outcome && "error" in outcome && outcome.error) {
        setError(outcome.error);
        return;
      }
      router.refresh();
    });

  return (
    <li className="menu-item">
      <div className={`menu-row${room.active ? "" : " off"}`}>
        <span>
          <b>{name}</b>
          <code>
            Sleeps {room.maxOccupancy}
            {room.sizeSqm ? ` · ${room.sizeSqm} m²` : ""}
            {room.bedConfig ? ` · ${room.bedConfig}` : ""}
          </code>
        </span>
        <span className="ctrls">
          {!room.active && <span className="chip chip--warn">Switched off</span>}
          {!room.externalCode && <span className="chip">No PMS code</span>}
          {canWrite && (
            <>
              <button
                type="button"
                className="ic"
                title="Move up"
                aria-label={`Move ${name} up`}
                disabled={index === 0 || pending}
                onClick={() => run(() => moveRoom(room.id, "up"))}
              >
                ↑
              </button>
              <button
                type="button"
                className="ic"
                title="Move down"
                aria-label={`Move ${name} down`}
                disabled={index === count - 1 || pending}
                onClick={() => run(() => moveRoom(room.id, "down"))}
              >
                ↓
              </button>
              <button
                type="button"
                className="ic"
                aria-expanded={isOpen}
                onClick={onToggle}
              >
                {isOpen ? "Close" : "Edit"}
              </button>
              <button
                type="button"
                className="ic ic--del"
                title="Remove this room"
                aria-label={`Remove ${name}`}
                disabled={pending}
                onClick={() => setConfirming(true)}
              >
                ✕
              </button>
            </>
          )}
        </span>
      </div>

      {confirming && (
        // Deleting a room takes its translations and photo links with it, and
        // nothing restores them. Switching it off is almost always what was
        // meant, so that is offered right here.
        <div className="danger-zone">
          <p>
            Delete <b>{name}</b> for good? Its text in every language goes too. To take it
            off the site for a while, switch it off instead.
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Keep it
            </button>
            <button
              type="button"
              className="btn btn--sm btn--danger"
              disabled={pending}
              onClick={() => {
                setConfirming(false);
                run(() => deleteRoom(room.id));
              }}
            >
              {pending ? "Deleting…" : "Delete for good"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}

      {isOpen && (
        <RoomForms
          room={room}
          locales={locales}
          currency={currency}
          assets={assets}
          canWrite={canWrite}
        />
      )}
    </li>
  );
}

function RoomForms({
  room,
  locales,
  currency,
  assets,
  canWrite,
}: {
  room: Room;
  locales: LocaleView[];
  currency: string;
  assets: PickerAsset[];
  canWrite: boolean;
}) {
  const [tab, setTab] = useState(locales[0]?.code ?? "en");
  const source = room.translations.find((t) => t.localeCode === "en");

  return (
    <div className="menu-edit">
      <DetailsForm room={room} currency={currency} canWrite={canWrite} />

      <RoomGallery
        roomId={room.id}
        images={room.images}
        assets={assets}
        canWrite={canWrite}
      />

      <div className="card-head">
        <h3>Text</h3>
        <LocaleTabs
          locales={locales}
          active={tab}
          onSelect={setTab}
          isTranslated={(code) =>
            Boolean(room.translations.find((t) => t.localeCode === code)?.name?.trim())
          }
        />
      </div>

      {locales
        .filter((l) => l.code === tab)
        .map((l) => (
          <TranslationForm
            key={l.code}
            roomId={room.id}
            locale={l}
            value={room.translations.find((t) => t.localeCode === l.code)}
            source={l.isDefault ? undefined : source}
            canWrite={canWrite}
          />
        ))}
    </div>
  );
}

function DetailsForm({
  room,
  currency,
  canWrite,
}: {
  room: Room;
  currency: string;
  canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(saveRoomDetails, null);

  return (
    <form action={action} className="form">
      <input type="hidden" name="roomTypeId" value={room.id} />

      <div className="grid">
        <Field
          id={`adults-${room.id}`}
          label="Adults"
          hint="The most adults this room takes."
        >
          <input
            id={`adults-${room.id}`}
            name="maxAdults"
            className="inp"
            type="number"
            min={1}
            max={20}
            defaultValue={room.maxAdults}
            disabled={!canWrite}
          />
        </Field>

        <Field id={`children-${room.id}`} label="Children">
          <input
            id={`children-${room.id}`}
            name="maxChildren"
            className="inp"
            type="number"
            min={0}
            max={20}
            defaultValue={room.maxChildren}
            disabled={!canWrite}
          />
        </Field>

        <Field
          id={`occupancy-${room.id}`}
          label="Sleeps in total"
          hint="Shown on the site, and what the booking engine asks against."
        >
          <input
            id={`occupancy-${room.id}`}
            name="maxOccupancy"
            className="inp"
            type="number"
            min={1}
            max={30}
            defaultValue={room.maxOccupancy}
            disabled={!canWrite}
          />
        </Field>

        <Field id={`size-${room.id}`} label="Size (m²)" hint="Leave empty if not measured.">
          <input
            id={`size-${room.id}`}
            name="sizeSqm"
            className="inp"
            type="number"
            min={1}
            max={2000}
            defaultValue={room.sizeSqm ?? ""}
            disabled={!canWrite}
          />
        </Field>

        <Field id={`bed-${room.id}`} label="Beds" hint="e.g. one king, or twin beds.">
          <input
            id={`bed-${room.id}`}
            name="bedConfig"
            className="inp"
            defaultValue={room.bedConfig ?? ""}
            disabled={!canWrite}
          />
        </Field>

        <Field
          id={`rate-${room.id}`}
          label={`From, per night (${currency})`}
          hint={`An indicative "from" price. The site rounds it to whole ${currency}. Empty means no price is shown.`}
        >
          <input
            id={`rate-${room.id}`}
            name="fromRate"
            className="inp"
            type="number"
            min={0}
            step="0.01"
            defaultValue={room.fromRateMinor != null ? room.fromRateMinor / 100 : ""}
            disabled={!canWrite}
          />
        </Field>

        <Field
          id={`code-${room.id}`}
          label="PMS code"
          hint="The OPERA room type code. Leave empty until the mapping is done."
        >
          <input
            id={`code-${room.id}`}
            name="externalCode"
            className="inp mono"
            defaultValue={room.externalCode ?? ""}
            disabled={!canWrite}
          />
        </Field>
      </div>

      <label className="toggle-wrap">
        <input
          type="checkbox"
          name="active"
          defaultChecked={room.active}
          disabled={!canWrite}
        />
        <span>Show this room on the site</span>
      </label>

      {canWrite && (
        <div className="form-foot">
          <button className="btn btn--pri" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save room"}
          </button>
          {state?.error && (
            <p className="err" role="alert">
              {state.error}
            </p>
          )}
          {state?.ok && (
            <p className="ok" role="status">
              Saved
            </p>
          )}
        </div>
      )}
    </form>
  );
}

function TranslationForm({
  roomId,
  locale,
  value,
  source,
  canWrite,
}: {
  roomId: string;
  locale: LocaleView;
  value?: RoomTranslation;
  source?: RoomTranslation;
  canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(saveRoomTranslation, null);
  const rtl = locale.direction === "rtl";

  return (
    <form action={action} className="form">
      <input type="hidden" name="roomTypeId" value={roomId} />
      <input type="hidden" name="localeCode" value={locale.code} />

      <Field id={`rname-${roomId}-${locale.code}`} label="Name" source={source?.name} rtl={rtl}>
        <input
          id={`rname-${roomId}-${locale.code}`}
          name="name"
          className="inp"
          defaultValue={value?.name ?? ""}
          dir={rtl ? "rtl" : "ltr"}
          lang={locale.code}
          required
          disabled={!canWrite}
        />
      </Field>

      <Field
        id={`rslug-${roomId}-${locale.code}`}
        label="Slug"
        hint="Rooms have no page of their own yet. Left empty, one is made from the name."
      >
        <input
          id={`rslug-${roomId}-${locale.code}`}
          name="slug"
          className="inp mono"
          defaultValue={value?.slug ?? ""}
          disabled={!canWrite}
        />
      </Field>

      <Field
        id={`rdesc-${roomId}-${locale.code}`}
        label="Description"
        source={source?.description}
        rtl={rtl}
      >
        <textarea
          id={`rdesc-${roomId}-${locale.code}`}
          name="description"
          className="inp"
          rows={4}
          defaultValue={value?.description ?? ""}
          dir={rtl ? "rtl" : "ltr"}
          lang={locale.code}
          disabled={!canWrite}
        />
      </Field>

      {canWrite && (
        <div className="form-foot">
          <button className="btn btn--pri" type="submit" disabled={pending}>
            {pending ? "Saving…" : `Save ${locale.nativeName}`}
          </button>
          {state?.error && (
            <p className="err" role="alert">
              {state.error}
            </p>
          )}
          {state?.ok && (
            <p className="ok" role="status">
              Saved
            </p>
          )}
        </div>
      )}
    </form>
  );
}

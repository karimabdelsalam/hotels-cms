"use client";

import { useTransition } from "react";
import { selectRoom } from "./actions";

/** One button per room-and-rate, carrying the whole selection with it. */
export function SelectRoom(props: {
  locale: string;
  resortId: string;
  roomTypeId: string;
  ratePlanId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  childrenCount: number;
  rooms: number;
  label: string;
}) {
  const [pending, start] = useTransition();

  return (
    <form
      action={(formData) => start(() => selectRoom(formData))}
    >
      <input type="hidden" name="locale" value={props.locale} />
      <input type="hidden" name="resortId" value={props.resortId} />
      <input type="hidden" name="roomTypeId" value={props.roomTypeId} />
      <input type="hidden" name="ratePlanId" value={props.ratePlanId} />
      <input type="hidden" name="checkIn" value={props.checkIn} />
      <input type="hidden" name="checkOut" value={props.checkOut} />
      <input type="hidden" name="adults" value={props.adults} />
      <input type="hidden" name="children" value={props.childrenCount} />
      <input type="hidden" name="rooms" value={props.rooms} />
      <button className="btn btn--coral btn--sm" type="submit" disabled={pending}>
        {props.label}
      </button>
    </form>
  );
}

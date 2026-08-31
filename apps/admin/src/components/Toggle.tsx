"use client";

import { useState, useTransition } from "react";

/**
 * Optimistic on the switch, honest on failure: if the action rejects, the
 * switch returns to where it was and says why.
 */
export function Toggle({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: (next: boolean) => Promise<void>;
}) {
  const [on, setOn] = useState(checked);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="toggle-wrap">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={`toggle${on ? " on" : ""}`}
        disabled={pending}
        onClick={() => {
          const next = !on;
          setOn(next);
          setError(null);
          start(async () => {
            try {
              await onToggle(next);
            } catch {
              setOn(!next);
              setError("Could not save. Nothing changed.");
            }
          });
        }}
      >
        <span className="knob" />
      </button>
      {error && <span className="toggle-err">{error}</span>}
    </div>
  );
}

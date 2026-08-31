import type { ReactNode } from "react";

/**
 * A labelled field that can show the English source beside it, so a translator
 * never works blind.
 */
export function Field({
  id,
  label,
  source,
  hint,
  rtl,
  children,
}: {
  id: string;
  label: string;
  source?: string | null;
  hint?: string;
  rtl?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
      {source && (
        <span className="source" dir="ltr">
          <em>English:</em> {source}
        </span>
      )}
      {rtl && <span className="hint">Right to left</span>}
    </div>
  );
}

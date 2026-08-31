"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { submitCode } from "../actions";

export function CodeForm({ recoveryCodesLeft }: { recoveryCodesLeft: number }) {
  const [state, action, pending] = useActionState(submitCode, null);
  const [recovery, setRecovery] = useState(false);

  return (
    <form action={action} className="auth-form">
      <p className="note">
        {recovery
          ? "Enter one of the recovery codes you saved when you set this up. Each one works once."
          : "Enter the six-digit code from your authenticator app."}
      </p>

      <div className="field">
        <label htmlFor="code">{recovery ? "Recovery code" : "Code"}</label>
        <input
          id="code"
          name="code"
          className="inp mono"
          required
          autoFocus
          // A password manager must not try to fill a one-time code, and the
          // numeric keypad matters on a phone.
          autoComplete="one-time-code"
          inputMode={recovery ? "text" : "numeric"}
          pattern={recovery ? undefined : "[0-9 ]*"}
          placeholder={recovery ? "XXXXX-XXXXX" : "000000"}
          key={recovery ? "recovery" : "totp"}
        />
      </div>

      {state?.error && (
        <p className="err" role="alert">
          {state.error}
        </p>
      )}

      <button className="btn btn--pri" type="submit" disabled={pending}>
        {pending ? "Checking…" : "Continue"}
      </button>

      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={() => setRecovery(!recovery)}
      >
        {recovery ? "Use my authenticator app instead" : "I do not have my phone"}
      </button>

      {recovery && recoveryCodesLeft === 0 && (
        <p className="err">
          This account has no recovery codes left. An administrator will need to turn the
          second step off for you.
        </p>
      )}

      <Link className="hint" href="/login">
        Start again
      </Link>
    </form>
  );
}

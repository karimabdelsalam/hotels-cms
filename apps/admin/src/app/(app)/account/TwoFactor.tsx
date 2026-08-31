"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  startEnrolment,
  confirmEnrolment,
  disableTwoFactor,
  regenerateRecoveryCodes,
} from "./actions";

type Enrolling = { secret: string; readable: string; qr: string };

export function TwoFactor({
  enabled,
  enabledAt,
  recoveryCodesLeft,
}: {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesLeft: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState<Enrolling | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [password, setPassword] = useState("");
  const [confirming, setConfirming] = useState<"disable" | "regenerate" | null>(null);

  const begin = () =>
    start(async () => {
      setError(null);
      const outcome = await startEnrolment();
      if ("error" in outcome) return setError(outcome.error);
      setEnrolling({ secret: outcome.secret, readable: outcome.readable, qr: outcome.qr });
    });

  const confirm = () =>
    start(async () => {
      setError(null);
      if (!enrolling) return;
      const outcome = await confirmEnrolment(enrolling.secret, code);
      if ("error" in outcome) return setError(outcome.error);
      setEnrolling(null);
      setCode("");
      setCodes(outcome.recoveryCodes);
      router.refresh();
    });

  const withPassword = (which: "disable" | "regenerate") =>
    start(async () => {
      setError(null);
      if (which === "disable") {
        const outcome = await disableTwoFactor(password);
        if ("error" in outcome) return setError(outcome.error);
        setCodes(null);
      } else {
        const outcome = await regenerateRecoveryCodes(password);
        if ("error" in outcome) return setError(outcome.error);
        // Straight onto the screen: this is the only time they exist in plain.
        setCodes(outcome.recoveryCodes);
      }
      setPassword("");
      setConfirming(null);
      router.refresh();
    });

  // Shown once, immediately after they are made. Nothing can show them again,
  // which is the point — so this takes over the card until it is dismissed.
  if (codes) {
    return (
      <section className="card">
        <h2>Save these recovery codes</h2>
        <p className="note">
          <b>This is the only time they are shown.</b> They are stored hashed, so nobody —
          including us — can read them back. Each one gets you in once if your phone is
          gone. Print them, or put them somewhere that is not your phone.
        </p>
        <ul className="codes">
          {codes.map((c) => (
            <li key={c}>
              <code>{c}</code>
            </li>
          ))}
        </ul>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => navigator.clipboard?.writeText(codes.join("\n"))}
          >
            Copy all
          </button>
          <button type="button" className="btn btn--pri btn--sm" onClick={() => setCodes(null)}>
            I have saved them
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Two-step sign-in</h2>
        {enabled ? (
          <span className="chip chip--ok">On</span>
        ) : (
          <span className="chip chip--warn">Off</span>
        )}
      </div>

      {enabled ? (
        <>
          <p className="note">
            On since {enabledAt}. Signing in asks for a code from your authenticator app
            after your password.
          </p>
          <p className={recoveryCodesLeft <= 2 ? "err" : "note"}>
            {recoveryCodesLeft === 0
              ? "No recovery codes left. If you lose your phone you will need another administrator to turn this off for you — make new codes now."
              : `${recoveryCodesLeft} recovery code${recoveryCodesLeft === 1 ? "" : "s"} left.`}
          </p>

          {confirming ? (
            <div className="danger-zone">
              <p>
                {confirming === "disable"
                  ? "Turning this off removes your recovery codes too, so an old printout cannot get back in later. Enter your password to confirm."
                  : "Making new codes cancels the old ones immediately. Enter your password to confirm."}
              </p>
              <div className="field">
                <label htmlFor="pw">Your password</label>
                <input
                  id="pw"
                  type="password"
                  className="inp"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && (
                <p className="err" role="alert">
                  {error}
                </p>
              )}
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => {
                    setConfirming(null);
                    setPassword("");
                    setError(null);
                  }}
                  disabled={pending}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`btn btn--sm ${confirming === "disable" ? "btn--danger" : "btn--pri"}`}
                  disabled={pending || !password}
                  onClick={() => withPassword(confirming)}
                >
                  {pending
                    ? "Working…"
                    : confirming === "disable"
                      ? "Turn it off"
                      : "Make new codes"}
                </button>
              </div>
            </div>
          ) : (
            <div className="btn-row">
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => setConfirming("regenerate")}
              >
                New recovery codes
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setConfirming("disable")}
              >
                Turn two-step off
              </button>
            </div>
          )}
        </>
      ) : enrolling ? (
        <>
          <p className="note">
            Scan this with your authenticator app, then type the code it shows to prove it
            worked. Nothing is switched on until that code checks out.
          </p>
          <div className="enrol">
            <div className="qr" dangerouslySetInnerHTML={{ __html: enrolling.qr }} />
            <div className="enrol-manual">
              <span className="picker-label">Cannot scan?</span>
              <p className="hint">Type this into your app by hand:</p>
              <code className="secret">{enrolling.readable}</code>
            </div>
          </div>

          <div className="field">
            <label htmlFor="enrol-code">The six-digit code</label>
            <input
              id="enrol-code"
              className="inp mono"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>

          {error && (
            <p className="err" role="alert">
              {error}
            </p>
          )}

          <div className="btn-row">
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => {
                setEnrolling(null);
                setCode("");
                setError(null);
              }}
              disabled={pending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--pri btn--sm"
              onClick={confirm}
              disabled={pending || code.replace(/\D/g, "").length !== 6}
            >
              {pending ? "Checking…" : "Turn it on"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="note">
            A code from your phone, on top of your password. This account can publish the
            group&apos;s website and read the audit log, so a leaked password should not be
            enough on its own.
          </p>
          {error && (
            <p className="err" role="alert">
              {error}
            </p>
          )}
          <div className="btn-row">
            <button type="button" className="btn btn--pri btn--sm" onClick={begin} disabled={pending}>
              {pending ? "Preparing…" : "Set it up"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

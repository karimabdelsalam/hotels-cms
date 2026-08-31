"use client";

import { useActionState } from "react";
import { signIn } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, null);

  return (
    <form action={action} className="auth-form">
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="inp" required autoComplete="email" autoFocus />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          className="inp"
          required
          autoComplete="current-password"
        />
      </div>
      {state?.error && (
        <p className="err" role="alert">
          {state.error}
        </p>
      )}
      <button className="btn btn--pri" type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

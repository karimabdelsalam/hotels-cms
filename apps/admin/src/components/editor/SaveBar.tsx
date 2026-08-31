export type ActionState = { error?: string; ok?: true; savedAt?: number } | null;

export function SaveBar({
  state,
  pending,
  label,
  disabled,
}: {
  state: ActionState;
  pending: boolean;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="form-foot">
      <button className="btn btn--pri" type="submit" disabled={pending || disabled}>
        {pending ? "Saving…" : label}
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
  );
}

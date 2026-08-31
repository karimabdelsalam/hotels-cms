"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/editor/Field";
import { SaveBar } from "@/components/editor/SaveBar";
import {
  saveEnvironment,
  setEnvironmentEnabled,
  saveResortIntegration,
  setResortIntegrationEnabled,
  testConnection,
} from "./actions";

export type EnvironmentView = {
  id: string;
  name: string;
  integrationType: string;
  endpoint: string;
  chainCode: string | null;
  environment: string;
  credentialRef: string;
  enabled: boolean;
  circuitState: string;
  lastErrorAt: string | null;
  lastErrorSummary: string | null;
  usedBy: number;
};

export type ResortView = {
  id: string;
  name: string;
  code: string;
  environmentId: string | null;
  operaResortCode: string | null;
  bookingMode: string;
  enabled: boolean;
  syncStatus: string;
  lastSyncAt: string | null;
};

export type CallView = {
  id: string;
  operation: string;
  connector: string;
  status: string;
  errorCode: string | null;
  durationMs: number | null;
  resort: string | null;
  createdAt: string;
};

const TYPE_LABELS: Record<string, string> = {
  simulator: "Simulator (no property system is contacted)",
  ows: "OPERA Web Services",
  oxi: "OXI",
  channel_manager: "Channel manager",
};

const stamp = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

export function Integrations({
  environments,
  resorts,
  recentCalls,
}: {
  environments: EnvironmentView[];
  resorts: ResortView[];
  recentCalls: CallView[];
}) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="editor">
      <section className="card">
        <h2>How this works</h2>
        <p className="note">
          A <b>connection</b> is one endpoint and one set of credentials. Each resort points
          at a connection and adds its own OPERA resort code — that code is what makes one
          connection serve three properties.
        </p>
        <p className="note">
          Passwords are never stored here. The connection names a credential, and the
          matching values live in the server&apos;s environment: a reference of{" "}
          <code>OPERA_PROD</code> reads <code>OPERA_PROD_USERNAME</code> and{" "}
          <code>OPERA_PROD_PASSWORD</code>. A password typed into a web form ends up in every
          database backup.
        </p>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Connections</h2>
          <button type="button" className="btn btn--sm" onClick={() => setEditing("new")}>
            Add a connection
          </button>
        </div>

        {environments.length === 0 && editing !== "new" && (
          <p className="empty">No connection is set up.</p>
        )}

        <ul className="rows">
          {environments.map((env) => (
            <EnvironmentRow
              key={env.id}
              environment={env}
              isEditing={editing === env.id}
              onEdit={() => setEditing(editing === env.id ? null : env.id)}
            />
          ))}
        </ul>

        {editing === "new" && (
          <EnvironmentForm environment={null} onDone={() => setEditing(null)} />
        )}
      </section>

      <section className="card">
        <h2>Resorts</h2>
        <ul className="rows">
          {resorts.map((resort) => (
            <ResortRow key={resort.id} resort={resort} environments={environments} />
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Recent calls</h2>
        {recentCalls.length === 0 ? (
          <p className="note">Nothing has been sent to a property system yet.</p>
        ) : (
          <div className="scroller">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Resort</th>
                  <th>Operation</th>
                  <th>Result</th>
                  <th className="num">Time</th>
                </tr>
              </thead>
              <tbody>
                {recentCalls.map((call) => (
                  <tr key={call.id}>
                    <td>{stamp(call.createdAt)}</td>
                    <td>{call.resort ?? "—"}</td>
                    <td>
                      <code>{call.operation}</code>
                    </td>
                    <td>
                      <span className={`chip${call.status === "ok" ? " chip--ok" : call.status.includes("error") || call.status === "rejected" ? " chip--warn" : ""}`}>
                        {call.status}
                        {call.errorCode ? ` · ${call.errorCode}` : ""}
                      </span>
                    </td>
                    <td className="num">{call.durationMs != null ? `${call.durationMs}ms` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function EnvironmentRow({
  environment,
  isEditing,
  onEdit,
}: {
  environment: EnvironmentView;
  isEditing: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = () =>
    start(async () => {
      setError(null);
      const outcome = await setEnvironmentEnabled(environment.id, !environment.enabled);
      if ("error" in outcome && outcome.error) return setError(outcome.error);
      router.refresh();
    });

  return (
    <li className="menu-item">
      <div className={`menu-row${environment.enabled ? "" : " off"}`}>
        <span>
          <b>{environment.name}</b>
          <code>
            {TYPE_LABELS[environment.integrationType] ?? environment.integrationType} ·{" "}
            {environment.environment} · {environment.endpoint}
          </code>
        </span>
        <span className="ctrls">
          {environment.circuitState !== "closed" && (
            <span className="chip chip--danger">Breaker {environment.circuitState}</span>
          )}
          <span className={`chip${environment.enabled ? " chip--ok" : ""}`}>
            {environment.enabled ? "On" : "Off"}
          </span>
          <button type="button" className="ic" onClick={onEdit} aria-expanded={isEditing}>
            {isEditing ? "Close" : "Edit"}
          </button>
          <button type="button" className="btn btn--sm" onClick={toggle} disabled={pending}>
            {pending ? "…" : environment.enabled ? "Switch off" : "Switch on"}
          </button>
        </span>
      </div>

      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}

      {environment.lastErrorSummary && (
        <p className="hint">
          Last error {environment.lastErrorAt ? stamp(environment.lastErrorAt) : ""}:{" "}
          {environment.lastErrorSummary}
        </p>
      )}

      {isEditing && <EnvironmentForm environment={environment} onDone={onEdit} />}
    </li>
  );
}

function EnvironmentForm({
  environment,
  onDone,
}: {
  environment: EnvironmentView | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (prev: unknown, formData: FormData) => {
    const result = await saveEnvironment(prev, formData);
    if ("ok" in result) {
      router.refresh();
      onDone();
    }
    return result;
  }, null);

  // Controlled, not defaultValue. A rejected submit re-renders this form, and
  // with uncontrolled inputs everything typed was wiped — you fixed the one
  // field the message complained about and lost the other five. On a form
  // whose whole point is careful configuration that is worse than no
  // validation at all.
  const [form, setForm] = useState({
    name: environment?.name ?? "",
    integrationType: environment?.integrationType ?? "simulator",
    endpoint: environment?.endpoint ?? "",
    chainCode: environment?.chainCode ?? "",
    environment: environment?.environment ?? "test",
    credentialRef: environment?.credentialRef ?? "",
  });
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <form action={action} className="menu-edit">
      {environment && <input type="hidden" name="id" value={environment.id} />}

      <div className="grid">
        <Field id="env-name" label="Name" hint="How you will recognise it. “OPERA production”.">
          <input
            id="env-name"
            name="name"
            className="inp"
            value={form.name}
            onChange={(e) => set("name")(e.target.value)}
            required
          />
        </Field>

        <Field id="env-type" label="Kind">
          <select
            id="env-type"
            name="integrationType"
            className="inp"
            value={form.integrationType}
            onChange={(e) => set("integrationType")(e.target.value)}
          >
            {Object.entries(TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          id="env-endpoint"
          label="Endpoint"
          hint={
            form.integrationType === "ows"
              ? "Must be https — the credential travels on it."
              : "Where to reach it."
          }
        >
          <input
            id="env-endpoint"
            name="endpoint"
            className="inp mono"
            value={form.endpoint}
            onChange={(e) => set("endpoint")(e.target.value)}
            required
          />
        </Field>

        <Field id="env-chain" label="Chain code" hint="Optional. From your OPERA configuration.">
          <input
            id="env-chain"
            name="chainCode"
            className="inp mono"
            value={form.chainCode}
            onChange={(e) => set("chainCode")(e.target.value)}
          />
        </Field>

        <Field id="env-environment" label="Environment" hint="Test first. Always.">
          <select
            id="env-environment"
            name="environment"
            className="inp"
            value={form.environment}
            onChange={(e) => set("environment")(e.target.value)}
          >
            <option value="test">Test</option>
            <option value="production">Production</option>
          </select>
        </Field>

        <Field
          id="env-credential"
          label="Credential reference"
          hint="Names environment variables on the server, e.g. OPERA_PROD reads OPERA_PROD_USERNAME and OPERA_PROD_PASSWORD."
        >
          <input
            id="env-credential"
            name="credentialRef"
            className="inp mono"
            value={form.credentialRef}
            onChange={(e) => set("credentialRef")(e.target.value)}
            placeholder="OPERA_PROD"
            required
          />
        </Field>
      </div>

      <p className="note">
        A new connection is created switched off. Switching it on runs a health check first —
        enabling one that does not answer means every booking from that moment lands in the
        review queue.
      </p>

      <div className="btn-row">
        <button type="button" className="btn btn--sm" onClick={onDone} disabled={pending}>
          Cancel
        </button>
      </div>
      <SaveBar state={state as never} pending={pending} label="Save connection" />
    </form>
  );
}

function ResortRow({
  resort,
  environments,
}: {
  resort: ResortView;
  environments: EnvironmentView[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null);
  const [state, action, saving] = useActionState(async (prev: unknown, formData: FormData) => {
    const result = await saveResortIntegration(prev, formData);
    if ("ok" in result) {
      router.refresh();
      setOpen(false);
    }
    return result;
  }, null);

  const linked = environments.find((e) => e.id === resort.environmentId);

  // Controlled for the same reason as the connection form above: a refused
  // save must not throw away the choice that was just made.
  const [form, setForm] = useState({
    environmentId: resort.environmentId ?? "",
    operaResortCode: resort.operaResortCode ?? resort.code,
    bookingMode: resort.bookingMode,
  });

  const toggle = () =>
    start(async () => {
      setMessage(null);
      const outcome = await setResortIntegrationEnabled(resort.id, !resort.enabled);
      if ("error" in outcome && outcome.error) return setMessage({ error: outcome.error });
      router.refresh();
    });

  const test = () =>
    start(async () => {
      setMessage(null);
      const outcome = await testConnection(resort.id);
      setMessage("error" in outcome ? { error: outcome.error } : { ok: outcome.message });
      router.refresh();
    });

  return (
    <li className="menu-item">
      <div className={`menu-row${resort.enabled ? "" : " off"}`}>
        <span>
          <b>{resort.name}</b>
          <code>
            {linked ? linked.name : "no connection"}
            {resort.operaResortCode ? ` · resort code ${resort.operaResortCode}` : ""} ·{" "}
            {resort.bookingMode === "live" ? "live availability" : "from the snapshot"}
          </code>
        </span>
        <span className="ctrls">
          {!resort.enabled && <span className="chip chip--warn">Takes no bookings</span>}
          {resort.enabled && <span className="chip chip--ok">Taking bookings</span>}
          <button type="button" className="ic" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? "Close" : "Edit"}
          </button>
          {resort.environmentId && (
            <button type="button" className="btn btn--sm" onClick={test} disabled={pending}>
              {pending ? "…" : "Test"}
            </button>
          )}
          <button type="button" className="btn btn--sm" onClick={toggle} disabled={pending || !resort.environmentId}>
            {resort.enabled ? "Stop bookings" : "Take bookings"}
          </button>
        </span>
      </div>

      {message?.error && (
        <p className="err" role="alert">
          {message.error}
        </p>
      )}
      {message?.ok && (
        <p className="ok" role="status">
          {message.ok}
        </p>
      )}

      {open && (
        <form action={action} className="menu-edit">
          <input type="hidden" name="resortId" value={resort.id} />
          <div className="grid">
            <Field id={`env-${resort.id}`} label="Connection">
              <select
                id={`env-${resort.id}`}
                name="environmentId"
                className="inp"
                value={form.environmentId}
                onChange={(e) => setForm((c) => ({ ...c, environmentId: e.target.value }))}
                required
              >
                <option value="">Choose…</option>
                {environments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {e.enabled ? "" : " — switched off"}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              id={`code-${resort.id}`}
              label="OPERA resort code"
              hint="What tells one property from another on a shared installation."
            >
              <input
                id={`code-${resort.id}`}
                name="operaResortCode"
                className="inp mono"
                value={form.operaResortCode}
                onChange={(e) => setForm((c) => ({ ...c, operaResortCode: e.target.value }))}
              />
            </Field>

            <Field
              id={`mode-${resort.id}`}
              label="Availability"
              hint="The snapshot keeps search working through an OPERA outage. Live asks the PMS on every search."
            >
              <select
                id={`mode-${resort.id}`}
                name="bookingMode"
                className="inp"
                value={form.bookingMode}
                onChange={(e) => setForm((c) => ({ ...c, bookingMode: e.target.value }))}
              >
                <option value="snapshot">From the snapshot (recommended)</option>
                <option value="live">Live from the property system</option>
              </select>
            </Field>
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn--sm" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </button>
          </div>
          <SaveBar state={state as never} pending={saving} label="Save" />
        </form>
      )}
    </li>
  );
}

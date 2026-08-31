"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/editor/Field";
import { SaveBar } from "@/components/editor/SaveBar";
import { LocaleTabs, type LocaleView } from "@/components/editor/LocaleTabs";
import {
  saveRatePlan, saveRatePlanText, createRatePlan, deleteRatePlan, savePolicy, deletePolicy,
} from "./actions";

export type PolicyView = {
  id: string;
  type: string;
  freeUntilDays: number | null;
  freeUntilTime: string | null;
  penaltyType: string | null;
  penaltyValue: number | null;
  usedBy: number;
  summaryEn: string;
  summaryAr: string;
};

export type PlanView = {
  id: string;
  externalCode: string | null;
  mealPlan: string;
  policyId: string | null;
  minStay: number | null;
  maxStay: number | null;
  advanceDays: number | null;
  isPublic: boolean;
  active: boolean;
  roomTypeCount: number;
  bookingCount: number;
  translations: { localeCode: string; name: string; description: string | null }[];
};

export type ResortView = {
  id: string;
  name: string;
  currency: string;
  plans: PlanView[];
  policies: PolicyView[];
};

const MEALS: Record<string, string> = {
  room_only: "Room only",
  bed_and_breakfast: "Bed & breakfast",
  half_board: "Half board",
  full_board: "Full board",
  all_inclusive: "All inclusive",
};

const POLICY_TYPES: Record<string, string> = {
  free_until: "Free until a date",
  non_refundable: "Non-refundable",
  partial: "Partial refund",
  custom: "Something else",
};

export function Rates({
  resorts,
  locales,
  canWrite,
}: {
  resorts: ResortView[];
  locales: LocaleView[];
  canWrite: boolean;
}) {
  const [active, setActive] = useState(resorts[0]?.id ?? "");
  const resort = resorts.find((r) => r.id === active) ?? resorts[0];

  if (!resort) return <p className="note">You have access to no resorts.</p>;

  return (
    <div className="editor">
      {resorts.length > 1 && (
        <div className="tabs" role="tablist">
          {resorts.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={r.id === resort.id}
              onClick={() => setActive(r.id)}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}

      <RatePlans key={`${resort.id}-plans`} resort={resort} locales={locales} canWrite={canWrite} />
      <Policies key={`${resort.id}-policies`} resort={resort} canWrite={canWrite} />
    </div>
  );
}

function RatePlans({
  resort,
  locales,
  canWrite,
}: {
  resort: ResortView;
  locales: LocaleView[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const add = () =>
    start(async () => {
      setError(null);
      const id = await createRatePlan(resort.id);
      setOpen(id);
      router.refresh();
    });

  return (
    <section className="card">
      <div className="card-head">
        <h2>Rate plans</h2>
        {canWrite && (
          <button type="button" className="btn btn--sm" onClick={add} disabled={pending}>
            {pending ? "Adding…" : "Add a rate plan"}
          </button>
        )}
      </div>

      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}

      {resort.plans.length === 0 ? (
        <p className="empty">No rate plans. Nothing can be booked here until there is one.</p>
      ) : (
        <ul className="rows">
          {resort.plans.map((plan) => (
            <PlanRow
              key={plan.id}
              plan={plan}
              resort={resort}
              locales={locales}
              canWrite={canWrite}
              isOpen={open === plan.id}
              onToggle={() => setOpen(open === plan.id ? null : plan.id)}
              onError={setError}
            />
          ))}
        </ul>
      )}

      <p className="note">
        A plan that is switched off keeps every booking made on it and stops appearing in
        search. That is almost always what is wanted rather than deleting one.
      </p>
    </section>
  );
}

function PlanRow({
  plan,
  resort,
  locales,
  canWrite,
  isOpen,
  onToggle,
  onError,
}: {
  plan: PlanView;
  resort: ResortView;
  locales: LocaleView[];
  canWrite: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const en = plan.translations.find((t) => t.localeCode === "en");
  const name = en?.name?.trim() || "Untitled plan";

  const remove = () =>
    start(async () => {
      onError(null);
      const outcome = await deleteRatePlan(plan.id);
      if ("error" in outcome && outcome.error) {
        setConfirming(false);
        return onError(outcome.error);
      }
      router.refresh();
    });

  return (
    <li className="menu-item">
      <div className={`menu-row${plan.active ? "" : " off"}`}>
        <span>
          <b>{name}</b>
          <code>
            {MEALS[plan.mealPlan] ?? plan.mealPlan}
            {plan.externalCode ? ` · ${plan.externalCode}` : ""}
            {plan.minStay ? ` · min ${plan.minStay} nights` : ""}
            {plan.roomTypeCount > 0 ? ` · ${plan.roomTypeCount} room types` : " · no rooms attached"}
          </code>
        </span>
        <span className="ctrls">
          {!plan.active && <span className="chip chip--warn">Off</span>}
          {!plan.isPublic && <span className="chip">By code only</span>}
          {!plan.externalCode && <span className="chip">No PMS code</span>}
          {plan.bookingCount > 0 && <span className="chip chip--ok">{plan.bookingCount} booked</span>}
          {canWrite && (
            <>
              <button type="button" className="ic" onClick={onToggle} aria-expanded={isOpen}>
                {isOpen ? "Close" : "Edit"}
              </button>
              <button
                type="button"
                className="ic ic--del"
                onClick={() => setConfirming(true)}
                disabled={pending}
                aria-label={`Remove ${name}`}
              >
                ✕
              </button>
            </>
          )}
        </span>
      </div>

      {confirming && (
        <div className="danger-zone">
          <p>
            Delete <b>{name}</b>? Switching it off keeps the bookings made on it and takes it
            out of search, which is usually what is meant.
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn--sm" onClick={() => setConfirming(false)} disabled={pending}>
              Keep it
            </button>
            <button type="button" className="btn btn--danger btn--sm" onClick={remove} disabled={pending}>
              {pending ? "Deleting…" : "Delete it"}
            </button>
          </div>
        </div>
      )}

      {isOpen && canWrite && (
        <PlanForms plan={plan} resort={resort} locales={locales} />
      )}
    </li>
  );
}

function PlanForms({
  plan,
  resort,
  locales,
}: {
  plan: PlanView;
  resort: ResortView;
  locales: LocaleView[];
}) {
  const [tab, setTab] = useState(locales[0]?.code ?? "en");
  const [state, action, pending] = useActionState(saveRatePlan, null);
  const source = plan.translations.find((t) => t.localeCode === "en");

  return (
    <div className="menu-edit">
      <form action={action} className="form">
        <input type="hidden" name="ratePlanId" value={plan.id} />
        <div className="grid">
          <Field id={`meal-${plan.id}`} label="Meals">
            <select id={`meal-${plan.id}`} name="mealPlan" className="inp" defaultValue={plan.mealPlan}>
              {Object.entries(MEALS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </Field>

          <Field
            id={`code-${plan.id}`}
            label="PMS rate code"
            hint="The OPERA rate code. Leave empty until the mapping is done."
          >
            <input id={`code-${plan.id}`} name="externalCode" className="inp mono" defaultValue={plan.externalCode ?? ""} />
          </Field>

          <Field id={`policy-${plan.id}`} label="Cancellation" hint="Shown at checkout and in the confirmation email.">
            <select id={`policy-${plan.id}`} name="policyId" className="inp" defaultValue={plan.policyId ?? ""}>
              <option value="">No policy — nothing is shown to the guest</option>
              {resort.policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.summaryEn.slice(0, 70)}
                  {p.summaryEn.length > 70 ? "…" : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field id={`min-${plan.id}`} label="Minimum nights" hint="Empty means no minimum.">
            <input id={`min-${plan.id}`} name="minStay" className="inp" type="number" min={1} max={365} defaultValue={plan.minStay ?? ""} />
          </Field>

          <Field id={`max-${plan.id}`} label="Maximum nights">
            <input id={`max-${plan.id}`} name="maxStay" className="inp" type="number" min={1} max={365} defaultValue={plan.maxStay ?? ""} />
          </Field>

          <Field id={`adv-${plan.id}`} label="Days ahead" hint="How far in advance it must be booked.">
            <input id={`adv-${plan.id}`} name="advanceDays" className="inp" type="number" min={0} max={730} defaultValue={plan.advanceDays ?? ""} />
          </Field>
        </div>

        <label className="toggle-wrap">
          <input type="checkbox" name="active" defaultChecked={plan.active} />
          <span>Offer this plan on the site</span>
        </label>
        <label className="toggle-wrap">
          <input type="checkbox" name="isPublic" defaultChecked={plan.isPublic} />
          <span>Show it to everyone (uncheck for corporate and negotiated rates)</span>
        </label>

        <SaveBar state={state as never} pending={pending} label="Save plan" />
      </form>

      <div className="card-head">
        <h3>Text</h3>
        <LocaleTabs
          locales={locales}
          active={tab}
          onSelect={setTab}
          isTranslated={(code) =>
            Boolean(plan.translations.find((t) => t.localeCode === code)?.name?.trim())
          }
        />
      </div>

      {locales
        .filter((l) => l.code === tab)
        .map((l) => (
          <PlanTextForm
            key={l.code}
            planId={plan.id}
            locale={l}
            value={plan.translations.find((t) => t.localeCode === l.code)}
            source={l.isDefault ? undefined : source}
          />
        ))}
    </div>
  );
}

function PlanTextForm({
  planId,
  locale,
  value,
  source,
}: {
  planId: string;
  locale: LocaleView;
  value?: { name: string; description: string | null };
  source?: { name: string; description: string | null };
}) {
  const [state, action, pending] = useActionState(saveRatePlanText, null);
  const rtl = locale.direction === "rtl";

  return (
    <form action={action} className="form">
      <input type="hidden" name="ratePlanId" value={planId} />
      <input type="hidden" name="localeCode" value={locale.code} />

      <Field id={`pname-${planId}-${locale.code}`} label="Name" source={source?.name} rtl={rtl}>
        <input
          id={`pname-${planId}-${locale.code}`}
          name="name"
          className="inp"
          defaultValue={value?.name ?? ""}
          dir={rtl ? "rtl" : "ltr"}
          lang={locale.code}
          required
        />
      </Field>

      <Field
        id={`pdesc-${planId}-${locale.code}`}
        label="What it includes"
        source={source?.description}
        rtl={rtl}
      >
        <textarea
          id={`pdesc-${planId}-${locale.code}`}
          name="description"
          className="inp"
          rows={3}
          defaultValue={value?.description ?? ""}
          dir={rtl ? "rtl" : "ltr"}
          lang={locale.code}
        />
      </Field>

      <SaveBar state={state as never} pending={pending} label={`Save ${locale.nativeName}`} />
    </form>
  );
}

function Policies({ resort, canWrite }: { resort: ResortView; canWrite: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const remove = (id: string) =>
    start(async () => {
      setError(null);
      const outcome = await deletePolicy(id);
      if ("error" in outcome && outcome.error) return setError(outcome.error);
      router.refresh();
    });

  return (
    <section className="card">
      <div className="card-head">
        <h2>Cancellation policies</h2>
        {canWrite && (
          <button type="button" className="btn btn--sm" onClick={() => setEditing("new")}>
            Add a policy
          </button>
        )}
      </div>

      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}

      {resort.policies.length === 0 && editing !== "new" && (
        <p className="empty">No policies. Rate plans without one show a guest no terms at all.</p>
      )}

      <ul className="rows">
        {resort.policies.map((policy) => (
          <li className="menu-item" key={policy.id}>
            <div className="menu-row">
              <span>
                <b>{policy.summaryEn || "No summary written"}</b>
                <code>
                  {POLICY_TYPES[policy.type] ?? policy.type}
                  {policy.usedBy > 0 ? ` · used by ${policy.usedBy} plan${policy.usedBy === 1 ? "" : "s"}` : " · unused"}
                </code>
              </span>
              <span className="ctrls">
                {!policy.summaryAr && <span className="chip chip--warn">No Arabic</span>}
                {canWrite && (
                  <>
                    <button
                      type="button"
                      className="ic"
                      onClick={() => setEditing(editing === policy.id ? null : policy.id)}
                      aria-expanded={editing === policy.id}
                    >
                      {editing === policy.id ? "Close" : "Edit"}
                    </button>
                    <button
                      type="button"
                      className="ic ic--del"
                      onClick={() => remove(policy.id)}
                      disabled={pending}
                      aria-label="Remove this policy"
                    >
                      ✕
                    </button>
                  </>
                )}
              </span>
            </div>
            {editing === policy.id && (
              <PolicyForm resortId={resort.id} policy={policy} onDone={() => setEditing(null)} />
            )}
          </li>
        ))}
      </ul>

      {editing === "new" && (
        <PolicyForm resortId={resort.id} policy={null} onDone={() => setEditing(null)} />
      )}
    </section>
  );
}

function PolicyForm({
  resortId,
  policy,
  onDone,
}: {
  resortId: string;
  policy: PolicyView | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (prev: unknown, formData: FormData) => {
    const result = await savePolicy(prev, formData);
    if ("ok" in result) {
      router.refresh();
      onDone();
    }
    return result;
  }, null);

  // Controlled, so a rejected save keeps what was written — the summary is the
  // longest field on the screen and the most annoying to lose.
  const [form, setForm] = useState({
    type: policy?.type ?? "free_until",
    freeUntilDays: policy?.freeUntilDays?.toString() ?? "3",
    freeUntilTime: policy?.freeUntilTime ?? "18:00",
    penaltyType: policy?.penaltyType ?? "nights",
    penaltyValue: policy?.penaltyValue?.toString() ?? "1",
    summaryEn: policy?.summaryEn ?? "",
    summaryAr: policy?.summaryAr ?? "",
  });
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((c) => ({ ...c, [key]: value }));

  return (
    <form action={action} className="menu-edit">
      {policy && <input type="hidden" name="policyId" value={policy.id} />}
      <input type="hidden" name="resortId" value={resortId} />

      <div className="grid">
        <Field id="ptype" label="Kind">
          <select id="ptype" name="type" className="inp" value={form.type} onChange={(e) => set("type")(e.target.value)}>
            {Object.entries(POLICY_TYPES).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </Field>

        {form.type === "free_until" && (
          <>
            <Field id="pdays" label="Free until (days before arrival)">
              <input id="pdays" name="freeUntilDays" className="inp" type="number" min={0} max={365}
                     value={form.freeUntilDays} onChange={(e) => set("freeUntilDays")(e.target.value)} />
            </Field>
            <Field id="ptime" label="By what time" hint="Local to the resort.">
              <input id="ptime" name="freeUntilTime" className="inp" type="time"
                     value={form.freeUntilTime} onChange={(e) => set("freeUntilTime")(e.target.value)} />
            </Field>
          </>
        )}

        {(form.type === "free_until" || form.type === "partial") && (
          <>
            <Field id="ppen" label="Then charge">
              <select id="ppen" name="penaltyType" className="inp" value={form.penaltyType}
                      onChange={(e) => set("penaltyType")(e.target.value)}>
                <option value="nights">Nights</option>
                <option value="percentage">A percentage</option>
                <option value="fixed">A fixed amount</option>
              </select>
            </Field>
            <Field id="ppenv" label="How much">
              <input id="ppenv" name="penaltyValue" className="inp" type="number" min={0}
                     value={form.penaltyValue} onChange={(e) => set("penaltyValue")(e.target.value)} />
            </Field>
          </>
        )}
      </div>

      <Field
        id="psumen"
        label="What the guest reads (English)"
        hint="Written by a person, not generated. This is the sentence the hotel is held to."
      >
        <textarea id="psumen" name="summaryEn" className="inp" rows={2} required
                  value={form.summaryEn} onChange={(e) => set("summaryEn")(e.target.value)} />
      </Field>

      <Field id="psumar" label="What the guest reads (Arabic)" rtl>
        <textarea id="psumar" name="summaryAr" className="inp" rows={2} dir="rtl" lang="ar"
                  value={form.summaryAr} onChange={(e) => set("summaryAr")(e.target.value)} />
      </Field>

      <div className="btn-row">
        <button type="button" className="btn btn--sm" onClick={onDone} disabled={pending}>
          Cancel
        </button>
      </div>
      <SaveBar state={state as never} pending={pending} label="Save policy" />
    </form>
  );
}

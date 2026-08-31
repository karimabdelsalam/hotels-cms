"use client";

import { useMemo, useState, useTransition } from "react";
import { LocaleTabs, type LocaleView } from "@/components/editor/LocaleTabs";
import { saveMenu } from "./actions";

/* ------------------------------------------------------------------ *
 * The whole menu is edited here and saved in one go.
 *
 * Moving an item changes its siblings' positions and sometimes its
 * parent, so per-item saving would mean a burst of writes for one drag
 * and a half-applied menu if any of them failed. Instead the tree lives
 * in local state, the Save button sends it once, and the server writes it
 * in a transaction.
 * ------------------------------------------------------------------ */

const MAX_DEPTH = 2; // what the public renderer actually walks

export type TargetOption = { id: string; name: string; published: boolean };
export type Targets = {
  page: TargetOption[];
  resort: TargetOption[];
  offer: TargetOption[];
  experience: TargetOption[];
  route: TargetOption[];
};

type TargetType = keyof Targets | "url";

const TYPE_LABELS: Record<TargetType, string> = {
  page: "Page",
  resort: "Resort",
  offer: "Offer",
  experience: "Experience",
  route: "Section",
  url: "External link",
};

/** Why an item would not render, in the visitor's terms. Null means it will. */
const OFF_REASON: Record<Exclude<TargetType, "url">, string> = {
  page: "This page is not published — the item is hidden on the site",
  resort: "This resort is not published — the item is hidden on the site",
  offer: "This offer is not published — the item is hidden on the site",
  experience: "This experience is not published — the item is hidden on the site",
  route: "This section is switched off — the item is hidden on the site",
};

export type MenuItemView = {
  id: string;
  parentId: string | null;
  position: number;
  targetType: string;
  pageId: string | null;
  resortId: string | null;
  offerId: string | null;
  experienceId: string | null;
  route: string | null;
  url: string | null;
  openNewTab: boolean;
  labels: { localeCode: string; label: string }[];
};

export type MenuView = { id: string; key: string; name: string; items: MenuItemView[] };

/** The shape the builder works in: nested, not flat. */
type Node = {
  id: string;
  targetType: TargetType;
  pageId: string | null;
  resortId: string | null;
  offerId: string | null;
  experienceId: string | null;
  route: string | null;
  url: string | null;
  openNewTab: boolean;
  labels: Record<string, string>;
  children: Node[];
};

const TARGET_KEY = {
  page: "pageId",
  resort: "resortId",
  offer: "offerId",
  experience: "experienceId",
} as const;

function toTree(items: MenuItemView[]): Node[] {
  const build = (row: MenuItemView): Node => ({
    id: row.id,
    targetType: (row.targetType as TargetType) ?? "url",
    pageId: row.pageId,
    resortId: row.resortId,
    offerId: row.offerId,
    experienceId: row.experienceId,
    route: row.route,
    url: row.url,
    openNewTab: row.openNewTab,
    labels: Object.fromEntries(row.labels.map((l) => [l.localeCode, l.label])),
    children: items
      .filter((c) => c.parentId === row.id)
      .sort((a, b) => a.position - b.position)
      .map(build),
  });
  return items
    .filter((i) => !i.parentId)
    .sort((a, b) => a.position - b.position)
    .map(build);
}

let seq = 0;
const newId = () => `new:${Date.now()}:${seq++}`;

function emptyNode(): Node {
  return {
    id: newId(),
    targetType: "page",
    pageId: null,
    resortId: null,
    offerId: null,
    experienceId: null,
    route: null,
    url: null,
    openNewTab: false,
    labels: {},
    children: [],
  };
}

/* ---------------- tree operations, all pure ---------------- */

/** Replace one node wherever it sits, leaving everything else identical. */
function mapNode(nodes: Node[], id: string, fn: (n: Node) => Node): Node[] {
  return nodes.map((n) =>
    n.id === id ? fn(n) : { ...n, children: mapNode(n.children, id, fn) },
  );
}

function removeNode(nodes: Node[], id: string): { tree: Node[]; removed: Node | null } {
  let removed: Node | null = null;
  const walk = (list: Node[]): Node[] =>
    list.reduce<Node[]>((acc, n) => {
      if (n.id === id) {
        removed = n;
        return acc;
      }
      acc.push({ ...n, children: walk(n.children) });
      return acc;
    }, []);
  return { tree: walk(nodes), removed };
}

/** The siblings a node sits among, and where in them. */
function locate(nodes: Node[], id: string): { siblings: Node[]; index: number; depth: number } | null {
  const walk = (list: Node[], depth: number): ReturnType<typeof locate> => {
    const index = list.findIndex((n) => n.id === id);
    if (index >= 0) return { siblings: list, index, depth };
    for (const n of list) {
      const found = walk(n.children, depth + 1);
      if (found) return found;
    }
    return null;
  };
  return walk(nodes, 1);
}

function replaceSiblings(nodes: Node[], target: Node[], next: Node[]): Node[] {
  if (nodes === target) return next;
  return nodes.map((n) => ({ ...n, children: replaceSiblings(n.children, target, next) }));
}

function move(nodes: Node[], id: string, delta: -1 | 1): Node[] {
  const at = locate(nodes, id);
  if (!at) return nodes;
  const to = at.index + delta;
  const here = at.siblings[at.index];
  const there = at.siblings[to];
  if (!here || !there) return nodes; // already at the end of its list
  const next = [...at.siblings];
  next[at.index] = there;
  next[to] = here;
  return replaceSiblings(nodes, at.siblings, next);
}

/** Nest an item under the sibling above it. */
function indent(nodes: Node[], id: string): Node[] {
  const at = locate(nodes, id);
  if (!at || at.index === 0) return nodes;
  const node = at.siblings[at.index];
  const above = at.siblings[at.index - 1];
  if (!node || !above) return nodes;
  // Its own children would land at depth 3, which the site never renders.
  if (at.depth + 1 > MAX_DEPTH || node.children.length > 0) return nodes;
  const next = [...at.siblings];
  next.splice(at.index, 1);
  next[at.index - 1] = { ...above, children: [...above.children, node] };
  return replaceSiblings(nodes, at.siblings, next);
}

/** Lift an item out to sit just after its parent. */
function outdent(nodes: Node[], id: string): Node[] {
  const findParent = (list: Node[]): Node | null => {
    for (const n of list) {
      if (n.children.some((c) => c.id === id)) return n;
      const deeper = findParent(n.children);
      if (deeper) return deeper;
    }
    return null;
  };
  const parent = findParent(nodes);
  if (!parent) return nodes;
  const node = parent.children.find((c) => c.id === id);
  if (!node) return nodes;
  const stripped = mapNode(nodes, parent.id, (p) => ({
    ...p,
    children: p.children.filter((c) => c.id !== id),
  }));
  const at = locate(stripped, parent.id);
  if (!at) return nodes;
  const next = [...at.siblings];
  next.splice(at.index + 1, 0, node);
  return replaceSiblings(stripped, at.siblings, next);
}

/* ---------------- component ---------------- */

export function MenuBuilder({
  menus,
  locales,
  targets,
  canWrite,
}: {
  menus: MenuView[];
  locales: LocaleView[];
  targets: Targets;
  canWrite: boolean;
}) {
  const [active, setActive] = useState(menus[0]?.id ?? "");
  const menu = menus.find((m) => m.id === active) ?? menus[0];

  if (!menu) return <p className="note">No menus are defined.</p>;

  return (
    <div className="editor">
      <div className="tabs" role="tablist">
        {menus.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={m.id === menu.id}
            onClick={() => setActive(m.id)}
          >
            {m.name}
          </button>
        ))}
      </div>
      <MenuPanel
        // Remounting on menu change throws away unsaved edits to the previous
        // menu rather than silently carrying them into this one.
        key={menu.id}
        menu={menu}
        locales={locales}
        targets={targets}
        canWrite={canWrite}
      />
    </div>
  );
}

function MenuPanel({
  menu,
  locales,
  targets,
  canWrite,
}: {
  menu: MenuView;
  locales: LocaleView[];
  targets: Targets;
  canWrite: boolean;
}) {
  const initial = useMemo(() => toTree(menu.items), [menu.items]);
  const [tree, setTree] = useState<Node[]>(initial);
  const [tab, setTab] = useState(locales[0]?.code ?? "en");
  const [open, setOpen] = useState<string | null>(null);
  const [state, setState] = useState<{ error?: string; ok?: boolean } | null>(null);
  const [pending, start] = useTransition();

  // What the server currently holds, as the payload it was sent. Comparing
  // against this rather than against the tree as first loaded is what lets the
  // screen go quiet again after a save — otherwise it would claim unsaved work
  // for the rest of the session, and no one could tell a saved menu from an
  // unsaved one.
  const current = useMemo(() => JSON.stringify(serialize(tree, locales)), [tree, locales]);
  const [baseline, setBaseline] = useState(current);
  const dirty = current !== baseline;

  const apply = (fn: (t: Node[]) => Node[]) => {
    setState(null);
    setTree(fn);
  };

  const save = () =>
    start(async () => {
      setState(null);
      // Captured before the await: the person may keep editing while it saves,
      // and only what actually went to the server may become the new baseline.
      const sent = current;
      const outcome = await saveMenu(menu.id, sent);
      if ("error" in outcome) {
        setState({ error: outcome.error });
        return;
      }
      setBaseline(sent);
      setState({ ok: true });
    });

  const count = countNodes(tree);

  return (
    <section className="card">
      <div className="card-head">
        <h2>{menu.name}</h2>
        <LocaleTabs
          locales={locales}
          active={tab}
          onSelect={setTab}
          isTranslated={() => true}
        />
      </div>

      <p className="note">
        Labels are optional. Leave one blank and the item shows the target&apos;s own
        name in that language — rename a resort and every menu follows.
      </p>

      {tree.length === 0 ? (
        <p className="empty">This menu is empty. Add the first item below.</p>
      ) : (
        <ul className="rows">
          {tree.map((node, index) => (
            <MenuNode
              key={node.id}
              node={node}
              index={index}
              siblingCount={tree.length}
              depth={1}
              locale={tab}
              locales={locales}
              targets={targets}
              canWrite={canWrite}
              open={open}
              setOpen={setOpen}
              apply={apply}
            />
          ))}
        </ul>
      )}

      {canWrite && (
        <div className="btn-row">
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              const node = emptyNode();
              apply((t) => [...t, node]);
              setOpen(node.id);
            }}
          >
            Add item
          </button>
        </div>
      )}

      {canWrite ? (
        <div className="form-foot">
          <button
            type="button"
            className="btn btn--pri"
            onClick={save}
            disabled={pending || !dirty}
          >
            {pending ? "Saving…" : dirty ? `Save ${count} item${count === 1 ? "" : "s"}` : "Saved"}
          </button>
          {state?.error && (
            <p className="err" role="alert">
              {state.error}
            </p>
          )}
          {state?.ok && (
            <p className="ok" role="status">
              Saved. The site has been asked to rebuild.
            </p>
          )}
          {dirty && !state?.error && (
            <p className="hint">Unsaved changes — nothing reaches the site until you save.</p>
          )}
        </div>
      ) : (
        <p className="note">You can see this menu but not change it.</p>
      )}
    </section>
  );
}

function MenuNode({
  node,
  index,
  siblingCount,
  depth,
  locale,
  locales,
  targets,
  canWrite,
  open,
  setOpen,
  apply,
}: {
  node: Node;
  index: number;
  siblingCount: number;
  depth: number;
  locale: string;
  locales: LocaleView[];
  targets: Targets;
  canWrite: boolean;
  open: string | null;
  setOpen: (id: string | null) => void;
  apply: (fn: (t: Node[]) => Node[]) => void;
}) {
  const isOpen = open === node.id;
  const chosen = describe(node, targets);
  const editing = node.labels[locale]?.trim();

  return (
    <li className="menu-item">
      <div className={`menu-row${chosen.hidden ? " off" : ""}`}>
        <span>
          <b>{editing || chosen.label || "Nothing chosen yet"}</b>
          <code>{TYPE_LABELS[node.targetType]}</code>
          {node.openNewTab && <span className="chip">New tab</span>}
        </span>
        <span className="ctrls">
          {chosen.hidden && <span className="chip chip--warn">{chosen.hidden}</span>}
          {canWrite && (
            <>
              <button
                type="button"
                className="ic"
                title="Move up"
                aria-label={`Move ${chosen.label} up`}
                disabled={index === 0}
                onClick={() => apply((t) => move(t, node.id, -1))}
              >
                ↑
              </button>
              <button
                type="button"
                className="ic"
                title="Move down"
                aria-label={`Move ${chosen.label} down`}
                disabled={index === siblingCount - 1}
                onClick={() => apply((t) => move(t, node.id, 1))}
              >
                ↓
              </button>
              <button
                type="button"
                className="ic"
                title={
                  node.children.length > 0
                    ? "This item has items under it, so it cannot become one itself"
                    : depth >= 2
                      ? "Menus go two levels deep"
                      : "Nest under the item above"
                }
                aria-label={`Nest ${chosen.label} under the item above`}
                disabled={index === 0 || depth >= 2 || node.children.length > 0}
                onClick={() => apply((t) => indent(t, node.id))}
              >
                →
              </button>
              <button
                type="button"
                className="ic"
                title="Lift out one level"
                aria-label={`Lift ${chosen.label} out one level`}
                disabled={depth === 1}
                onClick={() => apply((t) => outdent(t, node.id))}
              >
                ←
              </button>
              <button
                type="button"
                className="ic"
                title={isOpen ? "Close" : "Edit"}
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : node.id)}
              >
                {isOpen ? "Close" : "Edit"}
              </button>
              <button
                type="button"
                className="ic ic--del"
                title={
                  node.children.length > 0
                    ? `Remove this and the ${node.children.length} item${node.children.length === 1 ? "" : "s"} under it`
                    : "Remove"
                }
                aria-label={`Remove ${chosen.label}`}
                onClick={() => apply((t) => removeNode(t, node.id).tree)}
              >
                ✕
              </button>
            </>
          )}
        </span>
      </div>

      {isOpen && canWrite && (
        <ItemForm
          node={node}
          locale={locale}
          locales={locales}
          targets={targets}
          onChange={(next) => apply((t) => mapNode(t, node.id, () => next))}
        />
      )}

      {node.children.length > 0 && (
        <ul className="rows nested">
          {node.children.map((child, i) => (
            <MenuNode
              key={child.id}
              node={child}
              index={i}
              siblingCount={node.children.length}
              depth={depth + 1}
              locale={locale}
              locales={locales}
              targets={targets}
              canWrite={canWrite}
              open={open}
              setOpen={setOpen}
              apply={apply}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function ItemForm({
  node,
  locale,
  locales,
  targets,
  onChange,
}: {
  node: Node;
  locale: string;
  locales: LocaleView[];
  targets: Targets;
  onChange: (next: Node) => void;
}) {
  const options = node.targetType === "url" ? [] : targets[node.targetType];
  const currentId =
    node.targetType === "route"
      ? node.route
      : node.targetType === "url"
        ? null
        : node[TARGET_KEY[node.targetType]];

  const setType = (targetType: TargetType) =>
    // Clearing the other target columns is what keeps a stale resortId from
    // travelling along with an item someone switched to a page.
    onChange({
      ...node,
      targetType,
      pageId: null,
      resortId: null,
      offerId: null,
      experienceId: null,
      route: null,
      url: targetType === "url" ? node.url : null,
    });

  const setTarget = (id: string) => {
    if (node.targetType === "route") return onChange({ ...node, route: id || null });
    if (node.targetType === "url") return;
    onChange({ ...node, [TARGET_KEY[node.targetType]]: id || null });
  };

  const dir = locales.find((l) => l.code === locale)?.direction ?? "ltr";

  return (
    <div className="menu-edit">
      <div className="grid">
        <div className="field">
          <label htmlFor={`type-${node.id}`}>Points at</label>
          <select
            id={`type-${node.id}`}
            className="inp"
            value={node.targetType}
            onChange={(e) => setType(e.target.value as TargetType)}
          >
            {(Object.keys(TYPE_LABELS) as TargetType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        {node.targetType === "url" ? (
          <div className="field">
            <label htmlFor={`url-${node.id}`}>Address</label>
            <input
              id={`url-${node.id}`}
              className="inp"
              type="url"
              placeholder="https://…"
              value={node.url ?? ""}
              onChange={(e) => onChange({ ...node, url: e.target.value })}
            />
            <span className="hint">
              Only for links off this site. Anything of ours should point at the content
              itself, so it survives a rename.
            </span>
          </div>
        ) : (
          <div className="field">
            <label htmlFor={`target-${node.id}`}>Which one</label>
            <select
              id={`target-${node.id}`}
              className="inp"
              value={currentId ?? ""}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Choose…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.published ? "" : " — not live"}
                </option>
              ))}
            </select>
            {options.length === 0 && (
              <span className="hint">Nothing of this kind exists yet.</span>
            )}
          </div>
        )}

        <div className="field">
          <label htmlFor={`label-${node.id}`}>
            Label in {locales.find((l) => l.code === locale)?.nativeName ?? locale}
          </label>
          <input
            id={`label-${node.id}`}
            className="inp"
            dir={dir}
            placeholder={describe(node, targets).label || "Uses the target's own name"}
            value={node.labels[locale] ?? ""}
            onChange={(e) =>
              onChange({ ...node, labels: { ...node.labels, [locale]: e.target.value } })
            }
          />
          <span className="hint">Leave blank to follow the target&apos;s own name.</span>
        </div>
      </div>

      <label className="toggle-wrap">
        <input
          type="checkbox"
          checked={node.openNewTab}
          onChange={(e) => onChange({ ...node, openNewTab: e.target.checked })}
        />
        <span>Open in a new tab</span>
      </label>
    </div>
  );
}

/* ---------------- helpers ---------------- */

function describe(node: Node, targets: Targets): { label: string; hidden: string | null } {
  if (node.targetType === "url") {
    return { label: node.url ?? "", hidden: null };
  }
  const id =
    node.targetType === "route" ? node.route : node[TARGET_KEY[node.targetType]];
  if (!id) return { label: "", hidden: "Nothing chosen — this item will not appear" };
  const found = targets[node.targetType].find((o) => o.id === id);
  if (!found) return { label: id, hidden: "This target no longer exists" };
  return { label: found.name, hidden: found.published ? null : OFF_REASON[node.targetType] };
}

function countNodes(nodes: Node[]): number {
  return nodes.reduce((n, node) => n + 1 + countNodes(node.children), 0);
}

/** Local shape → what the server action parses. */
function serialize(nodes: Node[], locales: LocaleView[]): unknown[] {
  return nodes.map((n) => ({
    id: n.id,
    targetType: n.targetType,
    pageId: n.pageId,
    resortId: n.resortId,
    offerId: n.offerId,
    experienceId: n.experienceId,
    route: n.route,
    url: n.url,
    openNewTab: n.openNewTab,
    labels: locales
      .map((l) => ({ localeCode: l.code, label: n.labels[l.code] ?? "" }))
      .filter((l) => l.label.trim().length > 0),
    children: serialize(n.children, locales),
  }));
}

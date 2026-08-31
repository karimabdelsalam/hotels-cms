import "server-only";
import { redirect } from "next/navigation";
import { prisma } from "@fantazia/db";
import { readSession } from "@/lib/session";

export type Actor = {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: Set<string>;
  /** Empty means group-wide: every resort. */
  resortIds: string[];
  isGroupWide: boolean;
};

/**
 * Resolve the signed-in staff member, with roles, permissions, and resort
 * scope. A group-level role with no UserResortAccess rows sees every resort;
 * anyone else sees exactly the rows listed. Zero rows is zero access, never all.
 */
export async function getActor(): Promise<Actor | null> {
  const session = await readSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      roles: { include: { role: { include: { permissions: true } } } },
      resortAccess: true,
    },
  });
  if (!user || user.status !== "active") return null;

  const roles = user.roles.map((r) => r.roleKey);
  const permissions = new Set(
    user.roles.flatMap((r) => r.role.permissions.map((p) => p.permissionKey)),
  );
  const hasGroupRole = user.roles.some((r) => r.role.scope === "group");
  const resortIds = user.resortAccess.map((a) => a.resortId);

  return {
    id: user.id,
    email: user.email,
    name: `${user.firstName} ${user.lastName}`.trim(),
    roles,
    permissions,
    resortIds,
    isGroupWide: hasGroupRole && resortIds.length === 0,
  };
}

/** Route guard. Redirects to login rather than rendering a broken page. */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  return actor;
}

/**
 * Permission guard for a page.
 *
 * Sends the signed-in user to an explanatory page rather than throwing, which
 * would surface as a 500 and tell them nothing. Server actions use
 * `requirePermissionForAction`, which throws — an action has no page to render.
 */
export async function requirePermission(permission: string): Promise<Actor> {
  const actor = await requireActor();
  if (!actor.permissions.has(permission)) {
    redirect(`/no-access?need=${encodeURIComponent(permission)}`);
  }
  return actor;
}

/** Permission guard for server actions, where throwing is the correct outcome. */
export async function requirePermissionForAction(permission: string): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new Error("Not signed in");
  if (!actor.permissions.has(permission)) {
    throw new Error(`You do not have permission to do that (${permission}).`);
  }
  return actor;
}

export function can(actor: Actor, permission: string): boolean {
  return actor.permissions.has(permission);
}

/**
 * Resource-scope guard for pages — the second of the three layers in
 * docs/authorization.md. Redirects rather than throwing, for the same reason
 * as above.
 */
export function assertResortInScope(actor: Actor, resortId: string): void {
  if (actor.isGroupWide) return;
  if (!actor.resortIds.includes(resortId)) {
    redirect("/no-access?need=this-resort");
  }
}

/** Resource-scope guard for server actions. */
export function assertResortInScopeForAction(actor: Actor, resortId: string): void {
  if (actor.isGroupWide) return;
  if (!actor.resortIds.includes(resortId)) {
    throw new Error("That resort is outside your access.");
  }
}

/** Where a scoped list query should be filtered. Undefined means no filter. */
export function resortScopeFilter(actor: Actor): { id: { in: string[] } } | undefined {
  return actor.isGroupWide ? undefined : { id: { in: actor.resortIds } };
}

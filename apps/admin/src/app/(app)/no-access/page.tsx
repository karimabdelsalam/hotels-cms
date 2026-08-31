import Link from "next/link";
import { requireActor } from "@/server/auth";
import { PageHeader } from "@/components/PageHeader";

const EXPLAIN: Record<string, string> = {
  "this-resort": "That resort is not one you have been given access to.",
  "modules:write": "Switching site sections on and off is a group-level permission.",
  "menus:write": "Editing navigation is a group-level permission.",
  "users:manage": "Managing staff accounts is restricted to the platform owner.",
  "audit:read": "The audit log is restricted to group and finance roles.",
  "content:write": "You can view this content but not change it.",
};

export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ need?: string }>;
}) {
  const actor = await requireActor();
  const { need } = await searchParams;

  return (
    <>
      <PageHeader
        title="You do not have access to that"
        description={
          need && EXPLAIN[need]
            ? EXPLAIN[need]
            : "That area is restricted to a role you do not hold."
        }
      />
      <div className="card">
        <h2>Your access</h2>
        <ul className="rows">
          <li>
            <span>Roles</span>
            <span>{actor.roles.join(", ") || "none"}</span>
          </li>
          <li>
            <span>Resorts</span>
            <span>{actor.isGroupWide ? "All resorts" : `${actor.resortIds.length} assigned`}</span>
          </li>
          {need && (
            <li>
              <span>Missing permission</span>
              <span>
                <code>{need}</code>
              </span>
            </li>
          )}
        </ul>
        <p className="note">
          If this is wrong, an administrator can change your role or add resorts to your access.
        </p>
        <div>
          <Link className="btn" href="/">
            Back to dashboard
          </Link>
        </div>
      </div>
    </>
  );
}

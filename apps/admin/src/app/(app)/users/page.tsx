import { prisma } from "@fantazia/db";
import { requirePermission } from "@/server/auth";
import { PageHeader } from "@/components/PageHeader";

export default async function UsersPage() {
  await requirePermission("users:manage");

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      roles: { include: { role: true } },
      resortAccess: { include: { resort: { include: { translations: true } } } },
    },
  });

  return (
    <>
      <PageHeader
        title="Staff"
        description="A group-level role with no resorts listed sees every resort. Anyone else sees exactly what is listed — no rows means no access, never all access."
      />
      <div className="scroller">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Roles</th>
              <th>Scope</th>
              <th>2FA</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const groupRole = u.roles.some((r) => r.role.scope === "group");
              const scoped = u.resortAccess.length > 0;
              return (
                <tr key={u.id}>
                  <td>
                    <b>
                      {u.firstName} {u.lastName}
                    </b>
                  </td>
                  <td>
                    <code>{u.email}</code>
                  </td>
                  <td>{u.roles.map((r) => r.role.name).join(", ") || "—"}</td>
                  <td>
                    {scoped ? (
                      u.resortAccess
                        .map(
                          (a) =>
                            a.resort.translations.find((t) => t.localeCode === "en")?.name ??
                            a.resort.code,
                        )
                        .join(", ")
                    ) : groupRole ? (
                      <span className="chip chip--ok">All resorts</span>
                    ) : (
                      <span className="chip chip--warn">No access</span>
                    )}
                  </td>
                  <td>
                    <span className={`chip${u.totpEnabled ? " chip--ok" : " chip--warn"}`}>
                      {u.totpEnabled ? "On" : "Off"}
                    </span>
                  </td>
                  <td>
                    <span className={`chip${u.status === "active" ? " chip--ok" : ""}`}>
                      {u.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note">
        Two-factor authentication is required for group and finance roles before launch. The
        enrolment flow lands with the booking phase, when the portal starts holding guest data.
      </p>
    </>
  );
}

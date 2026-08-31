import { prisma } from "@fantazia/db";
import { requirePermission } from "@/server/auth";
import { PageHeader } from "@/components/PageHeader";

export default async function AuditPage() {
  await requirePermission("audit:read");

  const entries = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
  });

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change made in the admin, with who made it and what it replaced. The last hundred entries."
      />
      {entries.length === 0 ? (
        <p className="empty">Nothing recorded yet.</p>
      ) : (
        <div className="scroller">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Entity</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="num">{e.createdAt.toISOString().replace("T", " ").slice(0, 19)}</td>
                  <td>{e.user ? `${e.user.firstName} ${e.user.lastName}` : "—"}</td>
                  <td>
                    <code>{e.action}</code>
                  </td>
                  <td>
                    {e.entityType}
                    {e.entityId ? ` · ${e.entityId.slice(0, 8)}` : ""}
                  </td>
                  <td>
                    <code>{e.ipAddress ?? "—"}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

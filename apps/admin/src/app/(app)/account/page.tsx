import { prisma } from "@fantazia/db";
import { requireActor } from "@/server/auth";
import { PageHeader } from "@/components/PageHeader";
import { TwoFactor } from "./TwoFactor";

export default async function AccountPage() {
  // No permission check: every signed-in person may manage their own account.
  const actor = await requireActor();

  const [user, codesLeft] = await Promise.all([
    prisma.user.findUnique({
      where: { id: actor.id },
      select: { totpEnabled: true, totpEnabledAt: true, lastLoginAt: true },
    }),
    prisma.userRecoveryCode.count({ where: { userId: actor.id, usedAt: null } }),
  ]);

  return (
    <>
      <PageHeader
        title="Your account"
        description={`Signed in as ${actor.email}.`}
      />

      <div className="cards">
        <section className="card">
          <h2>Who you are here</h2>
          <div className="fact-rows">
            <div className="fact-row">
              <span>Name</span>
              <b>{actor.name}</b>
            </div>
            <div className="fact-row">
              <span>Email</span>
              <b>{actor.email}</b>
            </div>
            <div className="fact-row">
              <span>Roles</span>
              <b>{actor.roles.join(", ") || "None"}</b>
            </div>
            <div className="fact-row">
              <span>Resorts</span>
              <b>{actor.isGroupWide ? "All of them" : `${actor.resortIds.length} assigned`}</b>
            </div>
            <div className="fact-row">
              <span>Last signed in</span>
              <b>
                {user?.lastLoginAt
                  ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" })
                      .format(user.lastLoginAt)
                  : "This is your first time"}
              </b>
            </div>
          </div>
        </section>

        <TwoFactor
          enabled={Boolean(user?.totpEnabled)}
          enabledAt={
            user?.totpEnabledAt
              ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(user.totpEnabledAt)
              : null
          }
          recoveryCodesLeft={codesLeft}
        />
      </div>
    </>
  );
}

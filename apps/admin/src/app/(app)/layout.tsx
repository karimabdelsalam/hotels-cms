import type { ReactNode } from "react";
import { requireActor } from "@/server/auth";
import { Shell } from "@/components/Shell";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const actor = await requireActor();
  return (
    <Shell
      actor={{
        name: actor.name,
        email: actor.email,
        roles: actor.roles,
        isGroupWide: actor.isGroupWide,
        permissions: [...actor.permissions],
      }}
    >
      {children}
    </Shell>
  );
}

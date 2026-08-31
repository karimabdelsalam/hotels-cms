import type { ReactNode } from "react";
import { getBrand } from "@fantazia/db/content";
import { requireActor } from "@/server/auth";
import { Shell } from "@/components/Shell";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const actor = await requireActor();
  const brand = await getBrand("en");
  return (
    <Shell
      brand={{ wordmark: brand.wordmark }}
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

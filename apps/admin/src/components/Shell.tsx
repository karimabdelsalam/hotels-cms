"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type BrandView = { wordmark: string };

type ActorView = {
  name: string;
  email: string;
  roles: string[];
  isGroupWide: boolean;
  permissions: string[];
};

/** Navigation is filtered by permission, so nobody is shown a door they cannot open. */
const NAV: { href: string; label: string; permission?: string }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/resorts", label: "Resorts", permission: "content:read" },
  { href: "/offers", label: "Offers", permission: "content:read" },
  { href: "/experiences", label: "Experiences", permission: "content:read" },
  { href: "/pages", label: "Pages", permission: "content:read" },
  { href: "/media", label: "Media", permission: "content:read" },
  { href: "/modules", label: "Site sections", permission: "modules:write" },
  { href: "/menus", label: "Menus", permission: "menus:write" },
  { href: "/users", label: "Staff", permission: "users:manage" },
  { href: "/settings", label: "Settings", permission: "content:read" },
  { href: "/audit", label: "Audit log", permission: "audit:read" },
];

export function Shell({
  actor,
  brand,
  children,
}: {
  actor: ActorView;
  brand: BrandView;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const allowed = NAV.filter((n) => !n.permission || actor.permissions.includes(n.permission));

  return (
    <div className="shell">
      <aside className="side">
        <Link href="/" className="side-brand">
          <b>{brand.wordmark}</b>
          <span>Admin</span>
        </Link>
        <nav className="side-nav" aria-label="Sections">
          {allowed.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="side-foot">
          <div className="who">
            <b>{actor.name}</b>
            <span>{actor.email}</span>
            <span className="scope">
              {actor.roles.join(" · ")}
              {actor.isGroupWide ? " · all resorts" : " · scoped"}
            </span>
          </div>
          <form action="/logout" method="post">
            <button className="btn btn--ghost btn--sm" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

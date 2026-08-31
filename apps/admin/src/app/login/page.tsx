import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getBrand } from "@fantazia/db/content";
import { getActor } from "@/server/auth";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in — Fantazia Admin" };

export default async function LoginPage() {
  if (await getActor()) redirect("/");
  const brand = await getBrand("en");
  return (
    <main className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <b>{brand.wordmark}</b>
          <span>Admin</span>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}

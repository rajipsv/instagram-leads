import { Lock } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, sessionToken } from "@/lib/session";

export const metadata = { title: "Sign in" };

async function login(form: FormData) {
  "use server";
  const password = process.env.APP_PASSWORD;
  const next = String(form.get("next") || "/");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (!password) redirect(safeNext);
  if (String(form.get("password") || "") !== password) redirect(`/login?error=1&next=${encodeURIComponent(safeNext)}`);
  (await cookies()).set(COOKIE, await sessionToken(password), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  redirect(safeNext);
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next = "/", error } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <form action={login} className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-primary-soft">
            <Lock className="size-5 text-primary" aria-hidden />
          </div>
          <div>
            <h1 className="font-mono text-lg font-semibold">Growth Intelligence</h1>
            <p className="text-sm text-muted">Enter the workspace password</p>
          </div>
        </div>
        <input type="hidden" name="next" value={next} />
        <label htmlFor="password" className="mb-1 block text-sm font-medium">Password</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" autoFocus
          aria-invalid={error ? true : undefined} aria-describedby={error ? "pw-error" : undefined}
          className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-text" />
        {error && <p id="pw-error" role="alert" className="mt-2 text-sm text-danger">That password didn't match. Try again.</p>}
        <button className="mt-4 w-full cursor-pointer rounded-md bg-primary px-4 py-2 font-medium text-white transition-colors duration-200 hover:bg-primary-hover dark:text-bg">
          Sign in
        </button>
      </form>
    </main>
  );
}

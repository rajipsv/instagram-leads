import { ArrowRight, Building2, Plus } from "lucide-react";
import Link from "next/link";
import { CopyCommand, ThemeToggle } from "@/components/client";
import { InstallButton, OfflineBanner } from "@/components/pwa";
import { EmptyState, Pill, pct } from "@/components/ui";
import { listBusinesses, openNeeds } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Home() {
  const businesses = await listBusinesses();
  return (
    <>
      <OfflineBanner />
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <img src="/icons/icon.svg" alt="" className="size-8" />
          <span className="font-mono font-semibold">Growth Intelligence</span>
          <div className="ml-auto flex items-center gap-1"><InstallButton compact /><ThemeToggle /></div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 pb-12">
        <div className="mb-6">
          <h1 className="font-mono text-2xl font-semibold tracking-tight">Businesses</h1>
          <p className="mt-1 text-sm text-muted">Each business has its own customer profile, leads, campaigns and learnings.</p>
        </div>
        <div className="mb-6"><InstallButton /></div>

        {businesses.length === 0 ? (
          <EmptyState icon={Building2} title="No businesses yet" command="/onboard-business <slug> <website>">
            Add your first business from Claude Code. It builds the customer profile and brand facts, then saves them here.
          </EmptyState>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {businesses.map((b) => {
              const needs = openNeeds(b.brand).length;
              return (
                <li key={b.slug}>
                  <Link href={`/b/${b.slug}`}
                    className="group block h-full cursor-pointer rounded-xl border border-border bg-surface p-4 transition-colors duration-200 hover:border-primary/50 hover:bg-surface-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate font-semibold">{b.name}</h2>
                        <p className="mt-0.5 line-clamp-2 text-sm text-muted">{b.icp.target_customer ?? "No target customer set"}</p>
                      </div>
                      <ArrowRight className="mt-1 size-4 shrink-0 text-muted transition-colors duration-200 group-hover:text-primary" aria-hidden />
                    </div>
                    <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                      {[["Leads", b.leads], ["A-tier", b.a_tier], ["Reply rate", pct(b.replied, b.contacted)]].map(([k, v]) => (
                        <div key={k as string} className="rounded-lg bg-surface-2 py-2">
                          <dt className="text-[11px] uppercase tracking-wide text-muted">{k}</dt>
                          <dd className="font-mono text-lg font-semibold tabular-nums">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Pill>{b.lead_kind === "partners" ? "Partner discovery" : "Business leads"}</Pill>
                      {needs > 0 && <Pill tone="accent">{needs} brand facts missing</Pill>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <section className="mt-8 rounded-xl border border-border bg-surface p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Plus className="size-4 text-primary" aria-hidden />Add a business</h2>
          <p className="mt-1 text-sm text-muted">
            Run this in Claude Code (in the GrowthIntelligence folder). It reads the website, drafts the customer profile and
            challenge library, and asks you to confirm.
          </p>
          <CopyCommand className="mt-3 max-w-xl" command="/onboard-business acme-dental https://acmedental.example" />
        </section>
      </main>
    </>
  );
}

import { ChevronLeft, Settings2 } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/client";
import { BottomNav, SideNav } from "@/components/nav";
import { InstallButton, OfflineBanner } from "@/components/pwa";
import { getBusiness, listBusinesses } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function BusinessLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [business, all] = await Promise.all([getBusiness(slug), listBusinesses()]);
  const others = all.map((b) => ({ slug: b.slug, name: b.name }));

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <OfflineBanner />
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2.5">
          <Link href="/" className="flex cursor-pointer items-center gap-2 rounded-md py-1 pr-2 transition-colors duration-200 hover:text-primary" aria-label="All businesses">
            <ChevronLeft className="size-4 lg:hidden" aria-hidden />
            <img src="/icons/icon.svg" alt="" className="hidden size-7 lg:block" />
            <span className="hidden font-mono text-sm font-semibold lg:inline">Growth Intelligence</span>
          </Link>
          <span className="hidden text-border-strong lg:inline" aria-hidden>/</span>
          <span className="truncate font-semibold">{business.name}</span>
          <div className="ml-auto flex items-center gap-1">
            <InstallButton compact />
            <Link href={`/b/${slug}/profile`} aria-label="Business profile"
              className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-muted transition-colors duration-200 hover:bg-surface-2 hover:text-text lg:hidden">
              <Settings2 className="size-4" aria-hidden />
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-6 px-4">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-52 shrink-0 overflow-y-auto py-6 lg:block">
          <SideNav slug={slug} businesses={others} />
        </aside>
        <main id="main" className="pb-safe min-w-0 flex-1 py-5 lg:py-6">{children}</main>
      </div>
      <BottomNav slug={slug} />
    </div>
  );
}

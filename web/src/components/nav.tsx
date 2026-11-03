"use client";

import { BarChart3, Building2, FileText, LayoutDashboard, Megaphone, Settings2, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const ITEMS = [
  { href: "", label: "Overview", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/content", label: "Content", icon: FileText },
  { href: "/feedback", label: "Feedback", icon: BarChart3 },
  { href: "/profile", label: "Profile", icon: Settings2 },
];

function useActive(slug: string) {
  const path = usePathname();
  return (href: string) => {
    const full = `/b/${slug}${href}`;
    return href === "" ? path === full : path.startsWith(full);
  };
}

/** Desktop sidebar (lg and up). */
export function SideNav({ slug, businesses }: { slug: string; businesses: { slug: string; name: string }[] }) {
  const isActive = useActive(slug);
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link key={label} href={`/b/${slug}${href}`} aria-current={active ? "page" : undefined}
            className={cx(
              "flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200",
              active ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2 hover:text-text",
            )}>
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
      {businesses.length > 1 && (
        <>
          <p className="mt-6 px-3 text-xs font-semibold uppercase tracking-wide text-muted">Businesses</p>
          {businesses.map((b) => (
            <Link key={b.slug} href={`/b/${b.slug}`} aria-current={b.slug === slug ? "true" : undefined}
              className={cx("flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors duration-200",
                b.slug === slug ? "font-medium text-text" : "text-muted hover:bg-surface-2 hover:text-text")}>
              <Building2 className="size-3.5" aria-hidden />
              <span className="truncate">{b.name}</span>
            </Link>
          ))}
        </>
      )}
    </nav>
  );
}

/** Mobile bottom tab bar (below lg). Profile lives in the header menu to keep 5 tabs. */
export function BottomNav({ slug }: { slug: string }) {
  const isActive = useActive(slug);
  return (
    <nav aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur lg:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {ITEMS.slice(0, 5).map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <li key={label}>
              <Link href={`/b/${slug}${href}`} aria-current={active ? "page" : undefined}
                className={cx("flex min-h-14 cursor-pointer flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors duration-200",
                  active ? "text-primary" : "text-muted hover:text-text")}>
                <Icon className="size-5" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

import { ExternalLink, Filter, Mail, Search, Users, X } from "lucide-react";
import Link from "next/link";
import { CopyCommand, LeadStatusForm } from "@/components/client";
import { Card, EmptyState, PageHeader, Pill, StatusBadge, TierBadge, cx, fmtAgo, fmtDate, humanize } from "@/components/ui";
import { getBusiness, leadHistory, listCampaigns, listLeads, type LeadFilters } from "@/lib/queries";
import { STATUS_LABEL, STATUSES, type Lead } from "@/lib/types";

export const metadata = { title: "Leads" };

type SP = LeadFilters & { lead?: string };

function qs(sp: SP, patch: Partial<SP>) {
  const p = new URLSearchParams();
  Object.entries({ ...sp, ...patch }).forEach(([k, v]) => { if (v) p.set(k, String(v)); });
  const s = p.toString();
  return s ? `?${s}` : "";
}

const CONF_TONE = { high: "success", medium: "primary", low: "default" } as const;

export default async function LeadsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const raw = await searchParams;
  const sp: SP = {
    tier: raw.tier || undefined, status: raw.status || undefined, challenge: raw.challenge || undefined,
    campaign: raw.campaign || undefined,
    q: raw.q?.slice(0, 80) || undefined, lead: raw.lead || undefined,
  };
  const business = await getBusiness(slug);
  const [leads, campaigns] = await Promise.all([listLeads(business.id, sp), listCampaigns(business.id)]);
  const library = business.icp.challenge_library ?? [];
  const chName = (id: string | null) => library.find((c) => c.id === id)?.name ?? humanize(id);
  const selected = sp.lead ? leads.find((l) => l.username === sp.lead) ?? (await listLeads(business.id, { q: sp.lead })).find((l) => l.username === sp.lead) : undefined;
  const history = selected ? await leadHistory(business.id, selected.username) : [];
  const filtered = Boolean(sp.tier || sp.status || sp.challenge || sp.campaign || sp.q);
  const field = "rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-sm text-text";

  return (
    <>
      <PageHeader title="Leads" subtitle={`${leads.length} ${filtered ? "matching" : "total"} · scored by scripts/leads.py, challenges by the Lead Analyst`} />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface p-3" role="search" aria-label="Filter leads">
        <div className="relative min-w-48 flex-1">
          <label htmlFor="q" className="sr-only">Search</label>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input id="q" name="q" defaultValue={sp.q} placeholder="Search name, handle or bio" className={cx(field, "w-full pl-8")} />
        </div>
        <label className="sr-only" htmlFor="tier">Tier</label>
        <select id="tier" name="tier" defaultValue={sp.tier ?? ""} className={field}>
          <option value="">All tiers</option>
          {["A", "B", "C", "X"].map((t) => <option key={t} value={t}>{t === "X" ? "Disqualified" : `Tier ${t}`}</option>)}
        </select>
        <label className="sr-only" htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={sp.status ?? ""} className={field}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <label className="sr-only" htmlFor="challenge">Challenge</label>
        <select id="challenge" name="challenge" defaultValue={sp.challenge ?? ""} className={field}>
          <option value="">All challenges</option>
          {library.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {sp.campaign && <input type="hidden" name="campaign" value={sp.campaign} />}
        {sp.campaign && <Pill tone="primary">Campaign: {sp.campaign}</Pill>}
        <button className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors duration-200 hover:bg-primary-hover dark:text-bg">
          <Filter className="size-4" aria-hidden />Apply
        </button>
        {filtered && <Link href={`/b/${slug}/leads`} className="cursor-pointer px-2 py-1.5 text-sm text-muted hover:text-text">Clear</Link>}
      </form>

      {leads.length === 0 ? (
        filtered
          ? <EmptyState icon={Search} title="No leads match these filters"><Link href={`/b/${slug}/leads`} className="text-primary hover:underline">Clear filters</Link></EmptyState>
          : <EmptyState icon={Users} title="No leads yet" command={`/find-leads ${slug}`}>Run the Lead Scout in Claude Code with Chrome signed in to Instagram, then sync.</EmptyState>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2.5">Tier</th>
                  <th scope="col" className="px-3 py-2.5">Lead</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Score</th>
                  <th scope="col" className="px-3 py-2.5">Primary challenge</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Followers</th>
                  <th scope="col" className="px-3 py-2.5">Status</th>
                  <th scope="col" className="px-3 py-2.5">Updated</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className={cx("border-b border-border last:border-0 transition-colors duration-150 hover:bg-surface-2", sp.lead === l.username && "bg-primary-soft")}>
                    <td className="px-3 py-2"><TierBadge tier={l.tier} /></td>
                    <td className="max-w-72 px-3 py-2">
                      <Link href={`/b/${slug}/leads${qs(sp, { lead: l.username })}`} scroll={false} className="cursor-pointer font-medium hover:text-primary">
                        @{l.username}
                      </Link>
                      <p className="truncate text-xs text-muted">{l.full_name ?? l.segment ?? ""}</p>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{Math.round(l.score)}</td>
                    <td className="px-3 py-2">{l.primary_challenge ? chName(l.primary_challenge) : <span className="text-muted">{l.disqualified_reason ?? "Not analysed"}</span>}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{l.followers?.toLocaleString("en-IN") ?? "–"}</td>
                    <td className="px-3 py-2"><StatusBadge status={l.status} /></td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{fmtAgo(l.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-2 md:hidden">
            {leads.map((l) => (
              <li key={l.id}>
                <Link href={`/b/${slug}/leads${qs(sp, { lead: l.username })}`} scroll={false}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface p-3 transition-colors duration-200 hover:bg-surface-2">
                  <TierBadge tier={l.tier} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">@{l.username}</p>
                    <p className="truncate text-xs text-muted">{l.primary_challenge ? chName(l.primary_challenge) : l.disqualified_reason ?? "Not analysed"}</p>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={l.status} />
                    <p className="mt-1 font-mono text-xs text-muted">{Math.round(l.score)} pts</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {sp.lead && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <Link href={`/b/${slug}/leads${qs(sp, { lead: undefined })}`} scroll={false} aria-label="Close lead details"
            className="absolute inset-0 cursor-default bg-slate-900/40" />
          <aside role="dialog" aria-modal="true" aria-labelledby="lead-title"
            className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-bg shadow-2xl">
            {selected ? <LeadDetail slug={slug} lead={selected} history={history} chName={chName}
              campaigns={campaigns.map((c) => ({ slug: c.slug, name: c.name }))}
              closeHref={`/b/${slug}/leads${qs(sp, { lead: undefined })}`} /> : (
              <div className="p-6"><p>Lead not found.</p></div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

function LeadDetail({ slug, lead: l, history, chName, campaigns, closeHref }: {
  slug: string; lead: Lead; history: Awaited<ReturnType<typeof leadHistory>>; chName: (id: string | null) => string;
  campaigns: { slug: string; name: string }[]; closeHref: string;
}) {
  const posts = l.raw?.recent_posts ?? [];
  return (
    <>
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <TierBadge tier={l.tier} />
        <div className="min-w-0 flex-1">
          <h2 id="lead-title" className="truncate font-semibold">@{l.username}</h2>
          <p className="truncate text-xs text-muted">{l.full_name}</p>
        </div>
        <Link href={closeHref} scroll={false} aria-label="Close" autoFocus
          className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-muted transition-colors duration-200 hover:bg-surface-2 hover:text-text">
          <X className="size-5" aria-hidden />
        </Link>
      </div>

      <div className="space-y-4 p-4 safe-bottom">
        <div className="flex flex-wrap gap-2">
          {l.profile_url && (
            <a href={l.profile_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium transition-colors duration-200 hover:bg-surface-2">
              Open on Instagram<ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
          {l.public_email && (
            <a href={`mailto:${l.public_email}`} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium transition-colors duration-200 hover:bg-surface-2">
              <Mail className="size-3.5" aria-hidden />{l.public_email}
            </a>
          )}
          <StatusBadge status={l.status} />
        </div>

        {l.bio && <p className="whitespace-pre-line rounded-lg bg-surface-2 p-3 text-sm">{l.bio}</p>}

        <dl className="grid grid-cols-3 gap-2 text-center">
          {[["Score", Math.round(l.score)], ["Followers", l.followers?.toLocaleString("en-IN") ?? "–"], ["Last post", fmtDate(l.last_post_at)]].map(([k, v]) => (
            <div key={k as string} className="rounded-lg border border-border bg-surface py-2">
              <dt className="text-[11px] uppercase tracking-wide text-muted">{k}</dt>
              <dd className="font-mono font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>

        <Card title="Likely challenges">
          {l.challenges?.length ? (
            <ul className="space-y-3">
              {l.challenges.map((c) => (
                <li key={c.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{chName(c.id)}</span>
                    {c.id === l.primary_challenge && <Pill tone="accent">Primary</Pill>}
                    <Pill tone={CONF_TONE[c.confidence] ?? "default"}>{c.confidence} confidence</Pill>
                  </div>
                  <p className="mt-1 text-sm text-muted">{c.evidence}</p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-muted">
              Not analysed yet.
              <CopyCommand className="mt-2" command={`/analyze-leads ${slug}`} />
            </div>
          )}
        </Card>

        <Card title="Record outreach">
          <LeadStatusForm business={slug} username={l.username} status={l.status} campaign={l.campaign} campaigns={campaigns} />
          <p className="mt-3 text-xs text-muted">Send messages yourself from the Instagram app. Nothing here contacts the lead.</p>
        </Card>

        <Card title="Why this score">
          {l.disqualified_reason
            ? <p className="text-sm text-danger">Disqualified: {l.disqualified_reason}</p>
            : <ul className="list-disc space-y-1 pl-5 text-sm">{l.score_reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
          {l.discovered_via?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {l.discovered_via.map((d) => <Pill key={`${d.type}:${d.value}`}>{d.type === "hashtag" ? `#${d.value}` : `${d.type}: ${d.value}`}</Pill>)}
            </div>
          )}
        </Card>

        {posts.length > 0 && (
          <Card title="Recent posts">
            <ul className="space-y-3">
              {posts.slice(0, 6).map((p, i) => (
                <li key={p.shortcode ?? i} className="text-sm">
                  <p className="line-clamp-3">{p.caption || <span className="text-muted">No caption</span>}</p>
                  <p className="mt-0.5 font-mono text-xs text-muted">
                    {p.likes ?? 0} likes · {p.comments ?? 0} comments{p.taken_at ? ` · ${fmtDate(p.taken_at)}` : ""}
                    {p.shortcode && <> · <a className="cursor-pointer text-primary hover:underline" href={`https://www.instagram.com/p/${p.shortcode}/`} target="_blank" rel="noopener noreferrer">open</a></>}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title="History">
          {history.length === 0 ? <p className="text-sm text-muted">No status changes yet.</p> : (
            <ol className="relative space-y-3 border-l border-border pl-4">
              {history.map((h) => (
                <li key={h.id} className="text-sm">
                  <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-surface bg-primary" aria-hidden />
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={h.to_status} />
                    {h.campaign && <Pill>{h.campaign}</Pill>}
                    <span className="text-xs text-muted">{fmtAgo(h.created_at)}</span>
                  </div>
                  {h.note && <p className="mt-1 text-muted">{h.note}</p>}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}

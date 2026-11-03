import { AlertTriangle, Hash, MapPin, Search } from "lucide-react";
import { CopyCommand } from "@/components/client";
import { Card, PageHeader, Pill, fmtAgo, humanize } from "@/components/ui";
import { getBusiness, openNeeds } from "@/lib/queries";

export const metadata = { title: "Profile" };

function isNeed(v: unknown) {
  return typeof v === "string" && v.trim().startsWith("NEED");
}

function Fact({ label, value }: { label: string; value: unknown }) {
  const list = Array.isArray(value) ? value : [value];
  return (
    <div className="border-t border-border py-2.5 first:border-0 sm:grid sm:grid-cols-3 sm:gap-3">
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className="mt-1 space-y-1 text-sm sm:col-span-2 sm:mt-0">
        {list.length === 0 || (list.length === 1 && !list[0]) ? <span className="text-muted">–</span> : list.map((v, i) =>
          isNeed(v)
            ? <p key={i} className="flex items-start gap-1.5 text-accent-text"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /><span><span className="sr-only">Missing: </span>{String(v).replace(/^NEED:?\s*/, "")}</span></p>
            : <p key={i}>{typeof v === "object" ? JSON.stringify(v) : String(v)}</p>)}
      </dd>
    </div>
  );
}

export default async function ProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const b = await getBusiness(slug);
  const icp = b.icp;
  const brand = b.brand as Record<string, unknown>;
  const needs = openNeeds(brand);
  const voice = (brand.voice ?? {}) as Record<string, unknown>;
  const weights = icp.weights ?? {};
  const wTotal = Object.values(weights).reduce((a, v) => a + v, 0) || 1;

  return (
    <>
      <PageHeader title="Business profile" subtitle={<>Saved {fmtAgo(b.updated_at)}. Edit <code className="font-mono">businesses/{slug}/</code> and re-save to change it.</>} />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Brand facts" action={needs.length ? <Pill tone="accent">{needs.length} missing</Pill> : <Pill tone="success">Complete</Pill>}>
          <p className="mb-2 text-xs text-muted">The only facts content and outreach may use. Missing ones become [NEED] placeholders, never invented claims.</p>
          <dl>
            <Fact label="One-liner" value={brand.one_liner} />
            <Fact label="Audience" value={brand.audience} />
            <Fact label="Value props" value={brand.value_props} />
            <Fact label="Proof points" value={brand.proof_points} />
            <Fact label="Offer" value={brand.offer} />
            <Fact label="Call to action" value={brand.cta} />
            <Fact label="Voice" value={voice.tone} />
            <Fact label="Avoid" value={voice.avoid} />
            <Fact label="Content pillars" value={brand.content_pillars} />
            <Fact label="Instagram / website" value={[brand.instagram_handle, brand.website]} />
          </dl>
        </Card>

        <div className="space-y-4">
          <Card title="Who we look for">
            <p className="text-sm">{icp.target_customer}</p>
            <div className="mt-3 space-y-3">
              {Object.entries(icp.segments ?? {}).map(([seg, kws]) => (
                <div key={seg}>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">{humanize(seg)}</p>
                  <div className="mt-1 flex flex-wrap gap-1">{kws.map((k) => <Pill key={k}>{k}</Pill>)}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Where we search">
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-1.5"><Hash className="size-4 text-primary" aria-label="Hashtags" />
                {(icp.discovery?.hashtags ?? []).map((h) => <Pill key={h} tone="primary">#{h}</Pill>)}</div>
              <div className="flex flex-wrap items-center gap-1.5"><Search className="size-4 text-primary" aria-label="Keyword searches" />
                {(icp.discovery?.keyword_searches ?? []).map((h) => <Pill key={h}>{h}</Pill>)}</div>
              {icp.discovery?.cities?.length ? <div className="flex flex-wrap items-center gap-1.5"><MapPin className="size-4 text-primary" aria-label="Cities" />
                {icp.discovery.cities.map((h) => <Pill key={h}>{h}</Pill>)}</div> : null}
              <p className="text-xs text-muted">Daily profile lookup cap: {icp.discovery?.max_profile_lookups_per_day ?? 150} (protects the Instagram account)</p>
            </div>
          </Card>

          <Card title="Scoring weights">
            <div className="flex h-3 overflow-hidden rounded-full" aria-hidden>
              {Object.entries(weights).map(([k, v], i) => (
                <span key={k} style={{ width: `${(v / wTotal) * 100}%`, background: `color-mix(in oklab, var(--primary) ${100 - i * 18}%, var(--accent))` }} />
              ))}
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-1 text-sm sm:grid-cols-3">
              {Object.entries(weights).map(([k, v]) => <li key={k}><span className="text-muted">{humanize(k)}</span> <span className="font-mono">{v}</span></li>)}
            </ul>
            <p className="mt-2 text-xs text-muted">Tier A at {icp.tiers?.A ?? 70}+, tier B at {icp.tiers?.B ?? 50}+.</p>
          </Card>
        </div>
      </div>

      <Card title="Challenge library" className="mt-4">
        <p className="mb-3 text-xs text-muted">The problems this business solves. The Lead Analyst checks every lead against these, and campaigns are grouped by them.</p>
        <ul className="grid gap-3 md:grid-cols-2">
          {(icp.challenge_library ?? []).map((c) => (
            <li key={c.id} className="rounded-lg border border-border p-3">
              <p className="font-medium">{c.name}</p>
              {c.evidence_hint && <p className="mt-1 text-sm text-muted">Looks like: {c.evidence_hint}</p>}
              {c.value_prop_hint && (isNeed(c.value_prop_hint)
                ? <p className="mt-1 text-sm text-accent-text">Value prop missing: {c.value_prop_hint.replace(/^NEED:?\s*/, "")}</p>
                : <p className="mt-1 text-sm">Solved by: {c.value_prop_hint}</p>)}
              <div className="mt-2 flex flex-wrap gap-1">{(c.signals ?? []).slice(0, 8).map((s) => <Pill key={s}>{s}</Pill>)}</div>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="After editing the profile files" className="mt-4">
        <CopyCommand className="max-w-lg" command={`python scripts/db.py upsert-business -b ${slug}`} />
      </Card>
    </>
  );
}

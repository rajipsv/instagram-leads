"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// SVG presentation attributes can't read CSS variables, so charts use fixed colours that read well in both themes.
const C = { primary: "#3b82f6", found: "#3b82f6", contacted: "#f59e0b", replied: "#22c55e", grid: "#94a3b840", tick: "#64748b", muted: "#94a3b8" };

const tooltipStyle = {
  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 12,
};

/** Funnel as labelled horizontal bars with stage-to-stage conversion (ui-ux-pro-max: funnel = labels + %). */
export function Funnel({ stages }: { stages: { label: string; value: number }[] }) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <ol className="space-y-2.5" aria-label="Lead funnel">
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1].value : null;
        const conv = prev ? Math.round((s.value / prev) * 100) : null;
        return (
          <li key={s.label}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-medium">{s.label}</span>
              <span className="font-mono tabular-nums">
                {s.value}
                {conv !== null && <span className="ml-2 text-xs text-muted">{prev ? `${conv}%` : "–"} of previous</span>}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <div className="h-full rounded-full transition-[width] duration-300"
                style={{ width: `${Math.max(2, (s.value / max) * 100)}%`, background: `color-mix(in oklab, var(--primary) ${100 - i * 12}%, var(--secondary))` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function WeeklyTrend({ data }: { data: { week: string; found: number; contacted: number; replied: number }[] }) {
  return (
    <div className="h-56" role="img" aria-label="Leads found, contacted and replied per week for the last 8 weeks">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="week" tick={{ fill: C.tick, fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: C.tick, fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Area type="monotone" dataKey="found" name="Found" stroke={C.found} fill={C.found} fillOpacity={0.15} strokeWidth={2} />
          <Area type="monotone" dataKey="contacted" name="Contacted" stroke={C.contacted} fill={C.contacted} fillOpacity={0.15} strokeWidth={2} strokeDasharray="5 3" />
          <Area type="monotone" dataKey="replied" name="Replied" stroke={C.replied} fill={C.replied} fillOpacity={0.15} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChallengeBars({ data }: { data: { label: string; leads: number }[] }) {
  return (
    <div style={{ height: Math.max(120, data.length * 34) }} role="img"
      aria-label={`Qualified leads per primary challenge: ${data.map((d) => `${d.label} ${d.leads}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={150} tick={{ fill: C.tick, fontSize: 12 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: C.grid }} />
          <Bar dataKey="leads" name="Leads" radius={[0, 4, 4, 0]} label={{ position: "right", fill: C.tick, fontSize: 12 }}>
            {data.map((d) => <Cell key={d.label} fill={d.label === "Not analysed yet" ? C.muted : C.primary} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Ev = { id: string; date: string; client: string; trajet: string; volume: number | null };

const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export default function AgendaClient({ events }: { events: Ev[] }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const byDay = useMemo(() => {
    const m = new Map<string, Ev[]>();
    events.forEach((e) => {
      const key = e.date.slice(0, 10);
      m.set(key, [...(m.get(key) ?? []), e]);
    });
    return m;
  }, [events]);

  // Cases du mois (lundi = début de semaine)
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const monthEvents = events
    .filter((e) => {
      const d = new Date(e.date);
      return d.getFullYear() === year && d.getMonth() === month;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  function shift(delta: number) {
    const m = month + delta;
    setYear(year + Math.floor(m / 12));
    setMonth(((m % 12) + 12) % 12);
  }

  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="rounded-2xl border border-line bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-2xl">
            {MONTHS[month]} {year}
          </h3>
          <div className="flex gap-1">
            <button onClick={() => shift(-1)} className="rounded-lg border border-line px-3 py-1.5 text-sm transition hover:bg-subtle">←</button>
            <button
              onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }}
              className="rounded-lg border border-line px-3 py-1.5 text-sm transition hover:bg-subtle"
            >
              Aujourd&apos;hui
            </button>
            <button onClick={() => shift(1)} className="rounded-lg border border-line px-3 py-1.5 text-sm transition hover:bg-subtle">→</button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {DAYS.map((d) => (
            <div key={d} className="pb-2 text-xs font-medium text-ink-soft">{d}</div>
          ))}
          {cells.map((day, i) => {
            if (day == null) return <div key={i} />;
            const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const evs = byDay.get(key) ?? [];
            const isToday = key === todayKey;
            return (
              <div
                key={i}
                className={`min-h-[70px] rounded-lg border p-1.5 text-left ${
                  isToday ? "border-accent bg-accent-soft/40" : "border-line"
                }`}
              >
                <div className="text-xs text-ink-soft">{day}</div>
                {evs.slice(0, 2).map((e) => (
                  <Link
                    key={e.id}
                    href={`/dashboard/${e.id}`}
                    className="mt-1 block truncate rounded bg-accent px-1.5 py-0.5 text-[10px] text-white"
                    title={`${e.client} · ${e.trajet}`}
                  >
                    {e.client}
                  </Link>
                ))}
                {evs.length > 2 && <div className="mt-0.5 text-[10px] text-ink-soft">+{evs.length - 2}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Liste du mois */}
      <div className="rounded-2xl border border-line bg-card p-5">
        <h3 className="eyebrow mb-4 text-ink-soft">Déménagements du mois ({monthEvents.length})</h3>
        {monthEvents.length === 0 ? (
          <p className="text-sm text-ink-soft">Aucun déménagement planifié ce mois-ci.</p>
        ) : (
          <div className="divide-y divide-line/70">
            {monthEvents.map((e) => (
              <Link key={e.id} href={`/dashboard/${e.id}`} className="block py-3 hover:text-accent">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{e.client}</span>
                  <span className="text-xs text-ink-soft">
                    {new Date(e.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                  </span>
                </div>
                <div className="text-xs text-ink-soft">
                  {e.trajet}
                  {e.volume != null ? ` · ${e.volume} m³` : ""}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

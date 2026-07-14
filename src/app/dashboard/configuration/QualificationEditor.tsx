"use client";

import { useState, useTransition } from "react";
import type { CriterionConfig } from "@/lib/qualification";
import { saveQualifConfig } from "@/lib/actions/qualification";

export default function QualificationEditor({ criteria }: { criteria: CriterionConfig[] }) {
  const [list, setList] = useState<CriterionConfig[]>(criteria);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const patch = (key: string, p: Partial<CriterionConfig>) =>
    setList((l) => l.map((c) => (c.key === key ? { ...c, ...p } : c)));

  const totalPoids = list.filter((c) => c.enabled).reduce((s, c) => s + c.poids, 0);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-subtle/50 px-4 py-3 text-sm text-ink-soft">
        La note finale est une moyenne <span className="font-medium text-ink">pondérée</span> des critères activés
        (poids total actuel : <span className="font-medium text-ink">{totalPoids}</span>). Pour chaque critère, la note
        passe de 0 à 100 entre la valeur <span className="font-medium text-ink">plancher</span> et la valeur
        <span className="font-medium text-ink"> cible</span>.
      </div>

      <div className="space-y-3">
        {list.map((c) => (
          <div key={c.key} className={`rounded-xl border p-4 transition ${c.enabled ? "border-line bg-card" : "border-line bg-subtle/40 opacity-70"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={c.enabled}
                  onChange={(e) => patch(c.key, { enabled: e.target.checked })}
                  className="mt-1 h-4 w-4 accent-[var(--color-accent)]"
                />
                <div>
                  <div className="font-medium">{c.label}</div>
                  <div className="text-xs text-ink-soft">{c.description}</div>
                </div>
              </label>
            </div>

            {c.enabled && (
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 flex items-center justify-between text-xs text-ink-soft">
                    Poids <span className="font-medium text-ink">{c.poids}</span>
                  </span>
                  <input
                    type="range" min={0} max={50} value={c.poids}
                    onChange={(e) => patch(c.key, { poids: Number(e.target.value) })}
                    className="w-full accent-[var(--color-accent)]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-ink-soft">Plancher (note 0) {c.unit && `· ${c.unit}`}</span>
                  <input
                    type="number" value={c.floor}
                    onChange={(e) => patch(c.key, { floor: Number(e.target.value) })}
                    className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-ink-soft">Cible (note 100) {c.unit && `· ${c.unit}`}</span>
                  <input
                    type="number" value={c.target}
                    onChange={(e) => patch(c.key, { target: Number(e.target.value) })}
                    className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </label>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() =>
            start(async () => {
              await saveQualifConfig(list);
              setSaved(true);
              setTimeout(() => setSaved(false), 1500);
            })
          }
          disabled={pending}
          className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50"
        >
          {pending ? "…" : saved ? "Enregistré ✓" : "Enregistrer la configuration"}
        </button>
        <button
          onClick={() => setList(criteria)}
          className="text-sm text-ink-soft transition hover:text-ink"
        >
          Réinitialiser
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import type { PricingGridRow } from "@/lib/types";
import { createGrid, updateGrid, deleteGrid, setDefaultGrid, type GridInput } from "@/lib/actions/grids";

const FIELDS: { key: keyof GridInput; label: string; unit: string }[] = [
  { key: "base_price", label: "Forfait de base", unit: "€" },
  { key: "price_per_m3", label: "Prix au m³", unit: "€/m³" },
  { key: "price_per_km", label: "Prix au km", unit: "€/km" },
  { key: "floor_surcharge", label: "Majoration / étage sans ascenseur", unit: "€" },
  { key: "long_carry_surcharge", label: "Portage long", unit: "€" },
  { key: "packing_price_per_m3", label: "Emballage", unit: "€/m³" },
  { key: "furniture_lift_price", label: "Monte-meuble", unit: "€" },
  { key: "min_price", label: "Prix plancher", unit: "€" },
  { key: "vat_rate", label: "TVA", unit: "%" },
];

const empty: GridInput = {
  name: "Nouvelle grille",
  base_price: 0,
  price_per_m3: 0,
  price_per_km: 0,
  floor_surcharge: 0,
  long_carry_surcharge: 0,
  packing_price_per_m3: 0,
  furniture_lift_price: 0,
  min_price: 0,
  vat_rate: 20,
  is_active: true,
  notes: null,
};

function toInput(g: PricingGridRow): GridInput {
  return {
    name: g.name,
    base_price: g.base_price,
    price_per_m3: g.price_per_m3,
    price_per_km: g.price_per_km,
    floor_surcharge: g.floor_surcharge,
    long_carry_surcharge: g.long_carry_surcharge,
    packing_price_per_m3: g.packing_price_per_m3,
    furniture_lift_price: g.furniture_lift_price,
    min_price: g.min_price,
    vat_rate: g.vat_rate,
    is_active: g.is_active,
    notes: g.notes,
  };
}

export default function GridsManager({ grids }: { grids: PricingGridRow[] }) {
  const [selected, setSelected] = useState<string | "new" | null>(
    grids.find((g) => g.is_default)?.id ?? grids[0]?.id ?? null,
  );

  const current = selected === "new" ? null : grids.find((g) => g.id === selected) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      {/* Liste des grilles */}
      <div className="space-y-2">
        {grids.map((g) => (
          <button
            key={g.id}
            onClick={() => setSelected(g.id)}
            className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
              selected === g.id ? "border-accent bg-accent-soft/40" : "border-line bg-card hover:border-line-strong"
            }`}
          >
            <div>
              <div className="font-medium">{g.name}</div>
              <div className="text-xs text-ink-soft">
                {g.base_price}€ + {g.price_per_m3}€/m³
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {g.is_default && (
                <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-white">
                  défaut
                </span>
              )}
              {!g.is_active && <span className="text-[10px] text-ink-soft">inactive</span>}
            </div>
          </button>
        ))}
        <button
          onClick={() => setSelected("new")}
          className={`w-full rounded-xl border border-dashed px-4 py-3 text-sm transition ${
            selected === "new" ? "border-accent text-accent" : "border-line-strong text-ink-soft hover:border-accent hover:text-accent"
          }`}
        >
          + Nouvelle grille
        </button>
      </div>

      {/* Éditeur */}
      <GridEditor
        key={selected ?? "none"}
        grid={current}
        isNew={selected === "new"}
        onSelectCreated={setSelected}
      />
    </div>
  );
}

function GridEditor({
  grid,
  isNew,
  onSelectCreated,
}: {
  grid: PricingGridRow | null;
  isNew: boolean;
  onSelectCreated: (id: string | "new" | null) => void;
}) {
  const [form, setForm] = useState<GridInput>(grid ? toInput(grid) : empty);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  if (!grid && !isNew) {
    return (
      <div className="rounded-xl border border-dashed border-line p-12 text-center text-ink-soft">
        Sélectionnez ou créez une grille.
      </div>
    );
  }

  const set = (k: keyof GridInput, v: string | number | boolean | null) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="rounded-xl border border-line bg-card p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 font-serif text-lg outline-none focus:border-accent"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => set("is_active", e.target.checked)}
            className="accent-[var(--color-accent)]"
          />
          Active
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1 block text-sm text-ink-soft">{f.label}</span>
            <div className="flex items-center rounded-lg border border-line bg-paper focus-within:border-accent">
              <input
                type="number"
                step="0.01"
                value={form[f.key] as number}
                onChange={(e) => set(f.key, e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-full bg-transparent px-3 py-2 outline-none"
              />
              <span className="px-3 text-sm text-ink-soft">{f.unit}</span>
            </div>
          </label>
        ))}
      </div>

      <label className="mt-4 block">
        <span className="mb-1 block text-sm text-ink-soft">Notes</span>
        <textarea
          value={form.notes ?? ""}
          onChange={(e) => set("notes", e.target.value || null)}
          rows={2}
          className="w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={() =>
            start(async () => {
              if (isNew) {
                await createGrid(form);
                onSelectCreated(null);
              } else if (grid) {
                await updateGrid(grid.id, form);
              }
              setSaved(true);
              setTimeout(() => setSaved(false), 1500);
            })
          }
          disabled={pending}
          className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50"
        >
          {pending ? "…" : saved ? "Enregistré ✓" : isNew ? "Créer la grille" : "Enregistrer"}
        </button>

        {grid && !grid.is_default && (
          <>
            <button
              onClick={() => start(() => setDefaultGrid(grid.id))}
              disabled={pending}
              className="rounded-lg border border-line-strong px-4 py-2 text-sm transition hover:bg-accent-soft/40"
            >
              Définir par défaut
            </button>
            <button
              onClick={() => start(() => deleteGrid(grid.id))}
              disabled={pending}
              className="ml-auto rounded-lg px-4 py-2 text-sm text-accent transition hover:bg-accent-soft/40"
            >
              Supprimer
            </button>
          </>
        )}
      </div>
    </div>
  );
}

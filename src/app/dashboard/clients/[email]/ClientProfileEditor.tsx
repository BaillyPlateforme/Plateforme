"use client";

import { useState, useTransition } from "react";
import type { ClientProfileRow } from "@/lib/types";
import { saveClientProfile } from "@/lib/actions/clients";

export default function ClientProfileEditor({
  email,
  profile,
}: {
  email: string;
  profile: ClientProfileRow | null;
}) {
  const [nom, setNom] = useState(profile?.nom ?? "");
  const [telephone, setTelephone] = useState(profile?.telephone ?? "");
  const [societe, setSociete] = useState(profile?.societe ?? "");
  const [notes, setNotes] = useState(profile?.notes ?? "");
  const [tags, setTags] = useState((profile?.tags ?? []).join(", "));
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <section className="h-fit rounded-2xl border border-line bg-card p-5">
      <h3 className="eyebrow mb-4 text-ink-soft">Fiche client</h3>
      <div className="space-y-3">
        <Field label="Nom" value={nom} onChange={setNom} />
        <Field label="Téléphone" value={telephone} onChange={setTelephone} />
        <Field label="Société" value={societe} onChange={setSociete} />
        <Field label="Tags (séparés par des virgules)" value={tags} onChange={setTags} />
        <div>
          <label className="mb-1 block text-sm text-ink-soft">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            className="w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
            placeholder="Contexte, préférences, historique…"
          />
        </div>
        <button
          onClick={() =>
            start(async () => {
              await saveClientProfile({
                email,
                nom: nom || null,
                telephone: telephone || null,
                societe: societe || null,
                notes: notes || null,
                tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
              });
              setSaved(true);
              setTimeout(() => setSaved(false), 1500);
            })
          }
          disabled={pending}
          className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50"
        >
          {pending ? "…" : saved ? "Enregistré ✓" : "Enregistrer la fiche"}
        </button>
      </div>
    </section>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-sm text-ink-soft">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
      />
    </div>
  );
}

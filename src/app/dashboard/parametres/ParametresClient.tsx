"use client";

import { useState, useTransition } from "react";
import type { SettingsRow } from "@/lib/types";
import { saveSettings } from "@/lib/actions/settings";

export default function ParametresClient({ settings }: { settings: SettingsRow }) {
  const [f, setF] = useState({
    entreprise_nom: settings.entreprise_nom ?? "",
    entreprise_email: settings.entreprise_email ?? "",
    entreprise_tel: settings.entreprise_tel ?? "",
    entreprise_adresse: settings.entreprise_adresse ?? "",
    siret: settings.siret ?? "",
    signature_email: settings.signature_email ?? "",
    n8n_webhook_url: settings.n8n_webhook_url ?? "",
    devis_validite_jours: settings.devis_validite_jours ?? 30,
  });
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const set = (k: keyof typeof f, v: string | number) => setF((p) => ({ ...p, [k]: v }));

  function save() {
    start(async () => {
      await saveSettings({
        entreprise_nom: f.entreprise_nom,
        entreprise_email: f.entreprise_email || null,
        entreprise_tel: f.entreprise_tel || null,
        entreprise_adresse: f.entreprise_adresse || null,
        siret: f.siret || null,
        signature_email: f.signature_email || null,
        n8n_webhook_url: f.n8n_webhook_url || null,
        devis_validite_jours: Number(f.devis_validite_jours) || 30,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
      <Card title="Entreprise">
        <Field label="Nom" value={f.entreprise_nom} onChange={(v) => set("entreprise_nom", v)} />
        <Field label="Email" value={f.entreprise_email} onChange={(v) => set("entreprise_email", v)} />
        <Field label="Téléphone" value={f.entreprise_tel} onChange={(v) => set("entreprise_tel", v)} />
        <Field label="Adresse" value={f.entreprise_adresse} onChange={(v) => set("entreprise_adresse", v)} />
        <Field label="SIRET" value={f.siret} onChange={(v) => set("siret", v)} />
      </Card>

      <Card title="Devis & emails">
        <Field
          label="Validité des devis (jours)"
          type="number"
          value={String(f.devis_validite_jours)}
          onChange={(v) => set("devis_validite_jours", v)}
        />
        <div>
          <label className="mb-1 block text-sm text-ink-soft">Signature des emails</label>
          <textarea
            value={f.signature_email}
            onChange={(e) => set("signature_email", e.target.value)}
            rows={3}
            className="w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
            placeholder="L'équipe Bailly Déménagement"
          />
        </div>
        <Field
          label="Webhook n8n (envoi d'emails)"
          value={f.n8n_webhook_url}
          onChange={(v) => set("n8n_webhook_url", v)}
          placeholder="https://n8n.exemple.com/webhook/..."
        />
        <p className="text-xs text-ink-soft">
          Si renseigné, chaque email envoyé est transmis à ce webhook pour la livraison réelle.
        </p>
      </Card>

      <div className="lg:col-span-2">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50"
        >
          {pending ? "…" : saved ? "Enregistré ✓" : "Enregistrer les paramètres"}
        </button>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-line bg-card p-6">
      <h3 className="eyebrow mb-2 text-ink-soft">{title}</h3>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm text-ink-soft">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
      />
    </div>
  );
}

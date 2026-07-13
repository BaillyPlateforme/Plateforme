"use client";

import { useState, useTransition } from "react";
import type { AlertRow, MessageTemplate, Channel } from "@/lib/messaging";
import { MESSAGE_EVENTS, eventLabel } from "@/lib/messaging";
import { saveAlert, deleteAlert } from "@/lib/actions/alerts";

const empty = {
  name: "Nouvelle alerte", event: "devis_envoye", montant_min: "", channel: "email" as Channel,
  destinataire: "client" as "client" | "custom", destinataire_custom: "", template_id: "", active: true,
};

export default function AlertsManager({ alerts, templates }: { alerts: AlertRow[]; templates: MessageTemplate[] }) {
  const [selected, setSelected] = useState<string | "new" | null>(alerts[0]?.id ?? "new");
  const current = selected === "new" ? null : alerts.find((a) => a.id === selected) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <div className="space-y-2">
        {alerts.map((a) => (
          <button key={a.id} onClick={() => setSelected(a.id)}
            className={`w-full rounded-xl border px-4 py-3 text-left transition ${selected === a.id ? "border-accent bg-accent-soft/40" : "border-line bg-card hover:border-line-strong"}`}>
            <div className="flex items-center justify-between">
              <span className="truncate font-medium">{a.name}</span>
              <span className={`h-2 w-2 rounded-full ${a.active ? "bg-good" : "bg-line-strong"}`} />
            </div>
            <div className="mt-0.5 text-xs text-ink-soft">
              {eventLabel(a.event)} · {a.channel.toUpperCase()}
              {a.montant_min != null ? ` · ≥ ${a.montant_min} €` : ""}
            </div>
          </button>
        ))}
        <button onClick={() => setSelected("new")}
          className={`w-full rounded-xl border border-dashed px-4 py-3 text-sm transition ${selected === "new" ? "border-accent text-accent" : "border-line-strong text-ink-soft hover:border-accent hover:text-accent"}`}>
          + Nouvelle alerte
        </button>
      </div>

      <AlertEditor key={selected ?? "none"} alert={current} isNew={selected === "new"} templates={templates} onDone={setSelected} />
    </div>
  );
}

function AlertEditor({ alert, isNew, templates, onDone }: { alert: AlertRow | null; isNew: boolean; templates: MessageTemplate[]; onDone: (s: string | "new" | null) => void }) {
  const [f, setF] = useState(alert ? {
    name: alert.name, event: alert.event, montant_min: alert.montant_min?.toString() ?? "", channel: alert.channel,
    destinataire: alert.destinataire, destinataire_custom: alert.destinataire_custom ?? "", template_id: alert.template_id ?? "", active: alert.active,
  } : empty);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  if (!alert && !isNew) return <div className="rounded-xl border border-dashed border-line p-12 text-center text-ink-soft">Sélectionnez ou créez une alerte.</div>;

  const compatibleTemplates = templates.filter((t) => t.channel === f.channel);

  return (
    <div className="rounded-2xl border border-line bg-card p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <input value={f.name} onChange={(e) => set("name", e.target.value)} className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 font-serif text-lg outline-none focus:border-accent" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} className="accent-[var(--color-accent)]" />Active</label>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm text-ink-soft">Quand ? (événement déclencheur)</label>
          <select value={f.event} onChange={(e) => set("event", e.target.value)} className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent">
            {MESSAGE_EVENTS.filter((e) => e.key !== "manual").map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm text-ink-soft">Condition — montant TTC minimal (optionnel)</label>
          <div className="flex items-center rounded-lg border border-line bg-paper">
            <input type="number" value={f.montant_min} onChange={(e) => set("montant_min", e.target.value)} placeholder="Ex : 3000 — déclenche uniquement au-delà"
              className="w-full bg-transparent px-3 py-2 text-sm outline-none" />
            <span className="pr-3 text-sm text-ink-soft">€</span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-ink-soft">Canal</label>
            <select value={f.channel} onChange={(e) => { set("channel", e.target.value); set("template_id", ""); }} className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent">
              <option value="email">Email</option>
              <option value="sms">SMS</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-ink-soft">Template envoyé</label>
            <select value={f.template_id} onChange={(e) => set("template_id", e.target.value)} className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent">
              <option value="">— choisir —</option>
              {compatibleTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-ink-soft">Destinataire</label>
          <div className="flex flex-wrap items-center gap-3">
            <select value={f.destinataire} onChange={(e) => set("destinataire", e.target.value)} className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent">
              <option value="client">Le client</option>
              <option value="custom">Adresse / numéro fixe (équipe)</option>
            </select>
            {f.destinataire === "custom" && (
              <input value={f.destinataire_custom} onChange={(e) => set("destinataire_custom", e.target.value)} placeholder={f.channel === "sms" ? "06 12 34 56 78" : "equipe@bailly.fr"}
                className="min-w-[180px] flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent" />
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button onClick={() => start(async () => {
          await saveAlert(alert?.id ?? null, {
            name: f.name, event: f.event, montant_min: f.montant_min ? Number(f.montant_min) : null,
            channel: f.channel, destinataire: f.destinataire, destinataire_custom: f.destinataire === "custom" ? f.destinataire_custom || null : null,
            template_id: f.template_id || null, active: f.active,
          });
          if (isNew) onDone(null);
          setSaved(true); setTimeout(() => setSaved(false), 1500);
        })} disabled={pending || !f.template_id}
          className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50">
          {pending ? "…" : saved ? "Enregistré ✓" : isNew ? "Créer l'alerte" : "Enregistrer"}
        </button>
        {!f.template_id && <span className="text-xs text-ink-soft">Choisissez un template pour activer.</span>}
        {alert && (
          <button onClick={() => start(() => deleteAlert(alert.id).then(() => onDone(null)))} disabled={pending}
            className="ml-auto rounded-lg px-4 py-2 text-sm text-accent transition hover:bg-accent-soft/40">Supprimer</button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import type { MessageTemplate, Channel } from "@/lib/messaging";
import { MESSAGE_EVENTS, TEMPLATE_VARIABLES, eventLabel } from "@/lib/messaging";
import { saveTemplate, deleteTemplate } from "@/lib/actions/templates";

const empty = { name: "Nouveau template", channel: "email" as Channel, event: "manual", sujet: "", contenu: "", active: true };

export default function TemplatesManager({ templates }: { templates: MessageTemplate[] }) {
  const [selected, setSelected] = useState<string | "new" | null>(templates[0]?.id ?? "new");
  const current = selected === "new" ? null : templates.find((t) => t.id === selected) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <div className="space-y-2">
        {templates.map((t) => (
          <button key={t.id} onClick={() => setSelected(t.id)}
            className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${selected === t.id ? "border-accent bg-accent-soft/40" : "border-line bg-card hover:border-line-strong"}`}>
            <div className="min-w-0">
              <div className="truncate font-medium">{t.name}</div>
              <div className="text-xs text-ink-soft">{eventLabel(t.event)}</div>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${t.channel === "sms" ? "bg-blue-100 text-blue-800" : "bg-accent-soft text-accent-dark"}`}>
              {t.channel.toUpperCase()}
            </span>
          </button>
        ))}
        <button onClick={() => setSelected("new")}
          className={`w-full rounded-xl border border-dashed px-4 py-3 text-sm transition ${selected === "new" ? "border-accent text-accent" : "border-line-strong text-ink-soft hover:border-accent hover:text-accent"}`}>
          + Nouveau template
        </button>
      </div>

      <TemplateEditor key={selected ?? "none"} template={current} isNew={selected === "new"} onDone={setSelected} />
    </div>
  );
}

function TemplateEditor({ template, isNew, onDone }: { template: MessageTemplate | null; isNew: boolean; onDone: (s: string | "new" | null) => void }) {
  const [f, setF] = useState(template ? {
    name: template.name, channel: template.channel, event: template.event, sujet: template.sujet ?? "", contenu: template.contenu, active: template.active,
  } : empty);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  if (!template && !isNew) return <div className="rounded-xl border border-dashed border-line p-12 text-center text-ink-soft">Sélectionnez ou créez un template.</div>;

  return (
    <div className="rounded-2xl border border-line bg-card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <input value={f.name} onChange={(e) => set("name", e.target.value)} className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 font-serif text-lg outline-none focus:border-accent" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} className="accent-[var(--color-accent)]" />Actif</label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm text-ink-soft">Canal</label>
          <select value={f.channel} onChange={(e) => set("channel", e.target.value)} className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent">
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-ink-soft">Déclencheur associé</label>
          <select value={f.event} onChange={(e) => set("event", e.target.value)} className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent">
            {MESSAGE_EVENTS.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
          </select>
        </div>
      </div>

      {f.channel === "email" && (
        <div className="mt-4">
          <label className="mb-1 block text-sm text-ink-soft">Sujet</label>
          <input value={f.sujet} onChange={(e) => set("sujet", e.target.value)} className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent" placeholder="Votre devis {{reference}}" />
        </div>
      )}

      <div className="mt-4">
        <label className="mb-1 block text-sm text-ink-soft">{f.channel === "sms" ? "Message (SMS)" : "Corps du message"}</label>
        <textarea value={f.contenu} onChange={(e) => set("contenu", e.target.value)} rows={f.channel === "sms" ? 4 : 8}
          className="w-full resize-y rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent" placeholder="Bonjour {{client_nom}}, …" />
      </div>

      <div className="mt-3">
        <div className="mb-1.5 text-xs text-ink-soft">Insérer une variable :</div>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATE_VARIABLES.map((v) => (
            <button key={v.token} type="button" onClick={() => set("contenu", f.contenu + " " + v.token)}
              title={v.label} className="rounded-full border border-line bg-paper px-2.5 py-1 font-mono text-[11px] transition hover:border-accent hover:text-accent">
              {v.token}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button onClick={() => start(async () => {
          await saveTemplate(template?.id ?? null, { name: f.name, channel: f.channel, event: f.event, sujet: f.channel === "email" ? f.sujet || null : null, contenu: f.contenu, active: f.active });
          if (isNew) onDone(null);
          setSaved(true); setTimeout(() => setSaved(false), 1500);
        })} disabled={pending} className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50">
          {pending ? "…" : saved ? "Enregistré ✓" : isNew ? "Créer le template" : "Enregistrer"}
        </button>
        {template && (
          <button onClick={() => start(() => deleteTemplate(template.id).then(() => onDone(null)))} disabled={pending}
            className="ml-auto rounded-lg px-4 py-2 text-sm text-accent transition hover:bg-accent-soft/40">Supprimer</button>
        )}
      </div>
    </div>
  );
}

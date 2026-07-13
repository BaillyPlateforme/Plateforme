"use client";

import { useMemo, useState, useTransition } from "react";
import type { MessageTemplate, Channel } from "@/lib/messaging";
import { renderTemplate } from "@/lib/messaging";
import { sendTest } from "@/lib/actions/alerts";

const SAMPLE_FIELDS: { key: string; label: string; def: string }[] = [
  { key: "client_nom", label: "Nom du client", def: "Camille Durand" },
  { key: "reference", label: "Référence", def: "DEV-2026-0001" },
  { key: "montant_ttc", label: "Montant TTC", def: "1440" },
  { key: "montant_ht", label: "Montant HT", def: "1200" },
  { key: "ville_depart", label: "Ville départ", def: "Lyon" },
  { key: "ville_arrivee", label: "Ville arrivée", def: "Toulouse" },
  { key: "volume", label: "Volume", def: "30" },
  { key: "entreprise_nom", label: "Entreprise", def: "Bailly Déménagement" },
];

export default function SimulationClient({ templates }: { templates: MessageTemplate[] }) {
  const [templateId, setTemplateId] = useState<string>("");
  const [channel, setChannel] = useState<Channel>("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [to, setTo] = useState("");
  const [sample, setSample] = useState<Record<string, string>>(
    Object.fromEntries(SAMPLE_FIELDS.map((f) => [f.key, f.def])),
  );
  const [pending, start] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);

  function loadTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (t) {
      setChannel(t.channel);
      setSubject(t.sujet ?? "");
      setBody(t.contenu);
    }
  }

  const previewSubject = useMemo(() => renderTemplate(subject, sample), [subject, sample]);
  const previewBody = useMemo(() => renderTemplate(body, sample), [body, sample]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Composition */}
      <div className="space-y-4 rounded-2xl border border-line bg-card p-6">
        <h3 className="eyebrow text-ink-soft">Message à tester</h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm text-ink-soft">Depuis un template</label>
            <select value={templateId} onChange={(e) => loadTemplate(e.target.value)} className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent">
              <option value="">— message libre —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.channel})</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-ink-soft">Canal</label>
            <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent">
              <option value="email">Email</option>
              <option value="sms">SMS</option>
            </select>
          </div>
        </div>

        {channel === "email" && (
          <div>
            <label className="mb-1 block text-sm text-ink-soft">Sujet</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent" />
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm text-ink-soft">Contenu</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={channel === "sms" ? 4 : 7}
            className="w-full resize-y rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent" placeholder="Bonjour {{client_nom}}, …" />
        </div>

        <div>
          <div className="mb-1.5 text-xs text-ink-soft">Variables d&apos;exemple (pour l&apos;aperçu)</div>
          <div className="grid grid-cols-2 gap-2">
            {SAMPLE_FIELDS.map((sf) => (
              <input key={sf.key} value={sample[sf.key]} onChange={(e) => setSample((s) => ({ ...s, [sf.key]: e.target.value }))}
                placeholder={sf.label} className="rounded-md border border-line bg-paper px-2 py-1 text-xs outline-none focus:border-accent" />
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-ink-soft">Envoyer le test à</label>
          <div className="flex gap-2">
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder={channel === "sms" ? "06 12 34 56 78" : "vous@email.fr"}
              className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent" />
            <button onClick={() => start(async () => {
              const r = await sendTest(channel, to, previewBody, previewSubject);
              setFlash(r.message); setTimeout(() => setFlash(null), 5000);
            })} disabled={pending || !to.trim()}
              className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-40">
              {pending ? "Envoi…" : "Envoyer le test"}
            </button>
          </div>
          {flash && <p className="mt-2 text-sm text-ink-soft">{flash}</p>}
        </div>
      </div>

      {/* Aperçu */}
      <div className="rounded-2xl border border-line bg-card p-6">
        <h3 className="eyebrow mb-4 text-ink-soft">Aperçu</h3>
        {channel === "email" ? (
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="border-b border-line bg-subtle px-4 py-2.5 text-sm">
              <div className="text-ink-soft">Sujet</div>
              <div className="font-medium">{previewSubject || "—"}</div>
            </div>
            <div className="whitespace-pre-wrap px-4 py-4 text-sm text-ink">{previewBody || "—"}</div>
          </div>
        ) : (
          <div className="mx-auto max-w-xs rounded-2xl border border-line bg-subtle p-4">
            <div className="rounded-2xl bg-card p-3 text-sm shadow-sm">
              <div className="mb-1 text-xs text-ink-soft">SMS · Bailly</div>
              <div className="whitespace-pre-wrap">{previewBody || "—"}</div>
            </div>
            <div className="mt-2 text-right text-[11px] text-ink-soft">{previewBody.length} caractères</div>
          </div>
        )}
      </div>
    </div>
  );
}

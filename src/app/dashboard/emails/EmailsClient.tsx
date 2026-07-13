"use client";

import { useState, useTransition } from "react";
import type { EmailRow } from "@/lib/types";
import { sendEmail } from "@/lib/actions/emails";

type Template = { key: string; label: string; sujet: string; corps: string };

export default function EmailsClient({
  emails,
  templates,
  recipients,
  webhookConfigured,
}: {
  emails: EmailRow[];
  templates: Template[];
  recipients: { email: string; nom: string | null }[];
  webhookConfigured: boolean;
}) {
  const [to, setTo] = useState("");
  const [sujet, setSujet] = useState("");
  const [corps, setCorps] = useState("");
  const [template, setTemplate] = useState("libre");
  const [pending, start] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);

  function applyTemplate(key: string) {
    setTemplate(key);
    const t = templates.find((x) => x.key === key);
    if (t) {
      setSujet(t.sujet);
      setCorps(t.corps);
    }
  }

  function submit() {
    if (!to.trim() || !sujet.trim()) return;
    start(async () => {
      const res = await sendEmail({ destinataire: to, sujet, corps, template });
      setFlash(res.status === "envoye" ? "Email envoyé ✓" : `Échec : ${res.erreur ?? "erreur"}`);
      if (res.status === "envoye") {
        setSujet(""); setCorps(""); setTo(""); setTemplate("libre");
      }
      setTimeout(() => setFlash(null), 3000);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      {/* Composer */}
      <div className="rounded-2xl border border-line bg-card p-6">
        <h3 className="eyebrow mb-4 text-ink-soft">Nouveau message</h3>

        {!webhookConfigured && (
          <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Aucun webhook n8n configuré (Paramètres) : les emails sont journalisés mais non expédiés.
          </div>
        )}

        <label className="mb-3 block">
          <span className="mb-1 block text-sm text-ink-soft">Destinataire</span>
          <input
            list="recipients"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="email@client.fr"
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <datalist id="recipients">
            {recipients.map((r) => (
              <option key={r.email} value={r.email}>{r.nom ?? r.email}</option>
            ))}
          </datalist>
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block text-sm text-ink-soft">Modèle</span>
          <select
            value={template}
            onChange={(e) => applyTemplate(e.target.value)}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {templates.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block text-sm text-ink-soft">Sujet</span>
          <input
            value={sujet}
            onChange={(e) => setSujet(e.target.value)}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-sm text-ink-soft">Message</span>
          <textarea
            value={corps}
            onChange={(e) => setCorps(e.target.value)}
            rows={9}
            className="w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            onClick={submit}
            disabled={pending || !to.trim() || !sujet.trim()}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50"
          >
            {pending ? "Envoi…" : "Envoyer"}
          </button>
          {flash && <span className="text-sm text-ink-soft">{flash}</span>}
        </div>
      </div>

      {/* Historique */}
      <div className="rounded-2xl border border-line bg-card p-6">
        <h3 className="eyebrow mb-4 text-ink-soft">Historique ({emails.length})</h3>
        {emails.length === 0 ? (
          <p className="text-sm text-ink-soft">Aucun email envoyé.</p>
        ) : (
          <div className="divide-y divide-line/70">
            {emails.map((e) => (
              <div key={e.id} className="py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{e.sujet}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      e.status === "envoye" ? "bg-accent-soft text-accent-dark" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {e.status === "envoye" ? "Envoyé" : "Échec"}
                  </span>
                </div>
                <div className="text-xs text-ink-soft">
                  {e.destinataire} · {new Date(e.created_at).toLocaleString("fr-FR")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

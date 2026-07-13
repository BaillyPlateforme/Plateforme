"use client";

import { useState, useTransition } from "react";
import { LAB_TEMPLATES, type LabTemplate } from "@/lib/lab-emails";
import { sendLabEmail, sendLabBatch } from "@/lib/actions/lab";

type Log = { name: string; ok: boolean; message: string; at: string };
type Pool = "devis" | "tous";

const TAG_STYLE: Record<string, string> = {
  complet: "bg-good/15 text-good",
  "sans volume": "bg-amber-100 text-amber-800",
  "sans adresse": "bg-amber-100 text-amber-800",
  entreprise: "bg-blue-100 text-blue-800",
};

export default function LabClient() {
  const [pool, setPool] = useState<Pool>("devis");
  const [logs, setLogs] = useState<Log[]>([]);
  const [pending, start] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);

  // Composer libre
  const [cFrom, setCFrom] = useState("");
  const [cSubject, setCSubject] = useState("");
  const [cText, setCText] = useState("");

  const filtered = pool === "devis" ? LAB_TEMPLATES.filter((t) => t.category === "devis") : LAB_TEMPLATES;

  function log(name: string, r: { ok: boolean; message: string }) {
    setLogs((prev) => [{ name, ok: r.ok, message: r.message, at: new Date().toLocaleTimeString("fr-FR") }, ...prev].slice(0, 30));
  }

  function sendOne(t: LabTemplate) {
    start(async () => {
      const r = await sendLabEmail({ from: t.from, subject: t.subject, text: t.text });
      log(t.name, r);
    });
  }

  function sendRandom(n: number) {
    start(async () => {
      const pick: LabTemplate[] = [];
      for (let i = 0; i < n; i++) pick.push(filtered[Math.floor(Math.random() * filtered.length)]);
      const res = await sendLabBatch(pick.map((t) => ({ from: t.from, subject: t.subject, text: t.text })));
      setLogs((prev) => [
        { name: `${n} mail(s) aléatoire(s) — ${pool === "devis" ? "devis" : "mixte"}`, ok: res.ok === res.total, message: `${res.ok}/${res.total} envoyés`, at: new Date().toLocaleTimeString("fr-FR") },
        ...prev,
      ].slice(0, 30));
    });
  }

  function sendCustom() {
    if (!cText.trim()) return;
    start(async () => {
      const r = await sendLabEmail({ from: cFrom || "test@lab.fr", subject: cSubject || "(sans sujet)", text: cText });
      log("Mail personnalisé", r);
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-line bg-card p-5">
        <p className="text-sm text-ink-soft">
          Ce Lab envoie des emails de test au <span className="font-medium text-ink">webhook n8n</span>, comme s&apos;ils
          arrivaient dans la boîte mail. Le workflow n8n les qualifie et crée (ou non) une demande. Idéal pour
          tester la chaîne <span className="font-medium text-ink">de bout en bout</span> sans envoyer de vrais mails.
        </p>
      </div>

      {/* Générateur aléatoire */}
      <div className="rounded-2xl border border-line bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="eyebrow text-ink-soft">Générateur aléatoire</h3>
          <div className="inline-flex rounded-lg border border-line bg-subtle p-0.5 text-sm">
            <button onClick={() => setPool("devis")} className={`rounded-md px-3 py-1.5 font-medium transition ${pool === "devis" ? "bg-card text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}>Demandes de devis</button>
            <button onClick={() => setPool("tous")} className={`rounded-md px-3 py-1.5 font-medium transition ${pool === "tous" ? "bg-card text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}>Mails divers inclus</button>
          </div>
        </div>
        <p className="mb-4 text-sm text-ink-soft">
          {pool === "devis"
            ? "Génère uniquement de vraies demandes de devis (complètes ou incomplètes)."
            : "Inclut aussi des mails hors-sujet (spam, factures, démarchage…) pour tester la qualification."}
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => sendRandom(1)} disabled={pending}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50">
            🎲 Générer 1 aléatoire
          </button>
          <button onClick={() => sendRandom(5)} disabled={pending}
            className="rounded-lg border border-line-strong px-5 py-2.5 text-sm font-medium transition hover:bg-subtle disabled:opacity-50">
            Envoyer 5 aléatoires
          </button>
          <button onClick={() => sendRandom(10)} disabled={pending}
            className="rounded-lg border border-line-strong px-5 py-2.5 text-sm font-medium transition hover:bg-subtle disabled:opacity-50">
            Envoyer 10 aléatoires
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Templates */}
        <div>
          <h3 className="eyebrow mb-3 text-ink-soft">Templates préconfigurés · {filtered.length}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((t) => (
              <div key={t.id} className="flex flex-col rounded-xl border border-line bg-card p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${t.category === "autre" ? "bg-neutral-200 text-neutral-600" : TAG_STYLE[t.tag] ?? "bg-subtle text-ink-soft"}`}>
                    {t.category === "autre" ? "hors-sujet" : t.tag}
                  </span>
                  <button onClick={() => setOpenId(openId === t.id ? null : t.id)} className="text-xs text-ink-soft hover:text-ink">
                    {openId === t.id ? "masquer" : "aperçu"}
                  </button>
                </div>
                <div className="text-sm font-medium">{t.name}</div>
                <div className="truncate text-xs text-ink-soft">{t.subject}</div>
                {openId === t.id && (
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-paper p-2 text-xs text-ink">
                    De : {t.from}
                    {"\n"}Objet : {t.subject}
                    {"\n\n"}{t.text}
                  </pre>
                )}
                <button onClick={() => sendOne(t)} disabled={pending}
                  className="mt-3 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-dark disabled:opacity-50">
                  Envoyer ce mail
                </button>
              </div>
            ))}
          </div>

          {/* Composer libre */}
          <div className="mt-6 rounded-2xl border border-line bg-card p-5">
            <h3 className="eyebrow mb-3 text-ink-soft">Mail personnalisé</h3>
            <div className="space-y-2">
              <input value={cFrom} onChange={(e) => setCFrom(e.target.value)} placeholder="Expéditeur (email)" className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent" />
              <input value={cSubject} onChange={(e) => setCSubject(e.target.value)} placeholder="Objet" className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent" />
              <textarea value={cText} onChange={(e) => setCText(e.target.value)} rows={4} placeholder="Corps du mail…" className="w-full resize-y rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent" />
              <button onClick={sendCustom} disabled={pending || !cText.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50">
                Envoyer
              </button>
            </div>
          </div>
        </div>

        {/* Journal */}
        <div>
          <h3 className="eyebrow mb-3 text-ink-soft">Journal d&apos;envoi</h3>
          <div className="rounded-2xl border border-line bg-card p-2">
            {logs.length === 0 ? (
              <p className="p-4 text-center text-sm text-ink-soft">Aucun envoi pour l&apos;instant.</p>
            ) : (
              <div className="divide-y divide-line/60">
                {logs.map((l, i) => (
                  <div key={i} className="flex items-start gap-2 px-3 py-2 text-sm">
                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${l.ok ? "bg-good" : "bg-warn"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{l.name}</div>
                      <div className="text-xs text-ink-soft">{l.at} · {l.message}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

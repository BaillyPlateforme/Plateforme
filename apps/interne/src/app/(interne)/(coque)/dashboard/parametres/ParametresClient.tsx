"use client";

import { useState, useTransition } from "react";
import type { SettingsRow } from "@/lib/types";
import { saveSettings } from "@/lib/actions/settings";
import { testConnexionEnvois, sendTest } from "@/lib/actions/alerts";
import type { ConnexionEnvois } from "@/lib/connexion-envois";
import ChampAdresse from "@/ui/ChampAdresse";

export default function ParametresClient({
  settings,
  connexion,
}: {
  settings: SettingsRow;
  /** La connexion du fournisseur des envois en vigueur : SendGrid et Twilio, ou Brevo avant la bascule. */
  connexion: ConnexionEnvois;
}) {
  const [f, setF] = useState({
    entreprise_nom: settings.entreprise_nom ?? "",
    entreprise_email: settings.entreprise_email ?? "",
    entreprise_tel: settings.entreprise_tel ?? "",
    entreprise_adresse: settings.entreprise_adresse ?? "",
    siret: settings.siret ?? "",
    signature_email: settings.signature_email ?? "",
    n8n_webhook_url: settings.n8n_webhook_url ?? "",
    sms_sender: settings.sms_sender ?? "Bailly",
    base_url: settings.base_url ?? "",
    devis_validite_jours: settings.devis_validite_jours ?? 30,
    resultat_instantane: settings.resultat_instantane ?? false,
  });
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const set = (k: keyof typeof f, v: string | number) => setF((p) => ({ ...p, [k]: v }));

  // Le fournisseur des envois (Twilio : SendGrid pour les e-mails ; Brevo avant la bascule)
  const [connexionEtat, setConnexionEtat] = useState(connexion);
  const [testChannel, setTestChannel] = useState<"email" | "sms">("email");
  const [testTo, setTestTo] = useState("");
  const [testFlash, setTestFlash] = useState<string | null>(null);
  const [connexionPending, startConnexion] = useTransition();

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
        sms_sender: f.sms_sender || "Bailly",
        base_url: f.base_url || null,
        devis_validite_jours: Number(f.devis_validite_jours) || 30,
        resultat_instantane: f.resultat_instantane,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Le fournisseur des envois */}
      <section className="rounded-[18px] bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="eyebrow text-ink-soft">{connexionEtat.titre}</h3>
          <span className={`flex items-center gap-1.5 text-xs font-medium ${connexionEtat.ok ? "text-good" : "text-warn"}`}>
            <span className={`h-2 w-2 rounded-full ${connexionEtat.ok ? "bg-good" : "bg-warn"}`} />
            {connexionEtat.ok ? "Connecté" : "Non connecté"}
          </span>
        </div>
        {connexionEtat.canaux.length === 2 && connexionEtat.canaux[0].fournisseur !== connexionEtat.canaux[1].fournisseur ? (
          // Un fournisseur par canal (SendGrid pour les e-mails, Twilio pour les SMS) : l'état de chacun.
          <ul className="mb-4 space-y-1 text-sm text-ink-soft">
            {connexionEtat.canaux.map((c) => (
              <li key={c.canal} className="flex items-start gap-2">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${c.ok ? "bg-good" : "bg-warn"}`} />
                <span>
                  <b className="font-medium text-ink">{c.canal === "sms" ? "SMS" : "E-mails"}</b> — {c.message}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-ink-soft">{connexionEtat.message}</p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => startConnexion(async () => setConnexionEtat(await testConnexionEnvois()))}
            disabled={connexionPending}
            className="rounded-xl border border-line-strong px-4 py-2 text-sm font-medium transition hover:bg-subtle disabled:opacity-50"
          >
            {connexionPending ? "…" : "Tester la connexion"}
          </button>
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <select value={testChannel} onChange={(e) => setTestChannel(e.target.value as "email" | "sms")}
              className="rounded-xl border border-line bg-paper px-2 py-2 text-sm outline-none focus:border-accent">
              <option value="email">Email</option>
              <option value="sms">SMS</option>
            </select>
            <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder={testChannel === "sms" ? "06 12 34 56 78" : "test@email.fr"}
              className="min-w-[160px] flex-1 rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent" />
            <button
              onClick={() => startConnexion(async () => {
                const r = await sendTest(testChannel, testTo, "Message de test — Bailly Déménagement.");
                setTestFlash(r.message);
                setTimeout(() => setTestFlash(null), 4000);
              })}
              disabled={connexionPending || !testTo.trim()}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-40"
            >
              Envoyer un test
            </button>
          </div>
        </div>
        {testFlash && <p className="mt-3 text-sm text-ink-soft">{testFlash}</p>}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Entreprise">
          <F label="Nom" value={f.entreprise_nom} onChange={(v) => set("entreprise_nom", v)} />
          <F label="Email (expéditeur des mails)" value={f.entreprise_email} onChange={(v) => set("entreprise_email", v)} />
          <F label="Téléphone" value={f.entreprise_tel} onChange={(v) => set("entreprise_tel", v)} />
          <div>
            <label htmlFor="entreprise-adresse" className="mb-1 block text-sm text-ink-soft">Adresse</label>
            <ChampAdresse id="entreprise-adresse" value={f.entreprise_adresse} onChange={(v) => set("entreprise_adresse", v)}
              className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent" />
          </div>
          <F label="SIRET" value={f.siret} onChange={(v) => set("siret", v)} />
        </Card>

        <Card title="Devis, emails & SMS">
          <F label="Validité des devis (jours)" type="number" value={String(f.devis_validite_jours)} onChange={(v) => set("devis_validite_jours", v)} />
          <F label="Expéditeur SMS (11 car. max)" value={f.sms_sender} onChange={(v) => set("sms_sender", v)} />
          <div>
            <label className="mb-1 block text-sm text-ink-soft">Signature des emails</label>
            <textarea value={f.signature_email} onChange={(e) => set("signature_email", e.target.value)} rows={2}
              className="w-full resize-none rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent" placeholder="L'équipe Bailly Déménagement" />
          </div>
          <F label="URL publique du site (liens de complétion)" value={f.base_url} onChange={(v) => set("base_url", v)} placeholder="https://plateforme.up.railway.app" />
          <F label="Webhook n8n (optionnel)" value={f.n8n_webhook_url} onChange={(v) => set("n8n_webhook_url", v)} placeholder="https://…" />
        </Card>
      </div>

      <section className="rounded-[18px] bg-card p-6">
        <h3 className="eyebrow mb-3 text-ink-soft">Expérience formulaire</h3>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={f.resultat_instantane}
            onChange={(e) => setF((p) => ({ ...p, resultat_instantane: e.target.checked }))}
            className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
          />
          <div>
            <div className="text-sm font-medium">Résultat instantané</div>
            <p className="mt-0.5 text-xs text-ink-soft">
              À l&apos;envoi d&apos;une demande complète, le client voit une barre de génération puis sa
              proposition de devis chiffrée directement à l&apos;écran.
            </p>
          </div>
        </label>
      </section>

      <button onClick={save} disabled={pending}
        className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50">
        {pending ? "…" : saved ? "Enregistré ✓" : "Enregistrer les paramètres"}
      </button>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-[18px] bg-card p-6">
      <h3 className="eyebrow mb-2 text-ink-soft">{title}</h3>
      {children}
    </section>
  );
}

function F({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="mb-1 block text-sm text-ink-soft">{label}</label>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent" />
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import type { AlertRow, MessageTemplate, Channel } from "@/lib/messaging";
import { saveAlert, deleteAlert } from "@/lib/actions/alerts";

type StageDef = {
  id: string;
  event: string;
  source?: "form" | "email";
  title: string;
  icon: string;
  desc: string;
  tone: "neutral" | "amber" | "good" | "grey";
  champ?: "volume" | "depart" | "arrivee";
  hasMontant?: boolean;
};

const S = {
  form: { id: "form", event: "demande_complete", source: "form", title: "Formulaire", icon: "📝", desc: "Demande complète", tone: "neutral" } as StageDef,
  mailOk: { id: "mailOk", event: "demande_complete", source: "email", title: "Mail complet", icon: "📬", desc: "Toutes les infos présentes", tone: "good" } as StageDef,
  mailKoVol: { id: "mailKoVol", event: "demande_incomplete", champ: "volume", title: "Volume manquant", icon: "📦", desc: "Relance : préciser le volume", tone: "amber" } as StageDef,
  mailKoDep: { id: "mailKoDep", event: "demande_incomplete", champ: "depart", title: "Départ manquant", icon: "📍", desc: "Relance : adresse de départ", tone: "amber" } as StageDef,
  mailKoArr: { id: "mailKoArr", event: "demande_incomplete", champ: "arrivee", title: "Arrivée manquante", icon: "🏁", desc: "Relance : adresse d'arrivée", tone: "amber" } as StageDef,
  devisCree: { id: "devisCree", event: "devis_cree", title: "Devis créé", icon: "📄", desc: "Estimation générée", tone: "neutral" } as StageDef,
  devisEnvoye: { id: "devisEnvoye", event: "devis_envoye", title: "Devis envoyé", icon: "✉️", desc: "Transmis au client", tone: "neutral", hasMontant: true } as StageDef,
  accepte: { id: "accepte", event: "devis_accepte", title: "Accepté → Chantier", icon: "✅", desc: "Devis signé", tone: "good", hasMontant: true } as StageDef,
  refuse: { id: "refuse", event: "devis_refuse", title: "Refusé → Perdu", icon: "❌", desc: "Devis décliné", tone: "grey" } as StageDef,
};
const ALL = Object.values(S);
const CHANNEL_ICON: Record<string, string> = { email: "✉️", sms: "💬" };
const toneRing: Record<StageDef["tone"], string> = {
  neutral: "border-line", amber: "border-amber-300", good: "border-good/40", grey: "border-line-strong",
};

export default function WorkflowBuilder({ rules, templates }: { rules: AlertRow[]; templates: MessageTemplate[] }) {
  const [selectedId, setSelectedId] = useState<string>("form");
  const workflows = rules.filter((r) => r.kind === "workflow");
  const rulesFor = (s: StageDef) =>
    workflows.filter(
      (r) =>
        r.event === s.event &&
        (r.condition_source ?? null) === (s.source ?? null) &&
        (r.condition_champ ?? null) === (s.champ ?? null),
    );
  const templateName = (id: string | null) => templates.find((t) => t.id === id)?.name ?? "template ?";
  const stage = ALL.find((s) => s.id === selectedId)!;

  const node = (s: StageDef, small?: boolean) => (
    <StageNode stage={s} count={rulesFor(s).length} active={selectedId === s.id} onClick={() => setSelectedId(s.id)} small={small} />
  );

  return (
    <div className="space-y-8">
      {/* Diagramme — tout sur une seule ligne : arrivée → traitement */}
      <div className="overflow-x-auto rounded-2xl border border-line bg-card p-6">
        <div className="flex min-w-max items-stretch gap-5">
          {/* Arrivée */}
          <div className="flex flex-col justify-center gap-3">
            <div className="eyebrow text-ink-soft">Arrivée</div>
            <div className="flex items-center gap-2">
              <SourceChip icon="📝" label="Formulaire" />
              <Arrow />
              {node(S.form, true)}
            </div>
            <div className="flex items-start gap-2">
              <SourceChip icon="📬" label="Mail reçu" />
              <span className="pt-6 text-lg text-ink-soft/50">→</span>
              <div className="flex flex-col gap-2">
                {node(S.mailOk, true)}
                <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/40 p-2">
                  <div className="mb-1.5 px-1 text-[11px] font-medium text-amber-800">Si incomplet — selon le champ manquant :</div>
                  <div className="flex gap-2">
                    {node(S.mailKoVol, true)}
                    {node(S.mailKoDep, true)}
                    {node(S.mailKoArr, true)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Jonction arrivée complète → traitement */}
          <div className="flex items-center px-1 text-2xl text-ink-soft/40">→</div>

          {/* Traitement */}
          <div className="flex flex-col justify-center gap-3">
            <div className="eyebrow text-ink-soft">Traitement (demande complète)</div>
            <div className="flex items-center gap-2">
              {node(S.devisCree, true)}
              <Arrow />
              {node(S.devisEnvoye, true)}
              <Arrow />
              <div className="flex flex-col gap-2">
                {node(S.accepte, true)}
                {node(S.refuse, true)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Éditeur */}
      <div className={`rounded-2xl border-2 bg-card p-6 ${toneRing[stage.tone]}`}>
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xl">{stage.icon}</span>
          <h3 className="font-serif text-2xl">{stage.title}</h3>
          {stage.source && (
            <span className="rounded-full bg-subtle px-2 py-0.5 text-[11px] font-medium text-ink-soft">
              {stage.source === "form" ? "Formulaire" : "Mail"}
            </span>
          )}
        </div>
        <p className="mb-5 text-sm text-ink-soft">Actions automatiques à cette étape. {stage.desc}.</p>

        <div className="mb-5 space-y-2">
          {rulesFor(stage).length === 0 && (
            <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">
              Aucune action — ajoutez-en une ci-dessous.
            </div>
          )}
          {rulesFor(stage).map((r) => (
            <ActionRow key={r.id} rule={r} templateName={templateName(r.template_id)} />
          ))}
        </div>

        <AddAction stage={stage} templates={templates} />
      </div>
    </div>
  );
}

function SourceChip({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex w-32 shrink-0 items-center gap-2 rounded-xl bg-subtle px-3 py-4 font-medium">
      <span className="text-lg">{icon}</span>
      {label}
    </div>
  );
}

function StageNode({ stage, count, active, onClick, small }: { stage: StageDef; count: number; active: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border-2 bg-card p-4 text-left transition ${small ? "w-44" : "w-52"} ${
        active ? "border-accent shadow-md" : toneRing[stage.tone] + " hover:border-accent/50"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-lg">{stage.icon}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${count > 0 ? "bg-accent-soft text-accent-dark" : "bg-subtle text-ink-soft"}`}>
          {count} action{count > 1 ? "s" : ""}
        </span>
      </div>
      <div className="mt-2 font-medium">{stage.title}</div>
      <div className="text-xs text-ink-soft">{stage.desc}</div>
    </button>
  );
}

function Arrow() {
  return <span className="flex shrink-0 items-center text-lg text-ink-soft/50">→</span>;
}

function ActionRow({ rule, templateName }: { rule: AlertRow; templateName: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper px-4 py-2.5">
      <span className="text-lg">{CHANNEL_ICON[rule.channel]}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{templateName}</div>
        <div className="text-xs text-ink-soft">
          {rule.channel.toUpperCase()} · {rule.destinataire === "client" ? "au client" : `à ${rule.destinataire_custom ?? "—"}`}
          {rule.condition_champ ? ` · si ${rule.condition_champ} manquant` : ""}
          {rule.montant_min != null ? ` · si ≥ ${rule.montant_min} €` : ""}
          {!rule.active ? " · inactive" : ""}
        </div>
      </div>
      <button onClick={() => start(() => deleteAlert(rule.id))} disabled={pending} className="text-xs text-ink-soft transition hover:text-accent">
        Retirer
      </button>
    </div>
  );
}

function AddAction({ stage, templates }: { stage: StageDef; templates: MessageTemplate[] }) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<Channel>("email");
  const [templateId, setTemplateId] = useState("");
  const [dest, setDest] = useState<"client" | "custom">("client");
  const [custom, setCustom] = useState("");
  const [montant, setMontant] = useState("");
  const [pending, start] = useTransition();
  const compatible = templates.filter((t) => t.channel === channel);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium transition hover:bg-subtle">
        + Ajouter une action
      </button>
    );
  }
  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm text-ink-soft">Canal</span>
          <select value={channel} onChange={(e) => { setChannel(e.target.value as Channel); setTemplateId(""); }} className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent">
            <option value="email">✉️ Email</option>
            <option value="sms">💬 SMS</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-ink-soft">Template</span>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent">
            <option value="">— choisir —</option>
            {compatible.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-ink-soft">Destinataire</span>
          <select value={dest} onChange={(e) => setDest(e.target.value as "client" | "custom")} className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent">
            <option value="client">Le client</option>
            <option value="custom">Adresse / numéro fixe</option>
          </select>
        </label>
        {dest === "custom" && (
          <label className="block">
            <span className="mb-1 block text-sm text-ink-soft">Adresse / numéro</span>
            <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={channel === "sms" ? "0612…" : "equipe@bailly.fr"} className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent" />
          </label>
        )}
        {stage.champ && (
          <div className="sm:col-span-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Se déclenche uniquement quand{" "}
            <strong>{stage.champ === "volume" ? "le volume" : stage.champ === "depart" ? "l'adresse de départ" : "l'adresse d'arrivée"}</strong>{" "}
            manque. Pensez à insérer <code className="rounded bg-amber-100 px-1 font-mono">{"{{lien_completion}}"}</code> dans le template.
          </div>
        )}
        {stage.hasMontant && (
          <label className="block">
            <span className="mb-1 block text-sm text-ink-soft">Seulement si montant TTC ≥ (optionnel)</span>
            <input type="number" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="ex : 3000" className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent" />
          </label>
        )}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => start(async () => {
            await saveAlert(null, {
              name: stage.title, kind: "workflow", event: stage.event,
              montant_min: stage.hasMontant && montant ? Number(montant) : null,
              channel, destinataire: dest, destinataire_custom: dest === "custom" ? custom || null : null,
              template_id: templateId || null,
              condition_champ: stage.champ ?? null,
              condition_source: stage.source ?? null,
              active: true,
            });
            setOpen(false); setTemplateId(""); setCustom(""); setMontant("");
          })}
          disabled={pending || !templateId}
          className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50"
        >
          {pending ? "…" : "Ajouter l'action"}
        </button>
        <button onClick={() => setOpen(false)} className="text-sm text-ink-soft transition hover:text-ink">Annuler</button>
        {!templateId && <span className="text-xs text-ink-soft">Choisissez un template.</span>}
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import type { AlertRow, MessageTemplate, Channel } from "@/lib/messaging";
import { saveAlert, deleteAlert } from "@/lib/actions/alerts";

type StageDef = {
  event: string;
  title: string;
  icon: string;
  desc: string;
  tone: "neutral" | "amber" | "good" | "grey";
  hasCondition?: boolean;
  hasMontant?: boolean;
};

const MAIN: StageDef[] = [
  { event: "demande_recue", title: "Réception", icon: "📥", desc: "Formulaire ou mail reçu", tone: "neutral" },
  { event: "devis_cree", title: "Devis créé", icon: "📄", desc: "Estimation générée", tone: "neutral" },
  { event: "devis_envoye", title: "Devis envoyé", icon: "✉️", desc: "Transmis au client", tone: "neutral", hasMontant: true },
];
const ACCEPTE: StageDef = { event: "devis_accepte", title: "Accepté → Chantier", icon: "✅", desc: "Devis signé", tone: "good", hasMontant: true };
const REFUSE: StageDef = { event: "devis_refuse", title: "Refusé → Perdu", icon: "❌", desc: "Devis décliné", tone: "grey" };
const INCOMPLETE: StageDef = { event: "demande_incomplete", title: "Incomplète", icon: "⚠️", desc: "Relance de complétion", tone: "amber", hasCondition: true };

const ALL_STAGES = [...MAIN, ACCEPTE, REFUSE, INCOMPLETE];
const CHANNEL_ICON: Record<string, string> = { email: "✉️", sms: "💬" };

const toneRing: Record<StageDef["tone"], string> = {
  neutral: "border-line",
  amber: "border-amber-300",
  good: "border-good/40",
  grey: "border-line-strong",
};

export default function WorkflowBuilder({ rules, templates }: { rules: AlertRow[]; templates: MessageTemplate[] }) {
  const [selected, setSelected] = useState<string>("demande_recue");
  const workflows = rules.filter((r) => r.kind === "workflow");
  const forEvent = (ev: string) => workflows.filter((r) => r.event === ev);
  const templateName = (id: string | null) => templates.find((t) => t.id === id)?.name ?? "template ?";

  const stage = ALL_STAGES.find((s) => s.event === selected)!;

  return (
    <div className="space-y-8">
      {/* Diagramme */}
      <div className="overflow-x-auto rounded-2xl border border-line bg-card p-6">
        <div className="flex min-w-max items-stretch gap-2">
          {MAIN.map((s, i) => (
            <div key={s.event} className="flex items-center gap-2">
              <StageNode stage={s} count={forEvent(s.event).length} active={selected === s.event} onClick={() => setSelected(s.event)} />
              {i < MAIN.length - 1 && <Arrow />}
            </div>
          ))}
          <Arrow />
          <div className="flex flex-col justify-center gap-2">
            <StageNode stage={ACCEPTE} count={forEvent(ACCEPTE.event).length} active={selected === ACCEPTE.event} onClick={() => setSelected(ACCEPTE.event)} small />
            <StageNode stage={REFUSE} count={forEvent(REFUSE.event).length} active={selected === REFUSE.event} onClick={() => setSelected(REFUSE.event)} small />
          </div>
        </div>

        {/* Embranchement : demande incomplète */}
        <div className="mt-5 flex items-center gap-2 pl-2">
          <span className="text-sm text-ink-soft">↳ si la demande est incomplète</span>
          <Arrow />
          <StageNode stage={INCOMPLETE} count={forEvent(INCOMPLETE.event).length} active={selected === INCOMPLETE.event} onClick={() => setSelected(INCOMPLETE.event)} />
        </div>
      </div>

      {/* Éditeur de l'étape sélectionnée */}
      <div className={`rounded-2xl border-2 bg-card p-6 ${toneRing[stage.tone]}`}>
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xl">{stage.icon}</span>
          <h3 className="font-serif text-2xl">{stage.title}</h3>
        </div>
        <p className="mb-5 text-sm text-ink-soft">
          Actions déclenchées automatiquement à cette étape. {stage.desc}.
        </p>

        {/* Actions existantes */}
        <div className="mb-5 space-y-2">
          {forEvent(stage.event).length === 0 && (
            <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">
              Aucune action à cette étape — ajoutez-en une ci-dessous.
            </div>
          )}
          {forEvent(stage.event).map((r) => (
            <ActionRow key={r.id} rule={r} templateName={templateName(r.template_id)} />
          ))}
        </div>

        <AddAction stage={stage} templates={templates} />
      </div>
    </div>
  );
}

function StageNode({ stage, count, active, onClick, small }: { stage: StageDef; count: number; active: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border-2 bg-card p-4 text-left transition ${small ? "w-56" : "w-56"} ${
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
  return <span className="shrink-0 text-lg text-ink-soft/50">→</span>;
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
  const [champ, setChamp] = useState("volume");
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
        {stage.hasCondition && (
          <label className="block">
            <span className="mb-1 block text-sm text-ink-soft">Se déclenche si ce champ manque</span>
            <select value={champ} onChange={(e) => setChamp(e.target.value)} className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent">
              <option value="volume">Volume</option>
              <option value="depart">Adresse de départ</option>
              <option value="arrivee">Adresse d&apos;arrivée</option>
            </select>
          </label>
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
              condition_champ: stage.hasCondition ? champ : null,
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

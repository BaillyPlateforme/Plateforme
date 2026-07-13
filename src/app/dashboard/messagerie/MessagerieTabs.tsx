"use client";

import { useState } from "react";
import type { MessageTemplate, AlertRow } from "@/lib/messaging";
import TemplatesManager from "./TemplatesManager";
import RulesManager from "./RulesManager";
import SimulationClient from "./SimulationClient";

const TABS = ["Templates", "Alertes", "Simulation"] as const;
type Tab = (typeof TABS)[number];

const INTRO: Record<Tab, string> = {
  Templates: "Vos modèles d'emails et de SMS, avec variables dynamiques.",
  Alertes: "Soyez notifié·e selon des conditions (ex. devis envoyé au-delà d'un montant).",
  Simulation: "Testez le rendu et l'envoi réel d'un email ou d'un SMS.",
};

export default function MessagerieTabs({
  templates,
  rules,
}: {
  templates: MessageTemplate[];
  rules: AlertRow[];
}) {
  const [tab, setTab] = useState<Tab>("Templates");

  return (
    <div>
      <div className="mb-6 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`relative px-4 py-2.5 text-sm transition ${tab === t ? "font-medium text-ink" : "text-ink-soft hover:text-ink"}`}>
            {t}
            {tab === t && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>
      <p className="mb-6 text-sm text-ink-soft">{INTRO[tab]}</p>

      {tab === "Templates" && <TemplatesManager templates={templates} />}
      {tab === "Alertes" && (
        <RulesManager kind="alerte" rules={rules} templates={templates}
          showCondition defaultDest="custom" addLabel="Nouvelle alerte"
          emptyHint="Aucune alerte configurée." />
      )}
      {tab === "Simulation" && <SimulationClient templates={templates} />}
    </div>
  );
}

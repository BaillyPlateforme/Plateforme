"use client";

import { useState } from "react";
import type { SettingsRow } from "@/lib/types";
import type { MessageTemplate, AlertRow } from "@/lib/messaging";
import ParametresClient from "./ParametresClient";
import TemplatesManager from "./TemplatesManager";
import AlertsManager from "./AlertsManager";

const TABS = ["Général", "Templates", "Alertes"] as const;
type Tab = (typeof TABS)[number];

export default function ParametresTabs({
  settings,
  templates,
  alerts,
  brevo,
}: {
  settings: SettingsRow;
  templates: MessageTemplate[];
  alerts: AlertRow[];
  brevo: { ok: boolean; message: string };
}) {
  const [tab, setTab] = useState<Tab>("Général");

  return (
    <div>
      <div className="mb-8 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative px-4 py-2.5 text-sm transition ${
              tab === t ? "font-medium text-ink" : "text-ink-soft hover:text-ink"
            }`}
          >
            {t}
            {tab === t && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>

      {tab === "Général" && <ParametresClient settings={settings} brevo={brevo} />}
      {tab === "Templates" && <TemplatesManager templates={templates} />}
      {tab === "Alertes" && <AlertsManager alerts={alerts} templates={templates} />}
    </div>
  );
}

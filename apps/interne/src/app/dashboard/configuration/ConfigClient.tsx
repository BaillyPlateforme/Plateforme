"use client";

import { useState } from "react";
import type { LibraryPhoto } from "@/lib/library";
import type { AiConfig } from "@/lib/ai-config";
import type { CriterionConfig } from "@/lib/qualification";
import ImagesManager from "./ImagesManager";
import GrilleApercu from "@/components/pricing/GrilleApercu";
import AiConfigEditor from "./AiConfigEditor";
import QualificationEditor from "./QualificationEditor";

const SUBTABS = ["Photos", "Analyse d'image", "Tarification", "Qualification"] as const;
type SubTab = (typeof SUBTABS)[number];

export default function ConfigClient({
  library,
  aiConfig,
  qualifConfig,
}: {
  library: LibraryPhoto[];
  aiConfig: AiConfig;
  qualifConfig: CriterionConfig[];
}) {
  const [tab, setTab] = useState<SubTab>("Photos");

  return (
    <div>
      <div className="mb-8 flex gap-1 border-b border-line">
        {SUBTABS.map((t) => (
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

      {tab === "Photos" && <ImagesManager library={library} />}

      {tab === "Analyse d'image" && (
        <div>
          <div className="mb-5">
            <h3 className="font-serif text-xl">Analyse d&apos;image (IA)</h3>
            <p className="text-sm text-ink-soft">
              Prompt, volumes de référence, modèle et température de l&apos;estimation par photo.
            </p>
          </div>
          <AiConfigEditor config={aiConfig} />
        </div>
      )}

      {tab === "Tarification" && (
        <div>
          <div className="mb-5">
            <h3 className="font-serif text-xl">Grille tarifaire</h3>
            <p className="text-sm text-ink-soft">
              La grille appliquée par le moteur : prix au m³ par tranche de volume et de distance,
              suppléments et contenu des trois formules. Elle est versionnée dans le code — toute
              évolution de tarif passe par une mise à jour du fichier de référence.
            </p>
          </div>
          <GrilleApercu />
        </div>
      )}

      {tab === "Qualification" && (
        <div>
          <div className="mb-5">
            <h3 className="font-serif text-xl">Qualification des demandes</h3>
            <p className="text-sm text-ink-soft">
              Critères, pondérations et seuils de la note /100 attribuée automatiquement à chaque demande complète.
            </p>
          </div>
          <QualificationEditor criteria={qualifConfig} />
        </div>
      )}
    </div>
  );
}

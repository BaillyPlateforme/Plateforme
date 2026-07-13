"use client";

import { useState } from "react";
import type { LibraryPhoto } from "@/lib/library";
import type { PricingGridRow } from "@/lib/types";
import ImagesManager from "./ImagesManager";
import GridsManager from "../grilles/GridsManager";

const SUBTABS = ["Data"] as const;
type SubTab = (typeof SUBTABS)[number];

export default function ConfigClient({
  library,
  grids,
}: {
  library: LibraryPhoto[];
  grids: PricingGridRow[];
}) {
  const [tab, setTab] = useState<SubTab>("Data");

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

      {tab === "Data" && (
        <div className="space-y-10">
          <ImagesManager library={library} />
          <div>
            <div className="mb-5">
              <h3 className="font-serif text-xl">Grilles tarifaires</h3>
              <p className="text-sm text-ink-soft">Paramètres de chiffrage des devis.</p>
            </div>
            <GridsManager grids={grids} />
          </div>
        </div>
      )}
    </div>
  );
}

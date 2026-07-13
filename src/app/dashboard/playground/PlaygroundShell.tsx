"use client";

import { useState } from "react";
import type { PricingGridRow } from "@/lib/types";
import type { LibraryPhoto } from "@/components/PhotoAnalyzer";
import PlaygroundClient from "./PlaygroundClient";
import LabClient from "./LabClient";

const TABS = [
  ["image", "Analyse d'image"],
  ["e2e", "Bout en bout"],
] as const;
type Tab = (typeof TABS)[number][0];

export default function PlaygroundShell({
  grids,
  library,
}: {
  grids: PricingGridRow[];
  library: LibraryPhoto[];
}) {
  const [tab, setTab] = useState<Tab>("image");

  return (
    <div>
      <div className="mb-6 flex gap-1 border-b border-line">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`relative px-4 py-2.5 text-sm transition ${tab === key ? "font-medium text-ink" : "text-ink-soft hover:text-ink"}`}
          >
            {label}
            {tab === key && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>

      {tab === "image" && <PlaygroundClient grids={grids} library={library} />}
      {tab === "e2e" && <LabClient />}
    </div>
  );
}

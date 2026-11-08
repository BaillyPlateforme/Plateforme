"use client";

import { useState } from "react";
import { Ic } from "@/crm/lib/icons";

/** Copie un lien dans le presse-papiers, et le dit deux secondes. */
export default function CopierLien({ lien, libelle, className }: { lien: string; libelle: string; className?: string }) {
  const [copie, setCopie] = useState(false);
  return (
    <button
      type="button"
      className={className}
      title={lien}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(lien);
          setCopie(true);
          window.setTimeout(() => setCopie(false), 2000);
        } catch {
          window.prompt("Copiez le lien :", lien);
        }
      }}
    >
      <Ic n={copie ? "check" : "link"} />
      {copie ? "Lien copié" : libelle}
    </button>
  );
}

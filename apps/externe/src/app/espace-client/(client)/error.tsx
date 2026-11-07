"use client";

import Link from "next/link";
import { TEL_AGENCE, TEL_AGENCE_LIEN } from "@/lib/messaging";

/**
 * Quand l'espace ne peut pas répondre — la base injoignable, surtout —
 * le client voit un message clair et le numéro de l'agence, jamais une page
 * technique.
 */
export default function Erreur({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="ecran-nuit">
      <div className="page-simple">
        <div>
          <p className="kicker" style={{ color: "var(--accent)" }}>
            Momentanément indisponible
          </p>
          <h1>Votre espace ne répond pas</h1>
          <p style={{ color: "rgba(255,255,255,.7)" }}>
            Réessayez dans quelques instants. En cas d&apos;urgence, l&apos;agence répond au <a href={TEL_AGENCE_LIEN}>{TEL_AGENCE}</a>.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={reset}>
              Réessayer
            </button>
            <Link className="btn btn-ghost" href="/espace-client" style={{ color: "#fff", borderColor: "rgba(255,255,255,.35)" }}>
              Accueil de l&apos;espace
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

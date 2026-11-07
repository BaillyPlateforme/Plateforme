"use client";

import { startTransition, useActionState, useState } from "react";
import { deposerPiece, type EtatFormulaire } from "@/lib/actions/espace-client";
import { TYPES_DOCUMENTS, verifierFichier } from "@/lib/espace-client/schemas";
import { Icone } from "../../../_ui/Icone";

/**
 * Le bouton « Déposer » d'une pièce : on choisit le fichier, il part
 * aussitôt — comme dans la micro démo. Format et poids sont vérifiés avant
 * l'envoi, puis à nouveau par le serveur.
 */
export function DepotPiece({ reference, requirementId, libre = false }: { reference: string; requirementId?: string; libre?: boolean }) {
  const [etat, envoyer, enCours] = useActionState<EtatFormulaire, FormData>(deposerPiece.bind(null, reference), {});
  const [locale, setLocale] = useState<string | null>(null);
  const erreur = locale ?? etat.erreurs?.fichier;

  return (
    <form onSubmit={(e) => e.preventDefault()} className={libre ? "depot-libre" : "depot-piece"}>
      {requirementId && <input type="hidden" name="requirement_id" value={requirementId} />}
      {libre && <input name="libelle" className="input" placeholder="Nom du document (ex. attestation employeur)" maxLength={80} aria-label="Nom du document" />}
      <label className={`btn ${libre ? "btn-ghost" : "btn-dark"} btn-sm`} aria-disabled={enCours}>
        <Icone nom="upload" /> {enCours ? "Envoi…" : libre ? "Choisir et déposer" : "Déposer"}
        <input
          type="file"
          name="fichier"
          hidden
          accept={TYPES_DOCUMENTS.join(",")}
          onChange={(e) => {
            const f = e.currentTarget.files?.[0] ?? null;
            if (!f) return;
            const err = verifierFichier(f, TYPES_DOCUMENTS);
            if (err) {
              setLocale(err);
              e.currentTarget.value = "";
              return;
            }
            setLocale(null);
            const fd = new FormData(e.currentTarget.form!);
            startTransition(() => envoyer(fd));
          }}
        />
      </label>
      {erreur && (
        <p className="err-inline" role="alert">
          {erreur}
        </p>
      )}
    </form>
  );
}

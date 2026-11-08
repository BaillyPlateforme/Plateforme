"use client";

import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";
import Fenetre from "@/crm/facturation/Fenetre";
import { creerDossier } from "@/crm/actions";
import { Icone } from "@/ui/icones";
import { A_VALIDER, DOSSIER_ESPACE, DOSSIER_IDENTIQUE } from "../textes";
import CeQuiSuit from "./CeQuiSuit";
import { useOuverture } from "./Declencheur";
import s from "../duplication.module.css";

const pl = (n: number, un: string, plusieurs = `${un}s`) => `${n} ${n > 1 ? plusieurs : un}`;

/**
 * « Dupliquer à l'identique » (le « ⋯ » du dossier) : la fenêtre dit ce qui
 * suit et ce qui ne suit pas, propose de reprendre aussi les devis en
 * brouillon, puis passe par la création ordinaire (creerDossier) avec le même
 * client : un seul chemin pour créer un dossier. Tout ce qui est repris est
 * relu dans la base, côté serveur (src/crm/duplication/dossier.ts).
 */
export default function FenetreDupliquerDossier({
  dossier,
}: {
  dossier: { id: number; ref: string; client: string; clientId: number; etapes: number; objets: number; services: number; devis: number };
}) {
  const [ouvert, setOuvert] = useOuverture("dupliquer-dossier");
  const [envoi, setEnvoi] = useState(false);
  if (!ouvert) return null;
  const resume = [pl(dossier.etapes, "étape"), dossier.objets ? `${pl(dossier.objets, "objet")} à l'inventaire` : "inventaire vide", dossier.services ? pl(dossier.services, "service") : null]
    .filter(Boolean)
    .join(" · ");
  // Dans un portail : posée dans la bande du dossier, la fenêtre hériterait du style de ses boutons.
  return createPortal(
    <Fenetre
      surtitre={`Dossier ${dossier.ref} · ${dossier.client}`}
      titre="Dupliquer à l'identique"
      sousTitre={`Un nouveau dossier pour le même client, au début du parcours (« Nouveau ») : ${resume}.`}
      onFermer={() => setOuvert(false)}
      pied={
        <div className={s.boutons}>
          <i className={s.aValider} title="Nouveaux textes, à valider par l'équipe">{A_VALIDER}</i>
          <button type="button" className={s.discret} onClick={() => setOuvert(false)}>
            Annuler
          </button>
          <Link href={`/dossiers/nouveau?depuis=${dossier.id}`} className={s.secondaire} prefetch={false}>
            Pour un nouveau client…
          </Link>
          {/* Hors du formulaire (le pied de la fenêtre) : il s'y rattache par son attribut `form`. */}
          <button type="submit" form="dupliquer-dossier" className={s.principal} disabled={envoi}>
            <Icone nom="dupliquer" taille={17} />
            {envoi ? "Duplication…" : "Dupliquer le dossier"}
          </button>
        </div>
      }
    >
      <form id="dupliquer-dossier" action={creerDossier} onSubmit={() => setEnvoi(true)} className={s.racine}>
        <input type="hidden" name="client_id" value={dossier.clientId} />
        <input type="hidden" name="dupliquer_depuis" value={dossier.id} />
        <input type="hidden" name="dupliquer_mode" value="identique" />
        <CeQuiSuit inventaire={DOSSIER_IDENTIQUE} />
        <label className={s.case}>
          <input type="checkbox" name="dupliquer_devis" disabled={dossier.devis === 0} />
          <span>
            <b>Reprendre aussi les devis (en brouillon)</b>
            <small>
              {dossier.devis
                ? "Chaque devis du dossier devient un brouillon du nouveau, avec un nouveau numéro, daté du jour. Les devis retirés de la proposition ne suivent pas."
                : "Ce dossier n'a pas de devis."}
            </small>
          </span>
          <em>{dossier.devis ? pl(dossier.devis, "devis", "devis") : "—"}</em>
        </label>
        <p className={s.note}>{DOSSIER_ESPACE}</p>
      </form>
    </Fenetre>,
    document.body,
  );
}

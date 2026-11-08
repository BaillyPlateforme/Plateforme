"use client";

import { useEffect } from "react";
import { useRessource } from "@/lib/donnees";
import { Avancement } from "./Avancement";
import type { DonneesFiche } from "./outils";
import { PiecesJointes } from "./PiecesJointes";
import s from "./suivi.module.css";

/**
 * L'espace client dans l'onglet « Espace client » de la fiche d'un dossier du
 * CRM : le même avancement que la fiche de l'espace (ce qui manque, de quoi
 * relancer), et ses pièces jointes en liste, à voir et à télécharger. Les
 * mêmes données et les mêmes composants que /dashboard/espace-client/dossiers/<id>.
 */
export default function SuiviEspaceCrm({ id }: { id: string }) {
  const { donnees: d, erreur, recharger } = useRessource<DonneesFiche>(`/api/data/espace-client/dossier/${id}`);
  const fiche = `/dashboard/espace-client/dossiers/${id}`;

  // Les liens des fichiers durent cinq minutes : relus toutes les quatre.
  useEffect(() => {
    const t = setInterval(recharger, 4 * 60 * 1000);
    return () => clearInterval(t);
  }, [recharger]);

  if (erreur) return <p className={s.vide}>L&apos;espace du client ne se lit pas pour le moment ({erreur}).</p>;
  if (!d) return <p className={s.vide}>Chargement de l&apos;espace du client…</p>;
  return (
    // .vue-equipe : les règles générales du CRM (titres, petits textes) s'arrêtent ici.
    <div className={`vue-equipe ${s.fiche}`} data-compact="">
      <Avancement d={d} recharger={recharger} lien={(r) => `${fiche}#${r}`} compact />
      <section className={`${s.carte} ${s.section}`}>
        <header className={s.sectionTete}>
          <div>
            <h2>Pièces jointes</h2>
            <p>
              {d.fichiers.length} fichier{d.fichiers.length > 1 ? "s" : ""} · {d.suivi.pieces.demandees ? `${d.suivi.pieces.recues} pièce${d.suivi.pieces.recues > 1 ? "s" : ""} sur ${d.suivi.pieces.demandees} reçue${d.suivi.pieces.recues > 1 ? "s" : ""}` : "aucune pièce demandée"}
            </p>
          </div>
        </header>
        <PiecesJointes d={d} recharger={recharger} compact lienFiche={fiche} />
      </section>
    </div>
  );
}

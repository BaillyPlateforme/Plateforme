"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icone } from "@/ui/icones";
import { A_VALIDER } from "../textes";
import s from "../duplication.module.css";

/**
 * Le bandeau du nouvel objet, juste après une duplication : ce qu'il est,
 * d'où il vient (un lien vers l'original), ce qui a été repris, et ce qui
 * reste à vérifier. « × » le referme et retire le paramètre de l'adresse
 * (`param`), pour qu'un rechargement ne le remontre pas.
 */
export default function AvisDuplication({
  titre,
  texte,
  alerte,
  lien,
  libelleLien,
  param = "duplique",
  autre,
}: {
  titre: string;
  texte?: string | null;
  alerte?: string | null;
  lien: string;
  libelleLien: string;
  param?: string;
  /** Un geste de plus, avant le lien (renoncer à la copie…). */
  autre?: React.ReactNode;
}) {
  const [ferme, setFerme] = useState(false);
  const router = useRouter();
  if (ferme) return null;
  const fermer = () => {
    setFerme(true);
    const u = new URL(window.location.href);
    u.searchParams.delete(param);
    router.replace(`${u.pathname}${u.search}${u.hash}`, { scroll: false });
  };
  return (
    <div className={s.avis} role="status">
      <span className={s.avisIcone}>
        <Icone nom="dupliquer" taille={20} />
      </span>
      <div className={s.avisTexte}>
        <b>
          {titre}
          <i className={s.aValider} title="Nouveau texte, à valider par l'équipe">{A_VALIDER}</i>
        </b>
        {texte && <span>{texte}</span>}
        {alerte && <span className={s.avisAlerte}>{alerte}</span>}
      </div>
      <div className={s.avisActions}>
        {autre}
        <Link href={lien} className={s.avisLien} prefetch={false}>
          <Icone nom="gauche" taille={15} />
          {libelleLien}
        </Link>
        <button type="button" className={s.avisFermer} onClick={fermer} aria-label="Fermer ce message">
          <Icone nom="fermer" taille={16} />
        </button>
      </div>
    </div>
  );
}

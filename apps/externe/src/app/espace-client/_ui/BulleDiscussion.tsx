"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { initialesDe, type FilVue } from "@/lib/espace-client/discussion-vue";
import { Discussion, type ConseillerVue } from "./Discussion";
import { Icone } from "./Icone";

/*
 * La bulle « Une question ? », en bas à droite de chaque page d'un dossier :
 * elle ouvre la discussion avec le conseiller dans un panneau (plein écran
 * sur téléphone). Absente de la page « Mon conseiller », qui est la
 * discussion en grand.
 *
 * Sur téléphone, elle se fait ronde et discrète, s'efface quand on descend
 * dans la page (elle revient dès qu'on remonte) et quand un champ de la page
 * a le clavier : elle ne couvre ni un bouton ni une saisie. Fermée, elle
 * relit le nombre de réponses non lues toutes les minutes.
 */

const RELECTURE_FERMEE_MS = 60_000;

export function BulleDiscussion({
  reference,
  conseiller,
  nonLusInitial,
  lectureSeule,
}: {
  reference: string;
  conseiller: ConseillerVue;
  nonLusInitial: number;
  lectureSeule: boolean;
}) {
  const chemin = usePathname();
  const [ouvert, setOuvert] = useState(false);
  const [nonLus, setNonLus] = useState(nonLusInitial);
  const [effacee, setEffacee] = useState(false);
  const bouton = useRef<HTMLButtonElement>(null);
  const panneau = useRef<HTMLDivElement>(null);
  const surPageConseiller = chemin.endsWith("/conseiller");

  const fermer = useCallback(() => {
    setOuvert(false);
    bouton.current?.focus({ preventScroll: true });
  }, []);

  // Échap ferme ; sur téléphone, la page ne défile pas sous le panneau plein écran.
  useEffect(() => {
    if (!ouvert) return;
    const touche = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    document.addEventListener("keydown", touche);
    const mobile = window.matchMedia("(max-width: 640px)").matches;
    const avant = document.documentElement.style.overflow;
    if (mobile) document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", touche);
      document.documentElement.style.overflow = avant;
    };
  }, [ouvert, fermer]);

  // Fermée : le nombre de réponses non lues, relu toutes les minutes.
  useEffect(() => {
    if (ouvert || surPageConseiller) return;
    const t = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch(`/espace-client/discussion/${encodeURIComponent(reference)}`, { cache: "no-store", headers: { Accept: "application/json" } });
        if (!r.ok) return;
        const fil = (await r.json()) as FilVue;
        setNonLus(fil.messages.filter((m) => m.auteur === "equipe" && !m.luParClient).length);
      } catch {
        // Hors ligne : la pastille garde sa valeur.
      }
    }, RELECTURE_FERMEE_MS);
    return () => window.clearInterval(t);
  }, [ouvert, surPageConseiller, reference]);

  // Téléphone : s'effacer en descendant et quand un champ de la page a le clavier.
  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 640px)");
    let dernier = window.scrollY;
    let champ = false;
    const defiler = () => {
      if (!mobile.matches) return setEffacee(false);
      const y = window.scrollY;
      if (Math.abs(y - dernier) < 8) return;
      setEffacee(champ || (y > dernier && y > 120));
      dernier = y;
    };
    const estChamp = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest("input, textarea, select") && !panneau.current?.contains(t);
    const focus = (e: FocusEvent) => {
      champ = estChamp(e.target);
      if (mobile.matches) setEffacee(champ);
    };
    const sortie = () => {
      champ = false;
      if (mobile.matches) setEffacee(false);
    };
    window.addEventListener("scroll", defiler, { passive: true });
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", sortie);
    return () => {
      window.removeEventListener("scroll", defiler);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", sortie);
    };
  }, []);

  if (surPageConseiller) return null;
  const initiales = initialesDe(`${conseiller.prenom} ${conseiller.nom}`);

  return (
    <div className="fil-flottant">
      {ouvert && <div className="fil-voile" onClick={fermer} aria-hidden />}
      <div ref={panneau} className="fil-fenetre" role="dialog" aria-modal="false" aria-label={`Discussion avec ${conseiller.prenom} ${conseiller.nom}`} hidden={!ouvert}>
        <header className="fil-entete">
          <span className="fil-av fil-av-entete">{initiales}</span>
          <div>
            <p className="fil-entete-nom">
              {conseiller.prenom} {conseiller.nom}
            </p>
            <p className="fil-entete-sous">Votre conseiller · dossier {reference}</p>
          </div>
          <Link className="fil-entete-lien" href={`/espace-client/${encodeURIComponent(reference)}/conseiller`} onClick={() => setOuvert(false)} title="Ouvrir la discussion en grand">
            <Icone nom="arrow" />
            <span className="sr-only">Ouvrir la discussion en grand</span>
          </Link>
          <button type="button" className="fil-entete-fermer" onClick={fermer} aria-label="Fermer la discussion">
            <Icone nom="close" />
          </button>
        </header>
        <Discussion reference={reference} conseiller={conseiller} lectureSeule={lectureSeule} actif={ouvert} variante="panneau" onNonLus={setNonLus} />
      </div>

      <button
        ref={bouton}
        type="button"
        className="fil-bouton"
        data-efface={(effacee && !ouvert) || undefined}
        data-ouvert={ouvert || undefined}
        aria-expanded={ouvert}
        aria-label={nonLus > 0 ? `Une question ? ${nonLus} réponse${nonLus > 1 ? "s" : ""} non lue${nonLus > 1 ? "s" : ""} de ${conseiller.prenom}` : `Une question ? Écrire à ${conseiller.prenom}`}
        onClick={() => (ouvert ? fermer() : setOuvert(true))}
      >
        <span className="fil-bouton-av" aria-hidden>
          {ouvert ? <Icone nom="close" /> : <Icone nom="bulle" />}
        </span>
        <span className="fil-bouton-texte" aria-hidden>
          <b>Une question ?</b>
          <small>{nonLus > 0 && !ouvert ? `${nonLus} réponse${nonLus > 1 ? "s" : ""} de ${conseiller.prenom}` : `Écrire à ${conseiller.prenom}`}</small>
        </span>
        {nonLus > 0 && !ouvert && (
          <span className="fil-pastille" aria-hidden>
            {nonLus}
          </span>
        )}
      </button>
    </div>
  );
}

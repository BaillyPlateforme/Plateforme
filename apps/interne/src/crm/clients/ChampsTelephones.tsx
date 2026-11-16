"use client";

import { useRef, useState } from "react";
import { TELEPHONE_VIDE, TELEPHONES_MAX, telEnSaisie, telLisible, type Telephone } from "./telephones";
import t from "./telephones.module.css";

/*
 * Les téléphones d'un client, à la saisie (retours de Céline, 16/11/2026) :
 * un numéro par ligne, chacun avec une case qui dit de quel numéro il s'agit
 * (travail, M., Mme…), et « + » pour en ajouter un. Le premier est le numéro
 * principal, celui qui reçoit les SMS. Le numéro s'écrit par paires pendant
 * la frappe (« 06 06 06 06 06 »).
 *
 * Deux façons de l'employer, comme ChampAdresse :
 * - contrôlé (écran de création) : `valeur` et `onChange` ;
 * - non contrôlé, dans un formulaire d'action serveur (fenêtre « Fiche » du
 *   dossier) : `initial`.
 * Dans les deux cas, les champs s'envoient sous les noms répétés `tel_numero`
 * et `tel_libelle` (lus par telephonesDuFormulaire, ./telephones.ts).
 */

type Props = {
  /** La classe des champs : celle de l'écran qui les accueille. */
  classeSaisie?: string;
  /** Les attributs du premier numéro (data-champ, aria-invalid, classe…), pour la navigation au clavier de l'écran. */
  premier?: React.InputHTMLAttributes<HTMLInputElement> & { "data-champ"?: string };
} & ({ valeur: Telephone[]; onChange: (l: Telephone[]) => void; initial?: undefined } | { valeur?: undefined; onChange?: undefined; initial: Telephone[] });

export default function ChampsTelephones(props: Props) {
  const { classeSaisie = "", premier } = props;
  const [interne, setInterne] = useState<Telephone[]>(() => (props.initial?.length ? props.initial : [TELEPHONE_VIDE]));
  const liste = props.valeur ? (props.valeur.length ? props.valeur : [TELEPHONE_VIDE]) : interne;
  const changer = (l: Telephone[]) => (props.onChange ? props.onChange(l) : setInterne(l));
  // Des clés stables pour les lignes : retirer la deuxième ne fait pas sauter le curseur de la troisième.
  const prochaine = useRef(liste.length);
  const [cles, setCles] = useState<number[]>(() => liste.map((_, i) => i));
  const clesVues = liste.map((_, i) => cles[i] ?? -1 - i);
  const boite = useRef<HTMLDivElement>(null);

  const maj = (i: number, champ: keyof Telephone, v: string) => changer(liste.map((x, j) => (j === i ? { ...x, [champ]: v } : x)));
  const ajouter = () => {
    changer([...liste, TELEPHONE_VIDE]);
    setCles([...clesVues, prochaine.current++]);
    // Le curseur va au nouveau numéro, une fois la ligne posée.
    window.requestAnimationFrame(() => {
      const numeros = boite.current?.querySelectorAll<HTMLInputElement>('input[name="tel_numero"]');
      numeros?.[numeros.length - 1]?.focus();
    });
  };
  const retirer = (i: number) => {
    changer(liste.filter((_, j) => j !== i));
    setCles(clesVues.filter((_, j) => j !== i));
  };

  return (
    <div className={t.liste} ref={boite}>
      {liste.map((x, i) => (
        <div key={clesVues[i]} className={t.ligne}>
          <input
            {...(i === 0 ? premier : {})}
            type="tel"
            inputMode="tel"
            name="tel_numero"
            autoComplete="off"
            value={x.numero}
            placeholder={i === 0 ? "06 12 34 56 78" : "Autre numéro"}
            aria-label={i === 0 ? "Téléphone principal (reçoit les SMS)" : `Téléphone ${i + 1}`}
            className={`${classeSaisie} ${i === 0 ? (premier?.className ?? "") : ""}`}
            onChange={(e) => {
              const el = e.target;
              // Par paires pendant la frappe, quand le curseur est au bout ; sinon, à la sortie du champ.
              maj(i, "numero", el.selectionStart === el.value.length ? telEnSaisie(el.value) : el.value);
            }}
            onBlur={() => {
              const propre = telLisible(x.numero) || x.numero.trim();
              if (propre !== x.numero) maj(i, "numero", propre);
            }}
          />
          <input
            type="text"
            name="tel_libelle"
            autoComplete="off"
            value={x.libelle}
            maxLength={60}
            placeholder={i === 0 ? "De quel numéro s'agit-il ?" : "Travail, M., Mme…"}
            aria-label={`De quel numéro s'agit-il (téléphone ${i + 1})`}
            className={classeSaisie}
            onChange={(e) => maj(i, "libelle", e.target.value)}
          />
          {liste.length > 1 ? (
            <button type="button" className={t.retirer} onClick={() => retirer(i)} aria-label={`Retirer le téléphone ${i + 1}`} title="Retirer ce numéro" tabIndex={-1}>
              ×
            </button>
          ) : (
            <span className={t.place} aria-hidden />
          )}
        </div>
      ))}
      {liste.length < TELEPHONES_MAX && (
        <button type="button" className={t.ajouter} onClick={ajouter}>
          <span aria-hidden>+</span> Ajouter un numéro
        </button>
      )}
    </div>
  );
}

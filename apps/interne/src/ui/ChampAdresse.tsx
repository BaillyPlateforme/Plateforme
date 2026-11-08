"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { RemplirAdresse, SuggestionAdresse } from "./adresses";
import s from "./champ-adresse.module.css";

export type { RemplirAdresse, SuggestionAdresse } from "./adresses";

/*
 * Un champ d'adresse avec ses suggestions : la Base Adresse Nationale, par
 * /api/adresses. Le même champ sert partout dans le CRM.
 *
 * Deux façons de l'employer :
 * - contrôlé : `value`, `onChange`, et `onChoisir` pour remplir soi-même le
 *   code postal, la ville, le pays ;
 * - non contrôlé, dans un formulaire d'action serveur : `name`,
 *   `defaultValue`, et `remplir` qui désigne par leur `name` les champs
 *   voisins à remplir au choix d'une suggestion.
 *
 * `mode="ville"` ne propose que des communes ; sinon, toute adresse (numéro,
 * voie, lieu-dit, commune). Le champ reçoit l'adresse entière, ou seulement
 * le numéro et la voie quand le formulaire a ses propres champs code postal
 * et ville (`saisie="voie"`, implicite si `remplir` en désigne).
 *
 * Le texte libre reste toujours possible : rien n'est choisi d'office, une
 * adresse à l'étranger ou un lieu-dit s'écrit tel quel. ↑ ↓ parcourent la
 * liste, Entrée choisit, Échap la referme en gardant le texte.
 *
 * La liste s'ouvre par-dessus tout (API Popover : couche supérieure du
 * navigateur), y compris dans une fenêtre modale ou un parent qui coupe ce
 * qui déborde.
 */

type Natif = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type" | "role" | "list" | "autoComplete">;

export type ChampAdresseProps = Natif & {
  /** « adresse » (par défaut) : toute adresse ; « ville » : les communes seulement. */
  mode?: "adresse" | "ville";
  /** Ce que le champ reçoit au choix : l'adresse entière, ou le numéro et la voie seuls. */
  saisie?: "complete" | "voie";
  /** Non contrôlé : les champs du formulaire à remplir au choix, par leur attribut name. */
  remplir?: RemplirAdresse;
  /** Appelé après le choix d'une suggestion. */
  onChoisir?: (s: SuggestionAdresse) => void;
} & (
    | { value: string; onChange: (valeur: string) => void; defaultValue?: undefined }
    | { value?: undefined; onChange?: undefined; defaultValue?: string }
  );

const GENRES: Partial<Record<SuggestionAdresse["genre"], string>> = { municipality: "Commune", locality: "Lieu-dit", street: "Voie" };

/** Les réponses déjà reçues, le temps de la page : un retour arrière ne refait pas la requête. */
const MEMOIRE = new Map<string, SuggestionAdresse[]>();

/** Pose une valeur dans un champ comme si on l'avait tapée (un champ contrôlé par React le voit aussi). */
function poser(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, valeur: string) {
  const ecrire = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
  if (ecrire) ecrire.call(el, valeur);
  else el.value = valeur;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  // Un éclair discret : on voit ce qui vient d'être rempli.
  if ("type" in el && el.type === "hidden") return;
  const fond = getComputedStyle(el).backgroundColor;
  el.animate?.({ backgroundColor: ["#ece7ff", fond] }, { duration: 1100, easing: "ease-out" });
}

/** Les champs voisins désignés par `remplir`, cherchés dans le formulaire du champ. */
function remplirVoisins(champ: HTMLInputElement, remplir: RemplirAdresse, sg: SuggestionAdresse) {
  const portee: ParentNode = champ.form ?? champ.ownerDocument;
  const valeurs: Record<keyof RemplirAdresse, string> = {
    codePostal: sg.codePostal,
    ville: sg.ville,
    pays: "France",
    lat: sg.lat == null ? "" : String(sg.lat),
    lon: sg.lon == null ? "" : String(sg.lon),
  };
  for (const [cle, nom] of Object.entries(remplir) as [keyof RemplirAdresse, string | undefined][]) {
    if (!nom) continue;
    const cible = portee.querySelector<HTMLInputElement>(`[name="${CSS.escape(nom)}"]`);
    if (cible && cible !== champ) poser(cible, valeurs[cle]);
  }
}

export default function ChampAdresse(props: ChampAdresseProps) {
  const { mode = "adresse", saisie, remplir, onChoisir, value, onChange, defaultValue, onKeyDown, onFocus, onBlur, className, ...natif } = props;
  const champ = useRef<HTMLInputElement>(null);
  const liste = useRef<HTMLDivElement>(null);
  const idListe = useId();
  const [suggestions, setSuggestions] = useState<SuggestionAdresse[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(-1);
  const minuterie = useRef<number | undefined>(undefined);
  const requete = useRef<AbortController | null>(null);
  const visible = ouvert && suggestions.length > 0;
  const visibleRef = useRef(false);
  const contenu = saisie ?? (mode === "adresse" && (remplir?.codePostal || remplir?.ville) ? "voie" : "complete");

  useEffect(() => {
    visibleRef.current = visible;
  });

  // En partant, plus rien n'attend de réponse.
  useEffect(
    () => () => {
      window.clearTimeout(minuterie.current);
      requete.current?.abort();
    },
    [],
  );

  /*
   * Échap referme la liste et rien d'autre : écouté sur le champ lui-même,
   * avant que l'événement remonte jusqu'à la fenêtre modale qui se
   * refermerait aussi (la fiche écoute le document, <dialog> a son Échap).
   */
  useEffect(() => {
    const el = champ.current;
    if (!el) return;
    const echap = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !visibleRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      setOuvert(false);
    };
    el.addEventListener("keydown", echap);
    return () => el.removeEventListener("keydown", echap);
  }, []);

  // La liste se place sous le champ (au-dessus s'il manque la place), et le suit au défilement.
  useLayoutEffect(() => {
    const el = liste.current;
    const ancre = champ.current;
    if (!visible || !el || !ancre) return;
    if (typeof el.showPopover === "function" && !el.matches(":popover-open")) {
      try {
        el.showPopover();
      } catch {
        /* Navigateur sans couche supérieure : la position fixe suffit. */
      }
    }
    const placer = () => {
      const r = ancre.getBoundingClientRect();
      // Assez large pour une adresse entière, même sous un champ étroit.
      const largeur = Math.min(Math.max(r.width, mode === "ville" ? 320 : 420), window.innerWidth - 16);
      const dessous = window.innerHeight - r.bottom - 14;
      const dessus = r.top - 14;
      const enHaut = dessous < 240 && dessus > dessous;
      el.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - largeur - 8))}px`;
      el.style.width = `${largeur}px`;
      el.style.maxHeight = `${Math.max(140, Math.min(360, enHaut ? dessus : dessous))}px`;
      el.style.top = enHaut ? "auto" : `${r.bottom + 6}px`;
      el.style.bottom = enHaut ? `${window.innerHeight - r.top + 6}px` : "auto";
      el.dataset.sens = enHaut ? "haut" : "bas";
    };
    placer();
    window.addEventListener("scroll", placer, true);
    window.addEventListener("resize", placer);
    return () => {
      window.removeEventListener("scroll", placer, true);
      window.removeEventListener("resize", placer);
    };
  }, [visible, suggestions, mode]);

  // La suggestion active reste en vue quand on parcourt la liste au clavier.
  useEffect(() => {
    if (visible && actif >= 0) liste.current?.querySelector(`[data-rang="${actif}"]`)?.scrollIntoView({ block: "nearest" });
  }, [visible, actif]);

  const montrer = (l: SuggestionAdresse[]) => {
    setSuggestions(l);
    setActif(-1);
    setOuvert(l.length > 0 && document.activeElement === champ.current);
  };

  const chercher = (texte: string) => {
    window.clearTimeout(minuterie.current);
    requete.current?.abort();
    const q = texte.replace(/\s+/g, " ").trim();
    if (q.replace(/[^\p{L}\p{N}]/gu, "").length < 3) {
      setOuvert(false);
      setSuggestions([]);
      return;
    }
    const cle = `${mode}|${q.toLowerCase()}`;
    const connu = MEMOIRE.get(cle);
    if (connu) return montrer(connu);
    minuterie.current = window.setTimeout(async () => {
      const ctrl = new AbortController();
      requete.current = ctrl;
      try {
        const r = await fetch(`/api/adresses?type=${mode}&q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!r.ok) return montrer([]);
        const l = ((await r.json()) as { suggestions?: SuggestionAdresse[] }).suggestions ?? [];
        if (MEMOIRE.size > 200) MEMOIRE.clear();
        MEMOIRE.set(cle, l);
        if (!ctrl.signal.aborted) montrer(l);
      } catch {
        /* Une frappe plus récente a pris le relais, ou le réseau manque : le texte libre reste. */
      }
    }, 200);
  };

  const choisir = (sg: SuggestionAdresse) => {
    window.clearTimeout(minuterie.current);
    requete.current?.abort();
    const texte = mode === "ville" ? sg.ville : contenu === "voie" ? sg.voie : sg.libelle;
    const el = champ.current;
    if (onChange) onChange(texte);
    else if (el) el.value = texte;
    if (el && remplir) remplirVoisins(el, remplir, sg);
    setOuvert(false);
    setSuggestions([]);
    setActif(-1);
    onChoisir?.(sg);
  };

  const touche = (e: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented || e.nativeEvent.isComposing) return;
    const n = suggestions.length;
    if (e.key === "ArrowDown" && n) {
      e.preventDefault();
      if (!visible) {
        setOuvert(true);
        return setActif(0);
      }
      setActif((a) => (a + 1) % n);
    } else if (e.key === "ArrowUp" && visible) {
      e.preventDefault();
      setActif((a) => (a <= 0 ? n - 1 : a - 1));
    } else if (e.key === "Enter" && visible) {
      // ⌘/Ctrl+Entrée garde son sens (créer, enregistrer) : la liste se ferme seulement.
      if (actif >= 0 && suggestions[actif] && !e.metaKey && !e.ctrlKey) {
        // Entrée choisit : elle n'envoie pas le formulaire et ne passe pas au champ suivant.
        e.preventDefault();
        e.stopPropagation();
        choisir(suggestions[actif]);
      } else setOuvert(false); // Rien de choisi : le texte tapé reste, Entrée fait ce qu'elle fait d'habitude.
    }
  };

  return (
    <>
      <input
        {...natif}
        ref={champ}
        type="text"
        className={className}
        {...(onChange ? { value: value ?? "" } : { defaultValue })}
        onChange={(e) => {
          onChange?.(e.target.value);
          chercher(e.target.value);
        }}
        onKeyDown={touche}
        onFocus={(e) => {
          onFocus?.(e);
          if (suggestions.length) setOuvert(true);
        }}
        onBlur={(e) => {
          onBlur?.(e);
          setOuvert(false);
        }}
        // Le champ a sa propre liste : celle du navigateur et des gestionnaires de mots de passe n'a rien à y faire.
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        data-form-type="other"
        data-lpignore="true"
        data-1p-ignore=""
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={visible ? idListe : undefined}
        aria-activedescendant={visible && actif >= 0 ? `${idListe}-${actif}` : undefined}
      />
      {visible && (
        <div
          ref={liste}
          id={idListe}
          popover="manual"
          role="listbox"
          aria-label={mode === "ville" ? "Communes suggérées" : "Adresses suggérées"}
          className={s.liste}
          // La liste ne prend jamais la main : le curseur reste dans le champ.
          onMouseDown={(e) => e.preventDefault()}
        >
          {suggestions.map((sg, i) => (
            <div
              key={`${sg.titre}|${sg.codePostal}|${i}`}
              id={`${idListe}-${i}`}
              data-rang={i}
              role="option"
              aria-selected={i === actif}
              className={s.option}
              onMouseMove={() => i !== actif && setActif(i)}
              onClick={() => choisir(sg)}
            >
              <svg className={s.picto} viewBox="0 0 24 24" aria-hidden>
                <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
                <circle cx="12" cy="9.5" r="2.5" />
              </svg>
              <div className={s.texte}>
                <div className={s.titre}>{sg.titre}</div>
                <div className={s.sous}>{[sg.codePostal, sg.departement].filter(Boolean).join(" · ")}</div>
              </div>
              {mode === "adresse" && GENRES[sg.genre] && <div className={s.genre}>{GENRES[sg.genre]}</div>}
            </div>
          ))}
          <div className={s.pied} aria-hidden>
            <div>Base Adresse Nationale</div>
            <div>Échap : garder le texte saisi</div>
          </div>
        </div>
      )}
    </>
  );
}

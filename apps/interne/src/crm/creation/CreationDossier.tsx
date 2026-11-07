"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { flushSync, useFormStatus } from "react-dom";
import { creerDossier } from "@/crm/actions";
import { STATUTS, m3, nomClient } from "@/crm/lib/format";
import {
  SEGMENTS, SEGMENTS_SOCIETE, TYPES_DEMENAGEMENT, court, depuis, developperPeriode, libelleSegment, moisAVenir,
  type ClientConnu, type Reperes, type SourceDossier, type SourceModele,
} from "./commun";
import { Picto } from "./Picto";
import s from "./creation.module.css";

/*
 * L'écran de création d'un dossier, au clavier d'abord.
 *
 * Le strict nécessaire (client, coordonnées, départ, arrivée, période) ; le
 * reste, si on le sait. Entrée passe au prochain champ essentiel encore vide,
 * puis crée le dossier quand tout l'essentiel est là ; ⌘/Ctrl+Entrée crée
 * tout de suite, dès que le client a un nom et un moyen d'être joint.
 *
 * « Partir de… » préremplit ce qui se réutilise (segment, type de
 * déménagement, volume, options ; observations d'un modèle ; étapes et
 * observations quand c'est le même client). Un champ prérempli est marqué, et
 * la reprise s'annule d'un geste. Ce que l'utilisateur a tapé n'est jamais
 * écrasé.
 */

interface V {
  type: string; civilite: string; prenom: string; nom: string; societe: string; telephone: string; email: string;
  depart: string; arrivee: string; periode: string;
  type_demenagement: string; volume: string; commercial_id: string; observations: string;
  garde_meuble: boolean; vehicule: boolean;
  depart_etage: string; depart_asc: boolean; depart_acces: string;
  arrivee_etage: string; arrivee_asc: boolean; arrivee_acces: string;
}
type Cle = keyof V;
const VIDE: V = {
  type: "particulier", civilite: "", prenom: "", nom: "", societe: "", telephone: "", email: "",
  depart: "", arrivee: "", periode: "",
  type_demenagement: "national", volume: "", commercial_id: "", observations: "",
  garde_meuble: false, vehicule: false,
  depart_etage: "", depart_asc: false, depart_acces: "", arrivee_etage: "", arrivee_asc: false, arrivee_acces: "",
};

/** D'où part le dossier : un modèle ou un dossier passé. */
interface Origine { cle: string; genre: "modele" | "dossier"; id: number; titre: string }
interface Etat { v: V; repris: Cle[]; origine: Origine | null }

const nombre = (x: number) => String(Math.round(x * 10) / 10).replace(".", ",");

/** Ce qu'un point de départ préremplit. Jamais l'identité ni les coordonnées d'un client. */
function reprise(src: SourceDossier | SourceModele, clientId: number | null): Partial<V> {
  const c = src.champs, r: Partial<V> = {};
  // Le segment appartient au client : rattaché, c'est le sien qui compte.
  if (c.type && !clientId) r.type = c.type;
  if (c.type_demenagement) r.type_demenagement = c.type_demenagement;
  if (c.volume) r.volume = nombre(c.volume);
  if (c.garde_meuble) r.garde_meuble = true;
  if (c.vehicule) r.vehicule = true;
  if (src.genre === "modele" && c.observations) r.observations = c.observations;
  // Le même client : ses étapes, leurs accès et ses observations suivent.
  if (src.genre === "dossier" && clientId && src.clientId === clientId) {
    if (src.observations) r.observations = src.observations;
    for (const g of ["depart", "arrivee"] as const) {
      const e = src[g];
      if (!e?.adresse) continue;
      r[g] = e.adresse;
      if (e.etage) r[`${g}_etage`] = e.etage;
      if (e.ascenseur) r[`${g}_asc`] = true;
      if (e.acces) r[`${g}_acces`] = e.acces;
    }
  }
  return r;
}

/** Applique une reprise : la précédente est d'abord retirée ; un champ tapé par l'utilisateur reste le sien. */
function appliquerSur(e: Etat, origine: Origine | null, champs: Partial<V>, touches: Set<Cle>, defauts: V): Etat {
  const v = { ...e.v } as Record<Cle, V[Cle]>;
  for (const k of e.repris) v[k] = defauts[k];
  const repris: Cle[] = [];
  for (const k of Object.keys(champs) as Cle[]) {
    if (touches.has(k)) continue;
    v[k] = champs[k] as V[Cle];
    repris.push(k);
  }
  return { v: v as unknown as V, repris, origine };
}

/** Les libellés des champs repris, regroupés (le départ et son étage ne font qu'un). */
const GROUPES: [string, Cle[]][] = [
  ["Segment", ["type"]], ["Type de déménagement", ["type_demenagement"]], ["Volume", ["volume"]],
  ["Garde-meuble", ["garde_meuble"]], ["Véhicule", ["vehicule"]], ["Observations", ["observations"]],
  ["Départ et accès", ["depart", "depart_etage", "depart_asc", "depart_acces"]],
  ["Arrivée et accès", ["arrivee", "arrivee_etage", "arrivee_asc", "arrivee_acces"]],
];

interface Props {
  moi: { id: number; role: string };
  commerciaux: { id: number; nom: string }[];
  monDernier: SourceDossier | null;
  dernierAgence: SourceDossier | null;
  modeles: SourceModele[];
  modeleInitial: number | null;
  maintenant: number;
}

const sAbonner = () => () => {};
const surMac = () => /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

export default function CreationDossier({ moi, commerciaux, monDernier, dernierAgence, modeles, modeleInitial, maintenant }: Props) {
  const mac = useSyncExternalStore(sAbonner, surMac, () => true);
  const cmd = mac ? "⌘" : "Ctrl";
  const alt = mac ? "⌥" : "Alt+";

  const comDefaut = moi.role === "commercial" ? String(moi.id) : "";
  const origineModele = (m: SourceModele): Origine => ({ cle: `modele-${m.id}`, genre: "modele", id: m.id, titre: `le modèle « ${m.nom} »` });

  const [etat, setEtat] = useState<Etat>(() => {
    const base: Etat = { v: { ...VIDE, commercial_id: comDefaut }, repris: [], origine: null };
    const m = modeles.find((x) => x.id === modeleInitial);
    return m ? appliquerSur(base, origineModele(m), reprise(m, null), new Set(), base.v) : base;
  });
  const v = etat.v;
  const touches = useRef(new Set<Cle>());
  const [client, setClient] = useState<ClientConnu | null>(null);
  const [reperes, setReperes] = useState<Reperes>({ client: null, doublons: [], proches: [] });
  const [ignores, setIgnores] = useState<number[]>([]);
  const [erreur, setErreur] = useState<{ champ: Cle; texte: string } | null>(null);
  const formulaire = useRef<HTMLFormElement>(null);
  // Au premier affichage, le curseur se pose sur le premier champ essentiel.
  const aFocaliser = useRef<Cle | "premier" | null>("premier");

  const societe = SEGMENTS_SOCIETE.includes(v.type);
  const defauts = (c: ClientConnu | null = client): V => ({ ...VIDE, commercial_id: comDefaut, type: c?.type ?? "particulier" });

  /* ---------- l'essentiel, dans l'ordre où Entrée le parcourt ---------- */
  const essentiels: [Cle, string][] = [
    ...(client ? [] : societe
      ? ([["societe", "raison sociale"], ["prenom", "prénom du contact"], ["nom", "nom du contact"]] as [Cle, string][])
      : ([["civilite", "civilité"], ["prenom", "prénom"], ["nom", "nom"]] as [Cle, string][])),
    ...(client ? [] : ([["telephone", "téléphone"], ["email", "e-mail"]] as [Cle, string][])),
    ["depart", "départ"], ["arrivee", "arrivée"], ["periode", "période"],
  ];
  const estVide = (k: Cle, x: V = v) => !String(x[k]).trim();
  const manquants = essentiels.filter(([k]) => estVide(k));

  /* ---------- focus ---------- */
  const focaliser = (k: Cle) => {
    const el = formulaire.current?.querySelector<HTMLElement>(`[data-champ="${k}"]`);
    if (el?.getAttribute("role") === "radiogroup")
      (el.querySelector<HTMLElement>('[aria-checked="true"]') ?? el.querySelector<HTMLElement>('[role="radio"]'))?.focus();
    else el?.focus();
  };
  // Après un rendu qui a changé les champs (reprise, rattachement), le curseur va au premier champ essentiel vide.
  useEffect(() => {
    const cible = aFocaliser.current;
    if (!cible) return;
    aFocaliser.current = null;
    const k = cible === "premier" ? essentiels.find(([c]) => estVide(c))?.[0] : cible;
    if (k) focaliser(k);
  });

  /* ---------- saisie ---------- */
  const maj = <K extends Cle>(k: K, val: V[K]) => {
    touches.current.add(k);
    setErreur((e) => (e?.champ === k ? null : e));
    setEtat((e) => ({ ...e, v: { ...e.v, [k]: val }, repris: e.repris.filter((x) => x !== k) }));
  };
  /** Le prochain champ essentiel vide après `depuis` ; sinon la création. */
  const suivant = (depuisChamp: string | null, creerSiComplet = true, x: V = v) => {
    const ordre = essentiels.map(([k]) => k);
    const vides = ordre.filter((k) => estVide(k, x));
    if (!vides.length) {
      if (creerSiComplet) creer();
      return;
    }
    const i = ordre.indexOf(depuisChamp as Cle);
    focaliser(ordre.slice(i + 1).find((k) => vides.includes(k)) ?? vides[0]);
  };
  const creer = () => {
    const nomOk = client || (societe ? v.societe : v.nom).trim();
    if (!nomOk) {
      const champ: Cle = societe ? "societe" : "nom";
      setErreur({ champ, texte: societe ? "Indiquez la raison sociale." : "Indiquez le nom du client." });
      return focaliser(champ);
    }
    if (!client && !v.telephone.trim() && !v.email.trim()) {
      setErreur({ champ: "telephone", texte: "Un téléphone ou un e-mail, pour joindre le client." });
      return focaliser("telephone");
    }
    setErreur(null);
    formulaire.current?.requestSubmit();
  };
  const surTouche = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    const t = e.target as HTMLElement;
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      if (t.dataset.champ === "periode") flushSync(() => setEtat((x) => ({ ...x, v: { ...x.v, periode: developperPeriode(x.v.periode, maintenant) } })));
      return creer();
    }
    if (e.shiftKey || e.altKey || t.tagName === "TEXTAREA") return;
    const champ = t.closest<HTMLElement>("[data-champ]")?.dataset.champ ?? null;
    if (t.tagName === "BUTTON" && !champ) return;
    e.preventDefault();
    if (champ === "periode") {
      const p = developperPeriode(v.periode, maintenant);
      if (p !== v.periode) flushSync(() => maj("periode", p));
    }
    suivant(champ);
  };

  /* ---------- « Partir de… » ---------- */
  const appliquer = (src: SourceDossier | SourceModele, origine: Origine, c: ClientConnu | null = client) => {
    const champs = reprise(src, c?.id ?? null);
    const t = new Set(touches.current);
    setEtat((e) => appliquerSur(e, origine, champs, t, defauts(c)));
    aFocaliser.current = "premier";
  };
  const vierge = () => {
    const t = new Set(touches.current);
    setEtat((e) => appliquerSur(e, null, {}, t, defauts()));
    aFocaliser.current = "premier";
  };
  const origineDossier = (d: SourceDossier, cle: string, titre: string): Origine => ({ cle, genre: "dossier", id: d.id, titre: `${titre} ${d.ref}` });

  /* ---------- le client déjà connu ---------- */
  const rattacher = (c: ClientConnu, reprendre: boolean) => {
    setClient(c);
    setErreur(null);
    const t = new Set(touches.current);
    setEtat((e) => {
      const v2: V = {
        ...e.v, civilite: c.civilite ?? "", prenom: c.prenom ?? "", nom: c.nom ?? "", societe: c.societe ?? "",
        email: c.email ?? e.v.email, telephone: c.telephone ?? e.v.telephone,
        type: t.has("type") ? e.v.type : c.type,
      };
      const base = { ...e, v: v2 };
      return reprendre && c.dernier
        ? appliquerSur(base, origineDossier(c.dernier, `client-${c.id}`, "son dernier dossier"), reprise(c.dernier, c.id), t, defauts(c))
        : base;
    });
    aFocaliser.current = "premier";
  };
  const detacher = () => {
    setClient(null);
    aFocaliser.current = SEGMENTS_SOCIETE.includes(v.type) ? "societe" : "nom";
  };

  /* ---------- les repères, à chaque pause de frappe ---------- */
  const volumeNum = Number(v.volume.replace(",", ".")) || null;
  const cleSaisie = JSON.stringify({
    email: v.email, telephone: v.telephone, nom: v.nom, societe: v.societe, depart: v.depart, arrivee: v.arrivee,
    volume: volumeNum, type: v.type, type_demenagement: v.type_demenagement, clientId: client?.id ?? null,
  });
  useEffect(() => {
    const ctrl = new AbortController();
    const minuterie = setTimeout(async () => {
      try {
        const r = await fetch("/api/dossiers/reperes", { method: "POST", headers: { "content-type": "application/json" }, body: cleSaisie, signal: ctrl.signal });
        if (r.ok) setReperes(await r.json());
      } catch {
        /* Une saisie plus récente a pris le relais, ou le réseau a manqué : les repères attendront la prochaine pause. */
      }
    }, 320);
    return () => {
      clearTimeout(minuterie);
      ctrl.abort();
    };
  }, [cleSaisie]);
  const connu = reperes.client && !client && !ignores.includes(reperes.client.id) ? reperes.client : null;
  const doublons = reperes.doublons.filter((d) => !ignores.includes(-d.id));

  /* ---------- raccourcis ⌥1 à ⌥9 ---------- */
  const raccourcis: Record<number, (() => void) | undefined> = {
    1: vierge,
    2: monDernier ? () => appliquer(monDernier, origineDossier(monDernier, "mien", "votre dernier dossier")) : undefined,
    3: dernierAgence ? () => appliquer(dernierAgence, origineDossier(dernierAgence, "agence", "le dernier dossier de l'agence")) : undefined,
  };
  modeles.slice(0, 3).forEach((m, i) => (raccourcis[4 + i] = () => appliquer(m, origineModele(m))));
  reperes.proches.forEach((p, i) => (raccourcis[7 + i] = () => appliquer(p.source, origineDossier(p.source, `proche-${p.source.id}`, "le dossier proche"))));
  const refRaccourcis = useRef(raccourcis);
  useEffect(() => {
    refRaccourcis.current = raccourcis;
  });
  useEffect(() => {
    const ecoute = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      const m = e.code.match(/^Digit([1-9])$/);
      const f = m && refRaccourcis.current[Number(m[1])];
      if (!f) return;
      e.preventDefault();
      f();
    };
    window.addEventListener("keydown", ecoute);
    return () => window.removeEventListener("keydown", ecoute);
  }, []);

  const estRepris = (k: Cle) => etat.repris.includes(k);
  const actif = etat.origine?.cle ?? "vierge";
  const reprisAffiches = GROUPES.filter(([, cles]) => cles.some(estRepris)).map(([l]) => l);

  /* ---------- rendu ---------- */
  const champTexte = (k: "prenom" | "nom" | "societe" | "telephone" | "email" | "depart" | "arrivee" | "periode", label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className={s.champ}>
      <span className={s.etiquette}>
        {label}
        {estRepris(k) && <em className={s.marqueRepris}>repris</em>}
      </span>
      <input
        {...props}
        data-champ={k}
        name={k}
        value={v[k]}
        onChange={(e) => maj(k, e.target.value)}
        onBlur={
          k === "periode"
            ? () => {
                // « janv » devient « Janvier 2027 » en quittant le champ.
                const p = developperPeriode(v.periode, maintenant);
                if (p !== v.periode) maj("periode", p);
              }
            : undefined
        }
        className={`${s.saisie} ${estRepris(k) ? s.repris : ""} ${erreur?.champ === k ? s.enErreur : ""}`}
        aria-invalid={erreur?.champ === k || undefined}
      />
    </label>
  );

  const etapeDetails = (g: "depart" | "arrivee") => {
    const d: [Cle, string][] = [];
    if (v[`${g}_etage`]) d.push([`${g}_etage`, `Étage ${v[`${g}_etage`]}`]);
    if (v[`${g}_asc`]) d.push([`${g}_asc`, "Ascenseur"]);
    if (v[`${g}_acces`]) d.push([`${g}_acces`, v[`${g}_acces`]]);
    return d.length ? (
      <span className={s.details}>
        {d.map(([k, l]) => (
          <span key={k} className={`${s.detail} ${estRepris(k) ? s.detailRepris : ""}`}>
            {l}
            <button type="button" tabIndex={-1} aria-label={`Retirer : ${l}`} onClick={() => maj(k, typeof VIDE[k] === "boolean" ? false : "")}>
              ×
            </button>
          </span>
        ))}
      </span>
    ) : null;
  };

  const ligneSource = (cle: "mien" | "agence", n: number, titre: string, d: SourceDossier | null, vide: string) => (
    <button
      type="button"
      className={s.source}
      aria-pressed={actif === cle}
      disabled={!d}
      onClick={() => d && appliquer(d, origineDossier(d, cle, cle === "mien" ? "votre dernier dossier" : "le dernier dossier de l'agence"))}
    >
      <i className={s.pastille} data-ton={cle}><Picto nom={cle === "mien" ? "moi" : "agence"} /></i>
      <span className={s.sourceCorps}>
        <b>{titre}</b>
        {d ? (
          <>
            <span>
              {d.ref} · {depuis(d.creeLe, maintenant)}
              {cle === "agence" && d.auteur ? ` · ${d.auteur}` : ""}
            </span>
            <span className={s.sourceTrajet}>
              {court(d.depart?.adresse)} → {court(d.arrivee?.adresse)}
              {[libelleSegment(d.champs.type), d.volume > 0 ? m3(d.volume) : null].filter(Boolean).map((x) => ` · ${x}`)}
            </span>
          </>
        ) : (
          <span>{vide}</span>
        )}
      </span>
      <kbd className={s.touche}>{alt}{n}</kbd>
    </button>
  );

  /** Les dossiers passés les plus proches de la saisie : une ligne chacun, qu'un clic (ou ⌥7 à ⌥9) reprend. */
  const blocProches = (ou: "rail" | "formulaire") => (
    <div className={`${s.prochesBloc} ${ou === "rail" ? s.prochesRail : s.prochesFormulaire}`}>
      <div className={s.groupeTete}>
        <span><Picto nom="cible" taille={14} /> Les plus proches de votre saisie</span>
      </div>
      {reperes.proches.length === 0 ? (
        <p className={s.prochesVide}>Dès la destination, le départ ou le volume, les trois dossiers passés les plus ressemblants s&apos;affichent ici, avec la raison.</p>
      ) : (
        <ol className={s.proches}>
          {reperes.proches.map((p, i) => {
            const cle = `proche-${p.source.id}`;
            return (
              <li key={p.source.id}>
                <button
                  type="button"
                  className={s.proche}
                  aria-pressed={actif === cle}
                  onClick={() => appliquer(p.source, origineDossier(p.source, cle, "le dossier proche"))}
                >
                  <span className={s.score} style={{ "--p": p.score } as React.CSSProperties}>
                    <b>
                      {p.score}
                      <small>%</small>
                    </b>
                  </span>
                  <span className={s.procheCorps}>
                    <span className={s.procheRef}>
                      <span className={s.sr}>Reprendre </span>
                      <b>{p.source.ref}</b>
                      <span>{p.source.client}</span>
                    </span>
                    <span className={s.procheTrajet}>
                      {court(p.source.depart?.adresse)} → {court(p.source.arrivee?.adresse)}
                      {p.source.volume > 0 ? ` · ${m3(p.source.volume)}` : ""}
                    </span>
                    <span className={s.raisons}>{p.raisons.slice(0, 3).join("\u00a0· ")}</span>
                  </span>
                  <kbd className={s.touche}>{alt}{7 + i}</kbd>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );

  return (
    <div className={s.ecran}>
      <div className={s.grille}>
        {/* ---------- le formulaire ---------- */}
        <form ref={formulaire} action={creerDossier} noValidate onKeyDown={surTouche} className={s.formulaire}>
          {etat.origine && (
            <div className={s.origine} role="status">
              <i className={s.origineIcone}><Picto nom="reprise" /></i>
              <div className={s.origineTexte}>
                <b>Prérempli depuis {etat.origine.titre}</b>
                <span>
                  {reprisAffiches.length ? `Repris : ${reprisAffiches.join(", ")}.` : "Rien à reprendre : les champs concernés sont déjà saisis."}
                  {" "}Identité, coordonnées, devis, factures, paiements et pièces ne sont jamais repris.
                </span>
              </div>
              <button type="button" className={s.annuler} onClick={vierge}>
                <Picto nom="annuler" /> Annuler la reprise
              </button>
            </div>
          )}

          {/* 1. Client */}
          <section className={s.section}>
            <header className={s.sectionTete}>
              <span className={s.numero}>1</span>
              <h3>Client</h3>
              {!client && (
                <span className={s.segment}>
                  <Choix champ="type" label="Segment" options={SEGMENTS} valeur={v.type} repris={estRepris("type")} onChoisir={(k) => maj("type", k)} />
                </span>
              )}
            </header>
            {client ? (
              <div className={s.clientRattache}>
                <i className={s.avatar}>{(nomClient(client) || client.nom).split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase()}</i>
                <div>
                  <b>{nomClient(client) || client.nom}</b>
                  <span>
                    {[libelleSegment(client.type), client.email, client.telephone, `${client.nbDossiers} dossier${client.nbDossiers > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <em className={s.marqueRattache}><Picto nom="lien" /> Client existant rattaché</em>
                <button type="button" className={s.boutonDoux} onClick={detacher}>Détacher</button>
                <input type="hidden" name="client_id" value={client.id} />
              </div>
            ) : (
              <>
                <div className={s.champs}>
                  {societe ? (
                    <>
                      <div className={s.w5}>{champTexte("societe", "Raison sociale", { autoComplete: "organization" })}</div>
                      <div className={s.w3}>{champTexte("prenom", "Contact · prénom", { autoComplete: "off" })}</div>
                      <div className={s.w4}>{champTexte("nom", "Contact · nom", { autoComplete: "off" })}</div>
                    </>
                  ) : (
                    <>
                      <div className={s.w3}>
                        <span className={s.champ}>
                          <span className={s.etiquette}>Civilité</span>
                          <Choix
                            champ="civilite"
                            label="Civilité"
                            options={[["Madame", "Madame"], ["Monsieur", "Monsieur"]]}
                            valeur={v.civilite}
                            plein
                            onChoisir={(k, clic) => {
                              maj("civilite", k);
                              if (clic) suivant("civilite", false, { ...v, civilite: k });
                            }}
                          />
                        </span>
                      </div>
                      <div className={s.w4}>{champTexte("prenom", "Prénom", { autoComplete: "off" })}</div>
                      <div className={s.w5}>{champTexte("nom", "Nom", { autoComplete: "off" })}</div>
                    </>
                  )}
                  <div className={s.w5}>{champTexte("telephone", "Téléphone", { type: "tel", inputMode: "tel", autoComplete: "off" })}</div>
                  <div className={s.w7}>{champTexte("email", "E-mail", { type: "email", inputMode: "email", autoComplete: "off" })}</div>
                </div>
                {connu && (
                  <div className={s.alerte} data-ton="info" role="status">
                    <i className={s.alerteIcone}><Picto nom="client" /></i>
                    <div className={s.alerteTexte}>
                      <b>Rattacher au client existant ?</b>
                      <span>
                        {nomClient(connu) || connu.nom} · même {connu.par === "email" ? "e-mail" : "téléphone"} · {connu.nbDossiers} dossier{connu.nbDossiers > 1 ? "s" : ""}
                        {connu.dernier ? ` · dernier : ${connu.dernier.ref}, ${court(connu.dernier.depart?.adresse)} → ${court(connu.dernier.arrivee?.adresse)}` : ""}
                      </span>
                    </div>
                    <div className={s.alerteActions}>
                      <button type="button" className={s.boutonPlein} onClick={() => rattacher(connu, false)}>Rattacher</button>
                      {connu.dernier && (
                        <button type="button" className={s.boutonDoux} onClick={() => rattacher(connu, true)}>
                          Rattacher et reprendre {connu.dernier.ref}
                        </button>
                      )}
                      <button type="button" className={s.boutonLien} onClick={() => setIgnores((x) => [...x, connu.id])}>Ignorer</button>
                    </div>
                  </div>
                )}
              </>
            )}
            {doublons.map((d) => (
              <div key={d.id} className={s.alerte} data-ton="doublon" role="status">
                <i className={s.alerteIcone}><Picto nom="alerte" /></i>
                <div className={s.alerteTexte}>
                  <b>Doublon possible : {d.ref}</b>
                  <span>
                    {d.client} · {STATUTS[d.statut]?.label ?? d.statut} · créé {depuis(d.creeLe, maintenant)}
                    {d.arrivee ? ` · vers ${court(d.arrivee)}` : ""} · {d.pourquoi}
                  </span>
                </div>
                <div className={s.alerteActions}>
                  <a className={s.boutonDoux} href={`/dossiers/${d.id}`} target="_blank" rel="noreferrer">Ouvrir la fiche ↗</a>
                  <button type="button" className={s.boutonLien} onClick={() => setIgnores((x) => [...x, -d.id])}>Ignorer</button>
                </div>
              </div>
            ))}
          </section>

          {/* 2. Trajet et période */}
          <section className={s.section}>
            <header className={s.sectionTete}>
              <span className={s.numero}>2</span>
              <h3>Trajet et période</h3>
              <p>Une adresse ou une ville suffit.</p>
            </header>
            <div className={s.trajet}>
              <div>
                {champTexte("depart", "Départ", { autoComplete: "off", placeholder: "Ville ou adresse" })}
                {etapeDetails("depart")}
              </div>
              <i className={s.fleche} aria-hidden><Picto nom="fleche" /></i>
              <div>
                {champTexte("arrivee", "Arrivée", { autoComplete: "off", placeholder: "Ville ou adresse" })}
                {etapeDetails("arrivee")}
              </div>
            </div>
            <div className={s.champs}>
              <div className={s.w5}>
                {champTexte("periode", "Période souhaitée", { autoComplete: "off", placeholder: "Fin janvier 2027, ou « janv »" })}
              </div>
              <div className={`${s.w7} ${s.mois}`}>
                {moisAVenir(new Date(maintenant)).slice(0, 4).map((m) => (
                  <button
                    key={m}
                    type="button"
                    tabIndex={-1}
                    className={s.moisPuce}
                    aria-pressed={v.periode === m}
                    onClick={() => {
                      maj("periode", m);
                      suivant("periode", false, { ...v, periode: m });
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Sur écran étroit, les plus proches s'affichent ici, sous le trajet (le rail passe alors au-dessus du formulaire). */}
          {blocProches("formulaire")}

          {/* 3. Si vous le savez */}
          <section className={`${s.section} ${s.facultatif}`}>
            <header className={s.sectionTete}>
              <span className={s.numero}>3</span>
              <h3>Si vous le savez</h3>
              <p>Facultatif : tout se complète ensuite sur la fiche.</p>
            </header>
            <div className={s.ligne}>
              <span className={s.etiquette}>
                Type de déménagement
                {estRepris("type_demenagement") && <em className={s.marqueRepris}>repris</em>}
              </span>
              <Choix
                champ="type_demenagement"
                label="Type de déménagement"
                options={TYPES_DEMENAGEMENT}
                valeur={v.type_demenagement}
                repris={estRepris("type_demenagement")}
                onChoisir={(k) => maj("type_demenagement", k)}
              />
            </div>
            <div className={s.champs}>
              <label className={`${s.champ} ${s.w3}`}>
                <span className={s.etiquette}>
                  Volume estimé
                  {estRepris("volume") && <em className={s.marqueRepris}>repris</em>}
                </span>
                <span className={s.suffixe}>
                  <input
                    data-champ="volume"
                    name="volume"
                    inputMode="decimal"
                    autoComplete="off"
                    value={v.volume}
                    onChange={(e) => maj("volume", e.target.value.replace(/[^0-9.,]/g, ""))}
                    className={`${s.saisie} ${estRepris("volume") ? s.repris : ""}`}
                  />
                  <em>m³</em>
                </span>
              </label>
              <label className={`${s.champ} ${s.w4}`}>
                <span className={s.etiquette}>Commercial</span>
                <select data-champ="commercial_id" name="commercial_id" value={v.commercial_id} onChange={(e) => maj("commercial_id", e.target.value)} className={s.saisie}>
                  <option value="">À attribuer</option>
                  {commerciaux.map((c) => (
                    <option key={c.id} value={c.id}>{c.nom}</option>
                  ))}
                </select>
              </label>
              <div className={`${s.champ} ${s.w5}`}>
                <span className={s.etiquette}>Options</span>
                <span className={s.bascules}>
                  {(
                    [
                      ["garde_meuble", "Garde-meuble", "rupture de charge"],
                      ["vehicule", "Véhicule", "carte grise + assurance"],
                    ] as const
                  ).map(([k, l, d]) => (
                    <button
                      key={k}
                      type="button"
                      data-champ={k}
                      className={`${s.bascule} ${estRepris(k) ? s.repris : ""}`}
                      aria-pressed={v[k]}
                      onClick={() => maj(k, !v[k])}
                      title={d}
                    >
                      <i aria-hidden>{v[k] ? <Picto nom="coche" /> : null}</i>
                      {l}
                    </button>
                  ))}
                </span>
              </div>
              <label className={`${s.champ} ${s.w12}`}>
                <span className={s.etiquette}>
                  Observations
                  {estRepris("observations") && <em className={s.marqueRepris}>repris</em>}
                </span>
                <textarea
                  data-champ="observations"
                  name="observations"
                  rows={2}
                  value={v.observations}
                  onChange={(e) => maj("observations", e.target.value)}
                  placeholder="Concurrents déjà vus, code portail, instructions du téléphone…"
                  className={`${s.saisie} ${s.zone} ${estRepris("observations") ? s.repris : ""}`}
                />
              </label>
            </div>
          </section>

          {/* Les valeurs que les contrôles maison ne portent pas eux-mêmes. */}
          <input type="hidden" name="type" value={v.type} />
          <input type="hidden" name="civilite" value={v.civilite} />
          <input type="hidden" name="type_demenagement" value={v.type_demenagement} />
          {v.garde_meuble && <input type="hidden" name="garde_meuble" value="on" />}
          {v.vehicule && <input type="hidden" name="vehicule" value="on" />}
          {client && (
            <>
              <input type="hidden" name="prenom" value={v.prenom} />
              <input type="hidden" name="nom" value={v.nom} />
              <input type="hidden" name="societe" value={v.societe} />
              <input type="hidden" name="email" value={v.email} />
              <input type="hidden" name="telephone" value={v.telephone} />
            </>
          )}
          {(["depart_etage", "depart_acces", "arrivee_etage", "arrivee_acces"] as const).map((k) => v[k] && <input key={k} type="hidden" name={k} value={v[k]} />)}
          {v.depart_asc && <input type="hidden" name="depart_asc" value="on" />}
          {v.arrivee_asc && <input type="hidden" name="arrivee_asc" value="on" />}
          {etat.origine && (
            <>
              <input type="hidden" name="source_genre" value={etat.origine.genre} />
              <input type="hidden" name="source_id" value={etat.origine.id} />
            </>
          )}

          {/* Le pied, toujours visible : ce qui manque, et la création. */}
          <footer className={s.pied}>
            <div className={s.progression}>
              <span className={s.points} aria-hidden>
                {essentiels.map(([k]) => (
                  <i key={k} data-ok={!estVide(k) || undefined} />
                ))}
              </span>
              <span className={s.manque} aria-live="polite">
                {erreur ? (
                  <b className={s.erreur}>{erreur.texte}</b>
                ) : manquants.length ? (
                  <>Il manque : {manquants.map(([, l]) => l).join(", ")}</>
                ) : (
                  <b className={s.complet}>L&apos;essentiel est là.</b>
                )}
              </span>
            </div>
            <span className={s.aidePied}>
              <kbd className={s.touche}>↵</kbd> suivant <kbd className={s.touche}>{cmd} ↵</kbd> créer
            </span>
            <BoutonCreer onCreer={creer} cmd={cmd} />
          </footer>
        </form>

        {/* ---------- le rail : partir de… (les plus proches en tête), les raccourcis ---------- */}
        <aside className={s.rail}>
          <section className={`${s.carte} ${s.partir}`} aria-label="Partir de…">
            <header className={s.carteTete}>
              <div>
                <h3>Partir de…</h3>
                <p>Seul ce qui se réutilise est repris.</p>
              </div>
            </header>
            {blocProches("rail")}
            <div className={s.groupeTete}>
              <span>Points de départ</span>
            </div>
            <div className={s.sources}>
              <button type="button" className={s.source} aria-pressed={actif === "vierge"} onClick={vierge}>
                <i className={s.pastille} data-ton="vierge"><Picto nom="vierge" /></i>
                <span className={s.sourceCorps}>
                  <b>Vierge</b>
                  <span>Un dossier neuf, rien de prérempli</span>
                </span>
                <kbd className={s.touche}>{alt}1</kbd>
              </button>
              {ligneSource("mien", 2, "Mon dernier dossier", monDernier, "Vos créations apparaîtront ici")}
              {ligneSource("agence", 3, "Dernier dossier de l'agence", dernierAgence, "Aucun dossier pour l'instant")}
            </div>
            <div className={s.groupeTete}>
              <span>Modèles</span>
              <Link href="/dossiers/modeles">Gérer les modèles</Link>
            </div>
            {modeles.length === 0 ? (
              <p className={s.sansModele}>
                Aucun modèle. <Link href="/dossiers/modeles?nouveau=1">En créer un</Link>
              </p>
            ) : (
              <ul className={s.modeles}>
                {modeles.map((m, i) => (
                  <li key={m.id}>
                    <button type="button" className={s.modele} aria-pressed={actif === `modele-${m.id}`} onClick={() => appliquer(m, origineModele(m))} title={m.description ?? undefined}>
                      <i className={s.modeleIcone}><Picto nom="modele" taille={15} /></i>
                      <span className={s.modeleNom}>{m.nom}</span>
                      <span className={s.modeleUsage}>{m.utilisations > 0 ? `${m.utilisations}×` : m.demo ? "démo" : "neuf"}</span>
                      {i < 3 && <kbd className={s.touche}>{alt}{4 + i}</kbd>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={`${s.carte} ${s.aide}`} aria-label="Raccourcis clavier">
            <h3>Au clavier</h3>
            <dl>
              <dt><kbd className={s.touche}>↵</kbd></dt>
              <dd>Champ essentiel suivant, puis création</dd>
              <dt><kbd className={s.touche}>{cmd} ↵</kbd></dt>
              <dd>Créer et ouvrir la fiche, tout de suite</dd>
              <dt><kbd className={s.touche}>← →</kbd></dt>
              <dd>Choisir la civilité, le segment, le type</dd>
              <dt><kbd className={s.touche}>{alt}1 · 2 · 3</kbd></dt>
              <dd>Vierge, mon dernier, dernier de l&apos;agence</dd>
              <dt><kbd className={s.touche}>{alt}4 · 5 · 6</kbd></dt>
              <dd>Les trois modèles les plus utilisés</dd>
              <dt><kbd className={s.touche}>{alt}7 · 8 · 9</kbd></dt>
              <dd>Les dossiers les plus proches</dd>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

/** Le bouton de création, qui suit l'envoi du formulaire. */
function BoutonCreer({ onCreer, cmd }: { onCreer: () => void; cmd: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="button" className={s.creer} onClick={onCreer} disabled={pending}>
      {pending ? "Création…" : "Créer le dossier"}
      <kbd>{cmd} ↵</kbd>
    </button>
  );
}

/**
 * Un choix parmi quelques options (civilité, segment, type de déménagement) :
 * une seule tabulation pour le groupe, les flèches pour choisir, Entrée pour
 * passer au champ suivant. Un clic choisit ; sur la civilité, il avance aussi.
 */
function Choix({
  champ, label, options, valeur, onChoisir, repris, plein,
}: {
  champ: Cle;
  label: string;
  options: [string, string][];
  valeur: string;
  onChoisir: (k: string, clic: boolean) => void;
  repris?: boolean;
  plein?: boolean;
}) {
  const idx = options.findIndex(([k]) => k === valeur);
  const surTouche = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const n = options.length;
    let j: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") j = idx < 0 ? 0 : (idx + 1) % n;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = idx < 0 ? n - 1 : (idx - 1 + n) % n;
    if (j == null) return;
    e.preventDefault();
    onChoisir(options[j][0], false);
    e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[j]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} data-champ={champ} className={`${s.choix} ${plein ? s.choixPlein : ""} ${repris ? s.choixRepris : ""}`} onKeyDown={surTouche}>
      {options.map(([k, l], i) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={k === valeur}
          tabIndex={(idx < 0 ? i === 0 : k === valeur) ? 0 : -1}
          onClick={() => onChoisir(k, true)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

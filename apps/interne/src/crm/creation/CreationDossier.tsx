"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { flushSync, useFormStatus } from "react-dom";
import { creerDossier } from "@/crm/actions";
import { STATUTS, m3, nomClient } from "@/crm/lib/format";
import {
  ADRESSE_VIDE, ADRESSES_MAX, SEGMENTS, SEGMENTS_SOCIETE, court, depuis, developperPeriode, libelleSegment, adresseDepuisEtape, moisAVenir,
  type ClientConnu, type AdresseSaisie, type Reperes, type SourceDossier, type SourceModele,
} from "./commun";
import ChampAdresse from "@/ui/ChampAdresse";
import ChampsTelephones from "@/crm/clients/ChampsTelephones";
import { TELEPHONE_VIDE, telLisible, type Telephone } from "@/crm/clients/telephones";
import { Picto } from "./Picto";
import ListePorts from "./ListePorts";
import { SANS_KM, casePortVisible, lignesKilometres, portsDuTrajet, type Kilometres } from "./kilometres";
import type { SourceDuplication } from "@/crm/duplication/types";
import PanneauDuplication, { COCHES_DEFAUT, cochesInitiales, type Coches } from "@/crm/duplication/composants/PanneauDuplication";
import {
  DESTINATIONS_REPLI, GENRES_VEHICULE, GROUPES_OM, DEPARTEMENTS_OM, MOTORISATIONS, REPLI_VIDE, SITUATIONS_FAMILLE, VEHICULE_VIDE, VEHICULES_MAX,
  departementDepuisCodePostal, saisieVolume, volumeEnSaisie, type AdresseRepli, type RepliSaisi, type VehiculeSaisi,
} from "@/crm/cimob/commun";
import { BoutonEstimer, NoteEstimation } from "@/crm/cimob/Estimation";
import c from "@/crm/cimob/cimob.module.css";
import s from "./creation.module.css";

/*
 * L'écran de création d'un dossier, au clavier d'abord.
 *
 * Dans l'ordre proposé par Céline (16/11/2026), ce que l'équipe note dès le
 * premier appel, comme sur la fiche de visite de Créagidem : 1 · le client
 * (plusieurs téléphones, chacun avec ce qu'il désigne ; les droits d'un
 * CIMOB/DICOM ; le compte BAILLY d'un client compte ; l'origine), 2 · la
 * période, une seule pour tout le déménagement, 3 · l'adresse de départ et
 * 4 · l'adresse de livraison — chacune avec ses accès, et « + » pour en
 * ajouter une —, les kilomètres calculés entre elles (par la mer, avec la
 * case Port des adresses : la route jusqu'au port, la mer à vol d'oiseau, la
 * route depuis le port ; Céline, 18/11/2026), 5 · les observations.
 * L'ancienne section « Si vous le savez » (type, volume, commercial,
 * options) est retirée de l'écran : tout se complète sur la fiche, et ce
 * qu'une reprise apporte suit, caché.
 *
 * Entrée passe au prochain champ essentiel encore vide (un détail d'adresse
 * ou un téléphone de plus : au champ suivant), puis crée le dossier quand
 * tout l'essentiel est là ; ⌘/Ctrl+Entrée crée tout de suite, dès que le
 * client a un nom et un moyen d'être joint.
 *
 * « Partir de… » préremplit ce qui se réutilise (segment, type de
 * déménagement, volume, options ; observations d'un modèle). Pour le MÊME
 * client (2e déménagement, sortie de garde-meuble), l'arrivée de son dernier
 * dossier devient le départ du nouveau, avec ses accès, et ses observations
 * suivent ; le nouveau dossier ouvert depuis sa fiche part de là d'office.
 * D'un AUTRE client, aucune adresse ni aucun accès : c'est le domicile d'un
 * autre foyer (choix de David, 08/11/2026). Un champ prérempli est marqué,
 * et la reprise s'annule d'un geste. Ce que l'utilisateur a tapé n'est
 * jamais écrasé.
 *
 * « Dupliquer pour un nouveau client » (?depuis=<id>, le « ⋯ » d'un dossier)
 * est un point de départ de plus, réglé par quatre cases (trajet et accès,
 * inventaire, options et type, observations ; trajet et observations
 * décochés d'office, ils décrivent un autre foyer). La création reste la
 * même : creerDossier, qui reprend côté serveur ce que l'écran ne porte pas.
 */

interface V {
  type: string; civilite: string; prenom: string; nom: string; societe: string; email: string;
  telephones: Telephone[];
  /** Client compte : l'entreprise sous appel d'offres (« compte BAILLY »), un espace pro. */
  espace_pro_id: string;
  /** CIMOB/DICOM : le volume accordé par l'administration, en m³ (« 12,5 »). */
  volume_droits: string;
  /** CIMOB/DICOM (Céline, 17/11/2026) : la situation de famille (un code), le matricule, le repli, les véhicules. */
  situation_famille: string;
  matricule: string;
  repli: RepliSaisi;
  vehicules: VehiculeSaisi[];
  origine: string;
  periode: string;
  departs: AdresseSaisie[]; arrivees: AdresseSaisie[];
  observations: string;
  // Hors de l'écran depuis le 16/11/2026 : ce qu'une reprise apporte, et le commercial d'office.
  type_demenagement: string; volume: string; commercial_id: string; garde_meuble: boolean; vehicule: boolean;
}
type Cle = keyof V;
/** Ce que parcourt Entrée : une clé, ou le premier téléphone, la première adresse de départ ou de livraison. */
type Champ = Cle | "telephone" | "depart" | "arrivee";
type Genre = "departs" | "arrivees";

const VIDE: V = {
  type: "particulier", civilite: "", prenom: "", nom: "", societe: "", email: "",
  telephones: [TELEPHONE_VIDE], espace_pro_id: "", volume_droits: "", situation_famille: "", matricule: "", repli: REPLI_VIDE, vehicules: [VEHICULE_VIDE],
  origine: "", periode: "",
  departs: [ADRESSE_VIDE], arrivees: [ADRESSE_VIDE], observations: "",
  type_demenagement: "national", volume: "", commercial_id: "", garde_meuble: false, vehicule: false,
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
  // Le même client : il habite désormais à l'arrivée de son dernier dossier, qui devient le départ du nouveau ;
  // la livraison reste à saisir. D'un autre client, rien du trajet : son adresse et ses codes ne regardent que lui.
  if (src.genre === "dossier" && clientId && src.clientId === clientId) {
    const e = src.arrivee?.adresse ? src.arrivee : src.depart;
    if (e?.adresse) r.departs = [adresseDepuisEtape(e, true)];
    if (src.observations) r.observations = src.observations;
  }
  return r;
}

/**
 * Ce que « Dupliquer pour un nouveau client » préremplit, case par case. Le
 * reste — le détail des accès, les étapes intermédiaires, l'inventaire — est
 * repris par le serveur à la création (src/crm/duplication/dossier.ts).
 */
function repriseDuplication(src: SourceDuplication, c: Coches, clientId: number | null): Partial<V> {
  const r: Partial<V> = {};
  if (c.options) {
    // Le segment appartient au client : rattaché, c'est le sien qui compte.
    if (src.type && !clientId) r.type = src.type;
    if (src.typeDemenagement) r.type_demenagement = src.typeDemenagement;
    if (src.gardeMeuble) r.garde_meuble = true;
    if (src.vehicule) r.vehicule = true;
  }
  if (c.inventaire && src.volume > 0) r.volume = nombre(src.volume);
  if (c.trajet) {
    if (src.depart?.adresse) r.departs = [adresseDepuisEtape(src.depart, true)];
    if (src.arrivee?.adresse) r.arrivees = [adresseDepuisEtape(src.arrivee, false)];
  }
  if (c.observations && src.observations) r.observations = src.observations;
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

/** Les libellés des champs repris, regroupés (une adresse et ses accès ne font qu'un). */
const GROUPES: [string, Cle[]][] = [
  ["Segment", ["type"]], ["Type de déménagement", ["type_demenagement"]], ["Volume", ["volume"]],
  ["Garde-meuble", ["garde_meuble"]], ["Véhicule", ["vehicule"]], ["Observations", ["observations"]],
  ["Départ et accès", ["departs"]],
  ["Livraison et accès", ["arrivees"]],
];

const OUI_NON: [string, string][] = [["oui", "Oui"], ["non", "Non"]];

interface Props {
  moi: { id: number; role: string };
  monDernier: SourceDossier | null;
  dernierAgence: SourceDossier | null;
  modeles: SourceModele[];
  modeleInitial: number | null;
  /** Les comptes BAILLY (entreprises sous appel d'offres : les espaces pro), pour un client compte. */
  entreprises: { id: string; nom: string; actif: boolean }[];
  /** L'origine de la demande : la liste réglée par Bailly (Paramètres du devis), puis ce que l'équipe a déjà saisi. */
  origines: { reglees: string[]; saisies: string[] };
  /** Un client à rattacher d'emblée (`?client=<id>` : « Nouveau dossier pour ce client », depuis sa fiche). */
  clientInitial?: ClientConnu | null;
  /** Un dossier à dupliquer pour un nouveau client (`?depuis=<id>`) : des cases disent ce qui est repris. */
  duplication?: SourceDuplication | null;
  maintenant: number;
}

const sAbonner = () => () => {};
const surMac = () => /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

export default function CreationDossier({ moi, monDernier, dernierAgence, modeles, modeleInitial, entreprises, origines, clientInitial = null, duplication = null, maintenant }: Props) {
  const mac = useSyncExternalStore(sAbonner, surMac, () => true);
  const cmd = mac ? "⌘" : "Ctrl";
  const alt = mac ? "⌥" : "Alt+";

  const comDefaut = moi.role === "commercial" ? String(moi.id) : "";
  const origineModele = (m: SourceModele): Origine => ({ cle: `modele-${m.id}`, genre: "modele", id: m.id, titre: `le modèle « ${m.nom} »` });
  // La duplication pour un nouveau client (src/crm/duplication) : un point de départ comme les autres, réglé par ses cases.
  const origineDup: Origine | null = duplication ? { cle: `depuis-${duplication.id}`, genre: "dossier", id: duplication.id, titre: `le dossier ${duplication.ref}` } : null;
  const [coches, setCoches] = useState<Coches>(() => (duplication ? cochesInitiales(duplication) : COCHES_DEFAUT));

  const [etat, setEtat] = useState<Etat>(() => {
    if (duplication && origineDup && !clientInitial) {
      const base: Etat = { v: { ...VIDE, commercial_id: comDefaut }, repris: [], origine: null };
      return appliquerSur(base, origineDup, repriseDuplication(duplication, cochesInitiales(duplication), null), new Set(), base.v);
    }
    const c = clientInitial;
    // Le client rattaché d'emblée (« Nouveau dossier » depuis sa fiche) : son identité et son segment, et, s'il a déjà
    // déménagé avec nous, son dernier dossier — son arrivée devient le départ.
    const base: Etat = {
      v: c
        ? {
            ...VIDE, commercial_id: comDefaut, civilite: c.civilite ?? "", prenom: c.prenom ?? "", nom: c.nom ?? "", societe: c.societe ?? "", email: c.email ?? "",
            telephones: c.telephone ? [{ numero: telLisible(c.telephone), libelle: "" }] : [TELEPHONE_VIDE], type: c.type,
          }
        : { ...VIDE, commercial_id: comDefaut },
      repris: [],
      origine: null,
    };
    const m = modeles.find((x) => x.id === modeleInitial);
    if (m) return appliquerSur(base, origineModele(m), reprise(m, c?.id ?? null), new Set(), base.v);
    if (c?.dernier) {
      const origine: Origine = { cle: `client-${c.id}`, genre: "dossier", id: c.dernier.id, titre: `son dernier dossier ${c.dernier.ref}` };
      return appliquerSur(base, origine, reprise(c.dernier, c.id), new Set(), base.v);
    }
    return base;
  });
  const v = etat.v;
  const touches = useRef(new Set<Cle>());
  const [client, setClient] = useState<ClientConnu | null>(clientInitial);
  const [reperes, setReperes] = useState<Reperes>({ client: null, doublons: [], proches: [] });
  const [ignores, setIgnores] = useState<number[]>([]);
  const [erreur, setErreur] = useState<{ champ: Champ; texte: string } | null>(null);
  const formulaire = useRef<HTMLFormElement>(null);
  // Au premier affichage, le curseur se pose sur le premier champ essentiel.
  const aFocaliser = useRef<Champ | "premier" | null>("premier");

  const societe = SEGMENTS_SOCIETE.includes(v.type);
  /** CIMOB/DICOM : la création suit l'ordre de Céline (17/11/2026) — client, départ, livraison, repli, véhicules, observations. */
  const militaire = v.type === "militaire";
  const defauts = (c: ClientConnu | null = client): V => ({ ...VIDE, commercial_id: comDefaut, type: c?.type ?? "particulier" });

  /* ---------- l'essentiel, dans l'ordre où Entrée le parcourt ---------- */
  const essentiels: [Champ, string][] = [
    ...(client ? [] : societe
      ? ([["societe", "raison sociale"], ["prenom", "prénom du contact"], ["nom", "nom du contact"]] as [Champ, string][])
      : ([["civilite", "civilité"], ["prenom", "prénom"], ["nom", "nom"]] as [Champ, string][])),
    ...(client ? [] : ([["telephone", "téléphone"], ["email", "e-mail"]] as [Champ, string][])),
    ["periode", "période"], ["depart", "adresse de départ"], ["arrivee", "adresse de livraison"],
  ];
  const texteDe = (k: Champ, x: V): string =>
    k === "telephone" ? (x.telephones[0]?.numero ?? "") : k === "depart" ? (x.departs[0]?.adresse ?? "") : k === "arrivee" ? (x.arrivees[0]?.adresse ?? "") : String(x[k]);
  const estVide = (k: Champ, x: V = v) => !texteDe(k, x).trim();
  const manquants = essentiels.filter(([k]) => estVide(k));
  /** Le champ d'Entrée qui correspond à une clé de la saisie. */
  const champDe = (k: Cle): Champ => (k === "telephones" ? "telephone" : k === "departs" ? "depart" : k === "arrivees" ? "arrivee" : k);

  /* ---------- focus ---------- */
  const focaliser = (k: Champ) => {
    const el = formulaire.current?.querySelector<HTMLElement>(`[data-champ="${k}"]`);
    if (el?.getAttribute("role") === "radiogroup")
      (el.querySelector<HTMLElement>('[aria-checked="true"]') ?? el.querySelector<HTMLElement>('[role="radio"]'))?.focus();
    else el?.focus();
  };
  /** Le champ suivant de l'écran, comme Tab : pour les détails, où Entrée ne doit pas créer le dossier. */
  const champSuivant = (depuisEl: HTMLElement) => {
    const tous = Array.from(
      formulaire.current?.querySelectorAll<HTMLElement>('input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea, [role="radio"][tabindex="0"]') ?? [],
    );
    tous[tous.indexOf(depuisEl) + 1]?.focus();
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
    setErreur((e) => (e?.champ === champDe(k) ? null : e));
    setEtat((e) => ({ ...e, v: { ...e.v, [k]: val }, repris: e.repris.filter((x) => x !== k) }));
  };
  /** Une adresse de départ ou de livraison change : sur l'état du moment (le choix d'une suggestion en fait deux de suite). */
  const majLieu = (g: Genre, i: number, champs: Partial<AdresseSaisie>) => {
    touches.current.add(g);
    if (i === 0 && champs.adresse?.trim()) setErreur((e) => (e?.champ === champDe(g) ? null : e));
    setEtat((e) => ({ ...e, v: { ...e.v, [g]: e.v[g].map((l, j) => (j === i ? { ...l, ...champs } : l)) }, repris: e.repris.filter((x) => x !== g) }));
  };
  const ajouterLieu = (g: Genre) => {
    touches.current.add(g);
    setEtat((e) => ({ ...e, v: { ...e.v, [g]: [...e.v[g], ADRESSE_VIDE] }, repris: e.repris.filter((x) => x !== g) }));
    // Le curseur va à la nouvelle adresse.
    window.requestAnimationFrame(() => {
      const blocs = formulaire.current?.querySelectorAll<HTMLElement>(`[data-lieu="${g}"]`);
      blocs?.[blocs.length - 1]?.querySelector<HTMLInputElement>("input")?.focus();
    });
  };
  const retirerLieu = (g: Genre, i: number) => {
    touches.current.add(g);
    setEtat((e) => ({ ...e, v: { ...e.v, [g]: e.v[g].filter((_, j) => j !== i) }, repris: e.repris.filter((x) => x !== g) }));
  };
  /**
   * CIMOB/DICOM : le repli et son adresse, sur l'état du moment (le choix d'une suggestion en fait deux de suite).
   * Aucune reprise ne les touche : ils ne sont pas notés parmi les champs saisis.
   */
  const majRepli = (champs: Partial<RepliSaisi>, adresse?: Partial<AdresseRepli>) => {
    setEtat((e) => ({ ...e, v: { ...e.v, repli: { ...e.v.repli, ...champs, adresse: { ...e.v.repli.adresse, ...adresse } } } }));
  };
  /** Un véhicule : changer de genre, de marque ou de modèle retire une estimation faite pour un autre. */
  const majVehicule = (i: number, champs: Partial<VehiculeSaisi>) => {
    const efface = "genre" in champs || "marque" in champs || "modele" in champs;
    setEtat((e) => ({
      ...e,
      v: { ...e.v, vehicules: e.v.vehicules.map((x, j) => (j === i ? { ...x, ...(efface && !("estimation" in champs) ? { estimation: null } : {}), ...champs } : x)) },
    }));
  };
  const ajouterVehicule = () => {
    setEtat((e) => ({ ...e, v: { ...e.v, vehicules: [...e.v.vehicules, VEHICULE_VIDE] } }));
    window.requestAnimationFrame(() => {
      const blocs = formulaire.current?.querySelectorAll<HTMLElement>("[data-vehicule]");
      blocs?.[blocs.length - 1]?.querySelector<HTMLElement>('[role="radio"]')?.focus();
    });
  };
  const retirerVehicule = (i: number) => {
    setEtat((e) => ({ ...e, v: { ...e.v, vehicules: e.v.vehicules.filter((_, j) => j !== i) } }));
  };
  /** Le prochain champ essentiel vide après `depuis` ; sinon la création. */
  const suivant = (depuisChamp: string | null, creerSiComplet = true, x: V = v) => {
    const ordre = essentiels.map(([k]) => k);
    const vides = ordre.filter((k) => estVide(k, x));
    if (!vides.length) {
      if (creerSiComplet) creer();
      return;
    }
    const i = ordre.indexOf(depuisChamp as Champ);
    focaliser(ordre.slice(i + 1).find((k) => vides.includes(k)) ?? vides[0]);
  };
  const creer = () => {
    const nomOk = client || (societe ? v.societe : v.nom).trim();
    if (!nomOk) {
      const champ: Cle = societe ? "societe" : "nom";
      setErreur({ champ, texte: societe ? "Indiquez la raison sociale." : "Indiquez le nom du client." });
      return focaliser(champ);
    }
    if (!client && !v.telephones.some((t) => t.numero.trim()) && !v.email.trim()) {
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
    // Un détail (téléphone de plus, accès d'une adresse, origine, droits) : Entrée passe au champ suivant, sans créer.
    if (!champ) return champSuivant(t);
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

  /* ---------- la duplication pour un nouveau client : ses cases ---------- */
  const dupActive = !!origineDup && etat.origine?.cle === origineDup.cle;
  const appliquerDuplication = (c: Coches) => {
    if (!duplication || !origineDup) return;
    setCoches(c);
    const t = new Set(touches.current);
    setEtat((e) => appliquerSur(e, origineDup, repriseDuplication(duplication, c, client?.id ?? null), t, defauts()));
  };

  /* ---------- le client déjà connu ---------- */
  const rattacher = (c: ClientConnu, reprendre: boolean) => {
    setClient(c);
    setErreur(null);
    const t = new Set(touches.current);
    setEtat((e) => {
      const v2: V = {
        ...e.v, civilite: c.civilite ?? "", prenom: c.prenom ?? "", nom: c.nom ?? "", societe: c.societe ?? "",
        email: c.email ?? e.v.email, telephones: c.telephone ? [{ numero: telLisible(c.telephone), libelle: "" }] : e.v.telephones,
        type: t.has("type") ? e.v.type : c.type,
      };
      const base = { ...e, v: v2 };
      if (reprendre && c.dernier) return appliquerSur(base, origineDossier(c.dernier, `client-${c.id}`, "son dernier dossier"), reprise(c.dernier, c.id), t, defauts(c));
      // Une duplication en cours reste : seul le segment, celui du client rattaché, cesse d'être repris.
      if (duplication && origineDup && e.origine?.cle === origineDup.cle) return appliquerSur(base, origineDup, repriseDuplication(duplication, coches, c.id), t, defauts(c));
      return base;
    });
    aFocaliser.current = "premier";
  };
  const detacher = () => {
    setClient(null);
    aFocaliser.current = SEGMENTS_SOCIETE.includes(v.type) ? "societe" : "nom";
  };

  /* ---------- les repères, à chaque pause de frappe ---------- */
  const volumeNum = Number(v.volume.replace(",", ".")) || null;
  const livraison = [...v.arrivees].reverse().find((l) => l.adresse.trim())?.adresse ?? "";
  const cleSaisie = JSON.stringify({
    email: v.email, telephone: v.telephones[0]?.numero ?? "", nom: v.nom, societe: v.societe, depart: v.departs[0]?.adresse ?? "", arrivee: livraison,
    volume: volumeNum, type: v.type, type_demenagement: v.type_demenagement, clientId: client?.id ?? null,
    matricule: v.type === "militaire" ? v.matricule : "",
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

  /* ---------- les kilomètres, d'une adresse à la suivante (chargements, puis livraisons) ---------- */
  // Par la mer (Céline, 18/11/2026) : chaque adresse avec son genre et sa case Port ; la route jusqu'au port, la mer à
  // vol d'oiseau, la route depuis le port (./kilometres.ts). Une adresse et son port suffisent à un tronçon.
  const lieuxTrajet = [...v.departs.map((l) => ({ ...l, genre: "depart" })), ...v.arrivees.map((l) => ({ ...l, genre: "arrivee" }))];
  const portsTrajet = portsDuTrajet(lieuxTrajet);
  const parMer = !!(portsTrajet.depart || portsTrajet.arrivee);
  const trajet = lieuxTrajet
    .filter((l) => l.adresse.trim() || l.port.trim())
    .map((l) => ({ adresse: l.adresse, code_postal: l.code_postal, ville: l.ville, lat: l.lat, lon: l.lon, genre: l.genre, ...(l.port.trim() ? { port: l.port.trim() } : {}) }));
  const nbAdresses = trajet.filter((l) => l.adresse.trim()).length;
  const cleTrajet = nbAdresses >= (parMer ? 1 : 2) ? JSON.stringify(trajet) : "";
  const [kms, setKms] = useState<{ cle: string; k: Kilometres } | null>(null);
  useEffect(() => {
    if (!cleTrajet) return;
    const ctrl = new AbortController();
    const minuterie = setTimeout(async () => {
      try {
        const r = await fetch("/api/dossiers/distance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ etapes: JSON.parse(cleTrajet) }), signal: ctrl.signal });
        const j = r.ok ? ((await r.json()) as Partial<Kilometres>) : {};
        setKms({ cle: cleTrajet, k: { ...SANS_KM, ...j } });
      } catch {
        // Une adresse plus récente a pris le relais (le calcul reprendra avec elle), ou le réseau a manqué.
        if (!ctrl.signal.aborted) setKms({ cle: cleTrajet, k: SANS_KM });
      }
    }, 650);
    return () => {
      clearTimeout(minuterie);
      ctrl.abort();
    };
  }, [cleTrajet]);
  const kmsTrajet: Kilometres = cleTrajet && kms?.cle === cleTrajet ? kms.k : SANS_KM;
  const km = kmsTrajet.km;
  const kmEnCours = !!cleTrajet && kms?.cle !== cleTrajet;
  /** La case Port de chaque adresse : toujours pour un CIMOB/DICOM, dès qu'une adresse est outre-mer ou à l'étranger, et quand une est remplie. */
  const casesPort = casePortVisible(militaire, lieuxTrajet);

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
  const champTexte = (k: "prenom" | "nom" | "societe" | "email" | "periode", label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
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

  /** Une réponse Oui / Non (ascenseur, monte-meubles, transbordement, portage). */
  const ouiNon = (g: Genre, i: number, k: "ascenseur" | "monte_meuble" | "transbordement" | "portage", label: string, l: AdresseSaisie) => (
    <span className={s.champ}>
      <span className={s.etiquette}>{label}</span>
      <Choix label={`${label} (${g === "departs" ? "départ" : "livraison"} ${i + 1})`} options={OUI_NON} valeur={l[k] ? "oui" : "non"} plein onChoisir={(x) => majLieu(g, i, { [k]: x === "oui" })} />
    </span>
  );

  /**
   * Une adresse de départ ou de livraison et ce qu'on en note au premier appel (fiche de visite de Créagidem) :
   * l'adresse sur deux lignes, l'étage, l'ascenseur et sa taille, monte-meubles, transbordement, portage, le code
   * d'accès, la surface habitable (au départ), l'accès en camion.
   */
  const blocLieu = (g: Genre, i: number, l: AdresseSaisie) => {
    const depart = g === "departs";
    const liste = v[g];
    const essentiel = i === 0 ? champDe(g) : null;
    const reprisIci = i === 0 && estRepris(g);
    const id = `${g}-${i}`;
    return (
      <fieldset key={i} className={s.lieu} data-lieu={g}>
        {liste.length > 1 && (
          <legend className={s.lieuTete}>
            <span>
              {depart ? "Chargement" : "Livraison"} {i + 1}
            </span>
            <button type="button" className={s.boutonLien} onClick={() => retirerLieu(g, i)}>
              Retirer
            </button>
          </legend>
        )}
        <div className={s.champs}>
          <label className={`${s.champ} ${militaire ? s.w6 : s.w7}`}>
            <span className={s.etiquette}>
              Adresse
              {reprisIci && <em className={s.marqueRepris}>repris</em>}
            </span>
            <ChampAdresse
              data-champ={essentiel ?? undefined}
              id={`adresse-${id}`}
              value={l.adresse}
              onChange={(x) => majLieu(g, i, { adresse: x, code_postal: "", ville: "", pays: "", lat: null, lon: null })}
              onChoisir={(sg) => {
                // CIMOB/DICOM : une adresse choisie outre-mer remplit sa case département, si elle est encore vide.
                const om = militaire && !l.departement_om ? departementDepuisCodePostal(sg.codePostal) : null;
                majLieu(g, i, { code_postal: sg.codePostal, ville: sg.ville, pays: "France", lat: sg.lat, lon: sg.lon, ...(om ? { departement_om: om } : {}) });
              }}
              placeholder="Numéro et rue, ou ville"
              className={`${s.saisie} ${reprisIci ? s.repris : ""} ${essentiel && erreur?.champ === essentiel ? s.enErreur : ""}`}
              aria-invalid={(essentiel && erreur?.champ === essentiel) || undefined}
            />
          </label>
          <label className={`${s.champ} ${militaire ? s.w3 : s.w5}`}>
            <span className={s.etiquette}>Complément d&apos;adresse</span>
            <input value={l.complement} onChange={(e) => majLieu(g, i, { complement: e.target.value })} placeholder="Bâtiment, résidence, escalier…" autoComplete="off" className={s.saisie} />
          </label>
          {militaire && (
            <div className={s.w3}>
              <ChoixDepartementOm valeur={l.departement_om} onChoisir={(x) => majLieu(g, i, { departement_om: x })} />
            </div>
          )}
          {/* Le port d'embarquement ou de débarquement (Céline, 18/11/2026) : un de la liste, ou un texte libre. */}
          {casesPort && (
            <label className={`${s.champ} ${s.w4}`}>
              <span className={s.etiquette}>Port</span>
              <input
                value={l.port}
                onChange={(e) => majLieu(g, i, { port: e.target.value.slice(0, 80) })}
                list="ports-creation"
                placeholder={depart ? "Port de départ" : "Port d’arrivée"}
                autoComplete="off"
                className={s.saisie}
              />
            </label>
          )}
          <label className={`${s.champ} ${s.w2}`}>
            <span className={s.etiquette}>Étage</span>
            <input value={l.etage} onChange={(e) => majLieu(g, i, { etage: e.target.value })} placeholder="RDC, 3…" autoComplete="off" className={s.saisie} />
          </label>
          <div className={`${s.w3}`}>{ouiNon(g, i, "ascenseur", "Ascenseur", l)}</div>
          <label className={`${s.champ} ${s.w3}`}>
            <span className={s.etiquette}>Taille de l&apos;ascenseur</span>
            <span className={s.suffixe}>
              <input
                value={l.ascenseur_taille}
                onChange={(e) => majLieu(g, i, { ascenseur_taille: e.target.value })}
                disabled={!l.ascenseur}
                placeholder={l.ascenseur ? "Nombre" : "—"}
                autoComplete="off"
                className={s.saisie}
              />
              <em>pers.</em>
            </span>
          </label>
          <div className={`${s.w4}`}>{ouiNon(g, i, "monte_meuble", "Monte-meubles", l)}</div>
          <div className={`${s.w4}`}>{ouiNon(g, i, "transbordement", "Transbordement", l)}</div>
          <div className={`${s.w4}`}>{ouiNon(g, i, "portage", "Portage", l)}</div>
          <label className={`${s.champ} ${s.w4}`}>
            <span className={s.etiquette}>Code d&apos;accès</span>
            <input value={l.code_acces} onChange={(e) => majLieu(g, i, { code_acces: e.target.value })} placeholder="Codes, interphone…" autoComplete="off" className={s.saisie} />
          </label>
          {depart && (
            <label className={`${s.champ} ${s.w4}`}>
              <span className={s.etiquette}>Surface habitable</span>
              <span className={s.suffixe}>
                <input value={l.surface} onChange={(e) => majLieu(g, i, { surface: e.target.value.replace(/[^0-9.,]/g, "") })} inputMode="decimal" autoComplete="off" className={s.saisie} />
                <em>m²</em>
              </span>
            </label>
          )}
          {/* Avec la case Port, la dernière rangée se resserre : elle reste sur 12 colonnes. */}
          <label className={`${s.champ} ${depart ? (casesPort ? s.w4 : s.w8) : casesPort ? s.w8 : s.w12}`}>
            <span className={s.etiquette}>Accès en camion</span>
            <input value={l.acces_camion} onChange={(e) => majLieu(g, i, { acces_camion: e.target.value })} autoComplete="off" className={s.saisie} />
          </label>
        </div>
        {l.acces && (
          <span className={s.details}>
            <span className={`${s.detail} ${reprisIci ? s.detailRepris : ""}`}>
              Précisions : {l.acces}
              <button type="button" tabIndex={-1} aria-label={`Retirer : ${l.acces}`} onClick={() => majLieu(g, i, { acces: "" })}>
                ×
              </button>
            </span>
          </span>
        )}
      </fieldset>
    );
  };

  const sectionLieux = (g: Genre, numero: number, titre: string, ajout: string, aside?: React.ReactNode) => (
    <section className={s.section}>
      <header className={s.sectionTete}>
        <span className={s.numero}>{numero}</span>
        <h3>{titre}</h3>
        {g === "departs" && <p>Une adresse ou une ville suffit.</p>}
        {aside}
      </header>
      {/* CIMOB/DICOM (Céline, 17/11/2026) : au départ, ses droits et la période, juste au-dessus de l'adresse. */}
      {militaire && g === "departs" && (
        <div className={s.champs}>
          <label className={`${s.champ} ${s.w3}`}>
            <span className={s.etiquette} title="Le volume accordé par l'administration : seul volume communiqué au client">
              Droits (volume)
            </span>
            <span className={s.suffixe}>
              <input
                name="volume_droits"
                inputMode="decimal"
                autoComplete="off"
                value={v.volume_droits}
                onChange={(e) => maj("volume_droits", saisieVolume(e.target.value))}
                placeholder="12,5"
                className={s.saisie}
              />
              <em>m³</em>
            </span>
          </label>
          {champsPeriode(s.w5, s.w4, 2)}
        </div>
      )}
      {v[g].map((l, i) => blocLieu(g, i, l))}
      {v[g].length < ADRESSES_MAX && (
        <button type="button" className={s.ajouterLieu} onClick={() => ajouterLieu(g)}>
          <Picto nom="plus" taille={15} />
          {ajout}
        </button>
      )}
    </section>
  );

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
                    <span className={s.raisons}>{p.raisons.slice(0, 3).join(" · ")}</span>
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

  /** La période souhaitée et les mois proposés : dans sa section, ou au départ d'un CIMOB/DICOM. */
  const champsPeriode = (largeur: string, largeurMois: string, nbMois: number) => (
    <>
      <div className={largeur}>{champTexte("periode", "Période souhaitée", { autoComplete: "off", placeholder: "Fin janvier 2027, ou « janv »" })}</div>
      <div className={`${largeurMois} ${s.mois}`}>
        {moisAVenir(new Date(maintenant)).slice(0, nbMois).map((m) => (
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
    </>
  );

  /**
   * CIMOB/DICOM, 4 · le repli (modèle de Céline) : Oui / Non ; si oui, ses droits, la période et la
   * destination — un garde-meubles (son lieu) ou une adresse de son choix (étage, ascenseur et sa taille,
   * département d'outre-mer).
   */
  const sectionRepli = (numero: number) => {
    const r = v.repli;
    const a = r.adresse;
    return (
      <section className={s.section} data-cimob="repli">
        <header className={s.sectionTete}>
          <span className={s.numero}>{numero}</span>
          <h3>Repli</h3>
          <p>Ramener le mobilier du logement de métropole en garde-meubles ou à une adresse de son choix.</p>
          <span className={s.segment}>
            <Choix label="Repli" options={OUI_NON} valeur={r.repli ? "oui" : "non"} onChoisir={(x) => majRepli({ repli: x === "oui" })} />
          </span>
        </header>
        {r.repli && (
          <div className={s.champs}>
            <label className={`${s.champ} ${s.w3}`}>
              <span className={s.etiquette}>Volume (droits)</span>
              <span className={s.suffixe}>
                <input value={r.volume_droits} onChange={(e) => majRepli({ volume_droits: saisieVolume(e.target.value) })} inputMode="decimal" autoComplete="off" placeholder="30" className={s.saisie} />
                <em>m³</em>
              </span>
            </label>
            <label className={`${s.champ} ${s.w4}`}>
              <span className={s.etiquette}>Période</span>
              <input
                value={r.periode}
                onChange={(e) => majRepli({ periode: e.target.value.slice(0, 120) })}
                onBlur={() => {
                  const p = developperPeriode(r.periode, maintenant);
                  if (p !== r.periode) majRepli({ periode: p });
                }}
                placeholder="Juin 2027, ou « juin »"
                autoComplete="off"
                className={s.saisie}
              />
            </label>
            <span className={`${s.champ} ${s.w5}`}>
              <span className={s.etiquette}>Destination</span>
              <Choix label="Destination du repli" options={Object.entries(DESTINATIONS_REPLI)} valeur={r.destination} plein onChoisir={(x) => majRepli({ destination: x as RepliSaisi["destination"] })} />
            </span>
            {r.destination === "garde_meuble" && (
              <label className={`${s.champ} ${s.w12}`}>
                <span className={s.etiquette}>Lieu</span>
                <input value={r.lieu} onChange={(e) => majRepli({ lieu: e.target.value.slice(0, 200) })} placeholder="Garde-meubles Bailly, ville…" autoComplete="off" className={s.saisie} />
              </label>
            )}
            {r.destination === "adresse" && (
              <>
                <label className={`${s.champ} ${s.w6}`}>
                  <span className={s.etiquette}>Adresse</span>
                  <ChampAdresse
                    id="adresse-repli"
                    value={a.adresse}
                    onChange={(x) => majRepli({}, { adresse: x, code_postal: "", ville: "", pays: "" })}
                    onChoisir={(sg) => {
                      const om = !a.departement_om ? departementDepuisCodePostal(sg.codePostal) : null;
                      majRepli({}, { code_postal: sg.codePostal, ville: sg.ville, pays: "France", ...(om ? { departement_om: om } : {}) });
                    }}
                    placeholder="Numéro et rue, ou ville"
                    className={s.saisie}
                  />
                </label>
                <label className={`${s.champ} ${s.w2}`}>
                  <span className={s.etiquette}>Étage</span>
                  <input value={a.etage} onChange={(e) => majRepli({}, { etage: e.target.value.slice(0, 40) })} placeholder="RDC, 3…" autoComplete="off" className={s.saisie} />
                </label>
                <div className={s.w4}>
                  <ChoixDepartementOm valeur={a.departement_om} onChoisir={(x) => majRepli({}, { departement_om: x })} />
                </div>
                <span className={`${s.champ} ${s.w3}`}>
                  <span className={s.etiquette}>Ascenseur</span>
                  <Choix label="Ascenseur (repli)" options={OUI_NON} valeur={a.ascenseur ? "oui" : "non"} plein onChoisir={(x) => majRepli({}, { ascenseur: x === "oui" })} />
                </span>
                <label className={`${s.champ} ${s.w3}`}>
                  <span className={s.etiquette}>Taille de l&apos;ascenseur</span>
                  <span className={s.suffixe}>
                    <input
                      value={a.ascenseur_taille}
                      onChange={(e) => majRepli({}, { ascenseur_taille: e.target.value.slice(0, 40) })}
                      disabled={!a.ascenseur}
                      placeholder={a.ascenseur ? "Nombre" : "—"}
                      autoComplete="off"
                      className={s.saisie}
                    />
                    <em>pers.</em>
                  </span>
                </label>
              </>
            )}
          </div>
        )}
      </section>
    );
  };

  /**
   * CIMOB/DICOM, 5 · le transport des véhicules : Oui / Non ; si oui, chaque véhicule — moto ou voiture
   * (motorisation, marque, modèle, volume, que l'IA peut estimer), ou « autre » (une description et un
   * volume) — et « + » pour un de plus.
   */
  const sectionVehicules = (numero: number) => (
    <section className={s.section} data-cimob="vehicules">
      <header className={s.sectionTete}>
        <span className={s.numero}>{numero}</span>
        <h3>Transport de véhicules</h3>
        <span className={s.segment}>
          <Choix
            label="Transport de véhicules"
            options={OUI_NON}
            valeur={v.vehicule ? "oui" : "non"}
            onChoisir={(x) => {
              maj("vehicule", x === "oui");
              if (x === "oui" && !v.vehicules.length) maj("vehicules", [VEHICULE_VIDE]);
            }}
          />
        </span>
      </header>
      {v.vehicule && (
        <>
          {v.vehicules.map((x, i) => (
            <fieldset key={i} className={s.lieu} data-vehicule={i}>
              {v.vehicules.length > 1 && (
                <legend className={s.lieuTete}>
                  <span>Véhicule {i + 1}</span>
                  <button type="button" className={s.boutonLien} onClick={() => retirerVehicule(i)}>
                    Retirer
                  </button>
                </legend>
              )}
              <div className={s.champs}>
                <span className={`${s.champ} ${s.w5}`}>
                  <span className={s.etiquette}>Véhicule</span>
                  <Choix label={`Véhicule ${i + 1}`} options={Object.entries(GENRES_VEHICULE)} valeur={x.genre} plein onChoisir={(k) => majVehicule(i, { genre: k as VehiculeSaisi["genre"] })} />
                </span>
                {x.genre === "autre" && (
                  <>
                    <label className={`${s.champ} ${s.w4}`}>
                      <span className={s.etiquette}>Lequel</span>
                      <input value={x.description} onChange={(e) => majVehicule(i, { description: e.target.value.slice(0, 300) })} placeholder="Remorque, quad, bateau…" autoComplete="off" className={s.saisie} />
                    </label>
                    <label className={`${s.champ} ${s.w3}`}>
                      <span className={s.etiquette}>Volume</span>
                      <span className={s.suffixe}>
                        <input value={x.volume} onChange={(e) => majVehicule(i, { volume: saisieVolume(e.target.value) })} inputMode="decimal" autoComplete="off" className={s.saisie} />
                        <em>m³</em>
                      </span>
                    </label>
                  </>
                )}
                {(x.genre === "moto" || x.genre === "voiture") && (
                  <>
                    <span className={`${s.champ} ${s.w7}`}>
                      <span className={s.etiquette}>Motorisation</span>
                      <Choix label={`Motorisation (véhicule ${i + 1})`} options={Object.entries(MOTORISATIONS)} valeur={x.motorisation} onChoisir={(k) => majVehicule(i, { motorisation: k })} />
                    </span>
                    <label className={`${s.champ} ${s.w3}`}>
                      <span className={s.etiquette}>Marque</span>
                      <input value={x.marque} onChange={(e) => majVehicule(i, { marque: e.target.value.slice(0, 40) })} placeholder={x.genre === "moto" ? "Yamaha" : "Peugeot"} autoComplete="off" className={s.saisie} />
                    </label>
                    <label className={`${s.champ} ${s.w4}`}>
                      <span className={s.etiquette}>Modèle</span>
                      <input value={x.modele} onChange={(e) => majVehicule(i, { modele: e.target.value.slice(0, 60) })} placeholder={x.genre === "moto" ? "MT-07" : "308"} autoComplete="off" className={s.saisie} />
                    </label>
                    <div className={`${s.champ} ${s.w5}`}>
                      <span className={s.etiquette}>Volume du véhicule</span>
                      <span className={c.ligneVolume}>
                        <span className={s.suffixe}>
                          <input
                            value={x.volume}
                            onChange={(e) => majVehicule(i, { volume: saisieVolume(e.target.value) })}
                            inputMode="decimal"
                            autoComplete="off"
                            aria-label={`Volume du véhicule ${i + 1}`}
                            className={s.saisie}
                          />
                          <em>m³</em>
                        </span>
                        <BoutonEstimer vehicule={x} onEstime={(e) => majVehicule(i, { volume: volumeEnSaisie(e.volume), estimation: e })} />
                      </span>
                      <NoteEstimation estimation={x.estimation} volume={x.volume} />
                    </div>
                  </>
                )}
              </div>
            </fieldset>
          ))}
          {v.vehicules.length < VEHICULES_MAX && (
            <button type="button" className={s.ajouterLieu} onClick={ajouterVehicule}>
              <Picto nom="plus" taille={15} />
              Ajouter un véhicule
            </button>
          )}
        </>
      )}
    </section>
  );

  // Ce que l'écran envoie de ses adresses : relu et borné par le serveur (lireLieux, ./commun.ts).
  const lieuxEnvoyes = JSON.stringify([
    ...v.departs.map((l) => ({ genre: "depart", ...l })),
    ...v.arrivees.map((l) => ({ genre: "arrivee", ...l })),
  ]);
  const listeOrigines = [...origines.reglees, ...origines.saisies];
  const compte = v.type === "compte" && !client;

  return (
    <div className={s.ecran}>
      <div className={s.grille}>
        {/* ---------- le formulaire ---------- */}
        <form ref={formulaire} action={creerDossier} noValidate onKeyDown={surTouche} className={s.formulaire}>
          {duplication && (dupActive || !etat.origine) ? (
            <PanneauDuplication
              source={duplication}
              actif={dupActive}
              coches={coches}
              onChanger={appliquerDuplication}
              onAnnuler={vierge}
            />
          ) : etat.origine && (
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
                    {[libelleSegment(client.type), client.matricule ? `matricule ${client.matricule}` : null, client.email, telLisible(client.telephone), `${client.nbDossiers} dossier${client.nbDossiers > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}
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
                  <div className={`${s.champ} ${s.w7}`}>
                    <span className={s.etiquette}>
                      Téléphones <small className={s.aideEtiquette}>le premier reçoit les SMS</small>
                    </span>
                    <ChampsTelephones
                      valeur={v.telephones}
                      onChange={(l) => maj("telephones", l)}
                      classeSaisie={s.saisie}
                      premier={{ "data-champ": "telephone", className: erreur?.champ === "telephone" ? s.enErreur : "", "aria-invalid": erreur?.champ === "telephone" || undefined }}
                    />
                  </div>
                  <div className={`${s.w5} ${s.enHaut}`}>{champTexte("email", "E-mail", { type: "email", inputMode: "email", autoComplete: "off" })}</div>
                </div>
                {connu && (
                  <div className={s.alerte} data-ton="info" role="status">
                    <i className={s.alerteIcone}><Picto nom="client" /></i>
                    <div className={s.alerteTexte}>
                      <b>Rattacher au client existant ?</b>
                      <span>
                        {nomClient(connu) || connu.nom} · même {connu.par === "email" ? "e-mail" : connu.par === "matricule" ? "matricule" : "téléphone"} · {connu.nbDossiers} dossier{connu.nbDossiers > 1 ? "s" : ""}
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
            {/* Ce qui suit le segment : le matricule et la situation de famille d'un CIMOB/DICOM (Céline, 17/11/2026 ; ses
                droits sont au départ), le compte BAILLY d'un client compte ; l'origine, pour tous. */}
            <div className={s.champs}>
              {militaire && !client && (
                <>
                  <label className={`${s.champ} ${s.w4}`}>
                    <span className={s.etiquette}>Matricule</span>
                    <input
                      name="matricule"
                      value={v.matricule}
                      onChange={(e) => maj("matricule", e.target.value.slice(0, 40))}
                      autoComplete="off"
                      spellCheck={false}
                      className={s.saisie}
                    />
                  </label>
                  <label className={`${s.champ} ${s.w4}`}>
                    <span className={s.etiquette}>Situation de famille</span>
                    <select name="situation_famille" value={v.situation_famille} onChange={(e) => maj("situation_famille", e.target.value)} className={s.saisie}>
                      <option value="">À préciser</option>
                      {Object.entries(SITUATIONS_FAMILLE).map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              {compte && (
                <label className={`${s.champ} ${s.w4}`}>
                  <span className={s.etiquette}>Compte BAILLY</span>
                  <select
                    name="espace_pro_id"
                    value={v.espace_pro_id}
                    onChange={(e) => {
                      const id = e.target.value;
                      maj("espace_pro_id", id);
                      // La raison sociale, quand elle est encore vide, prend le nom du compte choisi.
                      const nom = entreprises.find((x) => x.id === id)?.nom;
                      if (nom && !v.societe.trim()) maj("societe", nom);
                    }}
                    className={s.saisie}
                  >
                    <option value="">{entreprises.length ? "Aucun" : "Liste indisponible"}</option>
                    {entreprises.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.nom}
                        {x.actif ? "" : " (espace en pause)"}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className={`${s.champ} ${s.w4}`}>
                <span className={s.etiquette}>Origine</span>
                {origines.reglees.length ? (
                  <select name="origine" value={v.origine} onChange={(e) => maj("origine", e.target.value)} className={s.saisie}>
                    <option value="">À préciser</option>
                    {listeOrigines.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input
                      name="origine"
                      list="origines-creation"
                      value={v.origine}
                      onChange={(e) => maj("origine", e.target.value)}
                      placeholder="Site internet, recommandation, compte…"
                      autoComplete="off"
                      className={s.saisie}
                    />
                    <datalist id="origines-creation">
                      {listeOrigines.map((o) => (
                        <option key={o} value={o} />
                      ))}
                    </datalist>
                  </>
                )}
              </label>
              {!origines.reglees.length && (
                <p className={`${s.w12} ${s.noteListe}`}>
                  La liste des origines n&apos;est pas encore définie : <Link href="/devis/parametres">Paramètres du devis › Origines de la demande</Link>.
                </p>
              )}
            </div>
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

          {/* 2. Période : une seule, pour tout le déménagement. Un CIMOB/DICOM la saisit au départ, juste au-dessus de l'adresse. */}
          {!militaire && (
            <section className={s.section}>
              <header className={s.sectionTete}>
                <span className={s.numero}>2</span>
                <h3>Période</h3>
                <p>Pour tout le déménagement.</p>
              </header>
              <div className={s.champs}>{champsPeriode(s.w5, s.w7, 4)}</div>
            </section>
          )}

          {/* 3. Adresse de départ — pour un CIMOB/DICOM, 2. Départ : ses droits et la période, puis l'adresse. */}
          {militaire
            ? sectionLieux("departs", 2, "Départ", "Ajouter une adresse de chargement")
            : sectionLieux("departs", 3, "Adresse de départ", "Ajouter une adresse de chargement")}

          {/* 4. Adresse de livraison (3. Livraison pour un CIMOB/DICOM), et les kilomètres du trajet */}
          {sectionLieux(
            "arrivees",
            militaire ? 3 : 4,
            militaire ? "Livraison" : "Adresse de livraison",
            "Ajouter une adresse de livraison",
            parMer ? (
              // Par la mer : trois distances, l'une sous l'autre, jamais additionnées (choix de David, 18/11/2026).
              <ul className={s.kmMer} aria-live="polite" aria-label="Kilomètres du trajet" data-etat={kmEnCours ? "calcul" : "ok"}>
                {kmEnCours ? <li>Calcul des km…</li> : lignesKilometres(kmsTrajet, portsTrajet).map((l) => <li key={l}>{l}</li>)}
              </ul>
            ) : (
              <span className={s.km} aria-live="polite" data-etat={km != null ? "ok" : kmEnCours ? "calcul" : "vide"}>
                {km != null ? `${km.toLocaleString("fr-FR")} km` : kmEnCours ? "Calcul des km…" : cleTrajet ? "Km : adresse introuvable" : "Km calculés dès deux adresses"}
              </span>
            ),
          )}

          {/* Sur écran étroit, les plus proches s'affichent ici, sous le trajet (le rail passe alors au-dessus du formulaire). */}
          {blocProches("formulaire")}

          {/* CIMOB/DICOM : 4. Repli, 5. Transport de véhicules (Céline, 17/11/2026). */}
          {militaire && sectionRepli(4)}
          {militaire && sectionVehicules(5)}

          {/* 5. Observations (6 pour un CIMOB/DICOM) */}
          <section className={s.section}>
            <header className={s.sectionTete}>
              <span className={s.numero}>{militaire ? 6 : 5}</span>
              <h3>Observations</h3>
              {estRepris("observations") && <em className={s.marqueRepris}>repris</em>}
            </header>
            <div className={s.champs}>
              <label className={`${s.champ} ${s.w12}`}>
                <span className={s.sr}>Observations</span>
                <textarea
                  data-champ="observations"
                  name="observations"
                  rows={3}
                  value={v.observations}
                  onChange={(e) => maj("observations", e.target.value)}
                  placeholder="Concurrents déjà vus, code portail, instructions du téléphone…"
                  className={`${s.saisie} ${s.zone} ${estRepris("observations") ? s.repris : ""}`}
                />
              </label>
            </div>
          </section>

          {/* CIMOB/DICOM : le repli et les véhicules, relus par le serveur (cimob/commun.ts). */}
          {militaire && (
            <>
              <input type="hidden" name="repli" value={JSON.stringify(v.repli)} />
              <input type="hidden" name="vehicules" value={JSON.stringify(v.vehicule ? v.vehicules : [])} />
            </>
          )}

          {/* Les valeurs que les contrôles maison ne portent pas eux-mêmes, et ce qu'une reprise apporte hors de l'écran. */}
          <input type="hidden" name="type" value={v.type} />
          <input type="hidden" name="civilite" value={v.civilite} />
          <input type="hidden" name="type_demenagement" value={v.type_demenagement} />
          <input type="hidden" name="lieux" value={lieuxEnvoyes} />
          <input type="hidden" name="distance_km" value={km ?? ""} />
          {parMer && (
            <>
              <input type="hidden" name="distance_vers_port_km" value={kmsTrajet.versPort ?? ""} />
              <input type="hidden" name="distance_mer_km" value={kmsTrajet.mer ?? ""} />
              <input type="hidden" name="distance_depuis_port_km" value={kmsTrajet.depuisPort ?? ""} />
            </>
          )}
          {casesPort && <ListePorts id="ports-creation" />}
          {v.volume && <input type="hidden" name="volume" value={v.volume} />}
          {v.commercial_id && <input type="hidden" name="commercial_id" value={v.commercial_id} />}
          {v.garde_meuble && <input type="hidden" name="garde_meuble" value="on" />}
          {v.vehicule && <input type="hidden" name="vehicule" value="on" />}
          {client && (
            <>
              <input type="hidden" name="prenom" value={v.prenom} />
              <input type="hidden" name="nom" value={v.nom} />
              <input type="hidden" name="societe" value={v.societe} />
              <input type="hidden" name="email" value={v.email} />
            </>
          )}
          {etat.origine && (
            <>
              <input type="hidden" name="source_genre" value={etat.origine.genre} />
              <input type="hidden" name="source_id" value={etat.origine.id} />
            </>
          )}
          {dupActive && duplication && (
            <>
              <input type="hidden" name="dupliquer_depuis" value={duplication.id} />
              <input type="hidden" name="dupliquer_mode" value="nouveau" />
              {(Object.keys(coches) as (keyof Coches)[]).map((k) => coches[k] && <input key={k} type="hidden" name={`dupliquer_${k}`} value="on" />)}
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

        {/* ---------- le rail : partir de… (points de départ et modèles en tête, immobiles ; les plus proches dessous), les raccourcis ---------- */}
        <aside className={s.rail}>
          <section className={`${s.carte} ${s.partir}`} aria-label="Partir de…">
            <header className={s.carteTete}>
              <div>
                <h3>Partir de…</h3>
                <p>Seul ce qui se réutilise est repris.</p>
              </div>
            </header>
            {/* Les points de départ restent en tête et ne bougent plus : les « plus proches », qui changent à chaque
                frappe, s'inséraient au-dessus et décalaient la liste sous la souris (David, 08/11/2026 : « quand je
                clique sur Partir de… ça ne marche pas »). */}
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
            {blocProches("rail")}
          </section>

          <section className={`${s.carte} ${s.aide}`} aria-label="Raccourcis clavier">
            <h3>Au clavier</h3>
            <dl>
              <dt><kbd className={s.touche}>↵</kbd></dt>
              <dd>Champ essentiel suivant, puis création</dd>
              <dt><kbd className={s.touche}>{cmd} ↵</kbd></dt>
              <dd>Créer et ouvrir la fiche, tout de suite</dd>
              <dt><kbd className={s.touche}>← →</kbd></dt>
              <dd>Choisir la civilité, le segment, oui ou non</dd>
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
 * Un choix parmi quelques options (civilité, segment, oui ou non) : une seule
 * tabulation pour le groupe, les flèches pour choisir, Entrée pour passer au
 * champ suivant. Un clic choisit ; sur la civilité, il avance aussi.
 */
function Choix({
  champ, label, options, valeur, onChoisir, repris, plein,
}: {
  /** Le champ qu'Entrée parcourt (data-champ) ; sans lui, Entrée passe au champ suivant de l'écran. */
  champ?: Cle;
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

/**
 * CIMOB/DICOM (Céline, 17/11/2026 : « IMPÉRATIF — une case département Outre-Mer dans les adresses ») : le
 * département ou la collectivité d'outre-mer d'une adresse, par son code officiel ; vide par défaut. Une
 * adresse choisie dans les suggestions le remplit d'elle-même d'après son code postal.
 */
function ChoixDepartementOm({ valeur, onChoisir }: { valeur: string; onChoisir: (code: string) => void }) {
  return (
    <label className={s.champ}>
      <span className={s.etiquette}>Département d&apos;outre-mer</span>
      <select value={valeur} onChange={(e) => onChoisir(e.target.value)} className={s.saisie}>
        <option value="">Aucun</option>
        {GROUPES_OM.map((gr) => (
          <optgroup key={gr.libelle} label={gr.libelle}>
            {gr.codes.map((code) => (
              <option key={code} value={code}>
                {code} · {DEPARTEMENTS_OM[code]}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

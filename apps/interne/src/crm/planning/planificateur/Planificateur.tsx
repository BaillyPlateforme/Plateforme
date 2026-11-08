"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { Ic } from "@/crm/lib/icons";
import Bandeau from "@/ui/Bandeau";
import ChampAdresse from "@/ui/ChampAdresse";
import { instantParis, jourVisite, momentVisite } from "@/lib/visite/regles";
import LegendePlanning from "../Legende";
import { decaler, hhmm, lundiDuJour, minutes } from "../grille";
import { TYPES_RDV, type TypeRdv } from "../types-rdv";
import { chargerSemaine, modifierRdv, planifierRdv } from "./actions";
import type { DossierPlanif, RdvPlanif, SemainePlanif, SourcePlanif } from "./donnees";
import { dureeParDefaut, titreParDefaut, verifierCreneau } from "./regles";
import SemaineChoix, { type Choix } from "./SemaineChoix";
import PrevenirClient from "./PrevenirClient";
import VisiteActuelle from "./VisiteActuelle";
import s from "./planificateur.module.css";

/*
 * Le planificateur de visite (/planning/nouveau) : planifier une visite en
 * quelques secondes depuis un dossier, au téléphone avec le client.
 *
 * 1. Sur place ou en visio : deux grandes cartes, aux couleurs du planning.
 *    Sur place, l'adresse, l'étage et l'accès du dossier sont là ; en visio,
 *    le téléphone et l'e-mail du client.
 * 2. Le créneau : la semaine du commercial (bande du haut), un clic dans la
 *    grille, ou l'un de ses premiers créneaux libres. Chevauchements, créneaux
 *    proposés à d'autres clients et journées visio sont signalés aussitôt.
 * 3. « Planifier la visite » : retour au dossier, qui propose d'envoyer la
 *    confirmation au client. Rien ne part tout seul.
 *
 * Sans dossier, c'est le « Nouveau RDV » du planning : visite, visio, tâche
 * ou règle perso, à la journée au besoin (une « journée visio »).
 *
 * En modification (`rdv`, /planning/<id>), le même écran repart du
 * rendez-vous : la personne, le type, le créneau (surligné dans la semaine de
 * la personne), la durée, le lieu et les observations. Changer de personne,
 * de type ou de créneau reste un clic. En tête, le rendez-vous tel qu'il est
 * au planning, avec « Marquer effectuée » et « Annuler la visite » ; à
 * droite, ce qui change, et pour une visite déplacée, la confirmation du
 * client remise à zéro et « Prévenir le client par SMS » (non coché).
 */

const DUREES = [30, 45, 60, 90, 120];
const PARIS = "Europe/Paris";

/** 570 → « 9 h 30 ». */
const hFr = (min: number) => `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, "0")}` : ""}`;
const maj = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const jourCourt = (jour: string) =>
  new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${jour}T12:00:00Z`));
const dureeFr = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, "0")}` : ""}`);
const estLien = (v: string | null | undefined): v is string => !!v && /^https?:\/\//i.test(v);

/** Le jour et l'heure de Paris d'un instant : de quoi griser le passé. */
function horloge(ms: number) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: PARIS, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  return { jour: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

export default function Planificateur({
  dossier,
  source,
  rdv = null,
  retourVers = null,
  dossiers,
  commerciaux,
  commercialInitial,
  semaineInitiale,
  maintenantInitial,
  typeInitial,
  apres,
}: {
  dossier: DossierPlanif | null;
  source: SourcePlanif | null;
  /** En modification : le rendez-vous que l'on reprend. */
  rdv?: RdvPlanif | null;
  /** D'où l'on vient (« planning ») : où l'on revient après avoir enregistré ou annulé. */
  retourVers?: string | null;
  /** Sans dossier : les dossiers en cours, pour rattacher le rendez-vous. */
  dossiers: { id: number; libelle: string }[];
  commerciaux: { id: number; nom: string }[];
  commercialInitial: number;
  semaineInitiale: SemainePlanif;
  maintenantInitial: number;
  typeInitial: TypeRdv;
  /** Sous le planificateur (la fenêtre de visite d'un rendez-vous modifié). */
  apres?: ReactNode;
}) {
  const router = useRouter();
  const edition = !!rdv;
  const [type, setType] = useState<TypeRdv>(typeInitial);
  const [commercialId, setCommercialId] = useState(commercialInitial);
  const [semaine, setSemaine] = useState(semaineInitiale);
  const [chargement, demarrer] = useTransition();
  const [maintenant, setMaintenant] = useState(maintenantInitial);
  // En modification, le créneau actuel est déjà choisi : rien ne change tant qu'on ne touche à rien.
  const [choix, setChoix] = useState<Choix | null>(rdv ? { jour: rdv.jour, min: rdv.min } : null);
  const [duree, setDuree] = useState(rdv?.duree || source?.duree || dureeParDefaut(typeInitial));
  const [dureeTouchee, setDureeTouchee] = useState(!!source || edition);
  const [journee, setJournee] = useState(rdv?.journee ?? false);
  const [titre, setTitre] = useState(rdv?.titre ?? source?.titre ?? titreParDefaut(typeInitial, dossier?.appel ?? null));
  const [titreTouche, setTitreTouche] = useState(!!source || edition);
  const [notes, setNotes] = useState(rdv?.notes ?? source?.notes ?? "");
  const [prevenir, setPrevenir] = useState(false);

  // Le lieu de la visite : une étape du trajet (le départ d'abord, ou celle de la visite modifiée), avec son étage et son accès.
  const etapes = useMemo(() => dossier?.etapes.filter((e) => e.genre !== "garde_meuble") ?? [], [dossier]);
  const etapeDepart = etapes.find((e) => e.genre === "depart" && e.adresse) ?? etapes.find((e) => e.adresse) ?? etapes[0] ?? null;
  const etapeVisite = rdv?.type === "phys" && rdv.lieu ? etapes.find((e) => e.adresse?.trim() === rdv.lieu?.trim()) : undefined;
  const etapeInitiale = etapeVisite ?? etapeDepart;
  const [etapeId, setEtapeId] = useState<number | null>(etapeInitiale?.id ?? null);
  const etape = etapes.find((e) => e.id === etapeId) ?? null;
  const lieuSource = rdv ? (rdv.type === "phys" ? rdv.lieu : null) : source && source.type === "phys" ? source.lieu : null;
  const [adresse, setAdresse] = useState(lieuSource ?? etapeDepart?.adresse ?? "");
  const [etage, setEtage] = useState(etapeInitiale?.etage ?? "");
  const [ascenseur, setAscenseur] = useState(etapeInitiale?.ascenseur ?? false);
  const [acces, setAcces] = useState(etapeInitiale?.acces ?? "");
  const lienRepris = rdv ? (rdv.type === "visio" ? rdv.lieu : null) : source?.type === "visio" ? source.lieu : null;
  const [lien, setLien] = useState(estLien(lienRepris) ? lienRepris : "");
  const repris = rdv ?? source;
  const [lieuLibre, setLieuLibre] = useState(repris && (repris.type === "tache" || repris.type === "perso") ? (repris.lieu ?? "") : "");

  const [etat, envoyer, enCours] = useActionState(edition ? modifierRdv : planifierRdv, null);

  // L'horloge avance : ce qui devient passé se grise.
  useEffect(() => {
    const t = window.setInterval(() => setMaintenant(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const { jour: aujourdhui, minutes: minutesMaintenant } = horloge(maintenant);

  const visite = type === "phys" || type === "visio";
  const commercial = commerciaux.find((c) => c.id === commercialId) ?? commerciaux[0];
  const prenom = commercial?.nom.split(" ")[0] ?? "";
  const choixVisible = !!choix && semaine.jours.includes(choix.jour);
  // Le rendez-vous modifié ne se gêne pas lui-même : il quitte la semaine montrée, son créneau actuel est marqué à part.
  const evenements = useMemo(() => (rdv ? semaine.evenements.filter((e) => e.id !== rdv.id) : semaine.evenements), [semaine, rdv]);
  // Rien ne bouge dans le planning (même créneau, même durée, même personne, même type) : rien à vérifier.
  const creneauInchange =
    !!rdv && !!choix && choix.jour === rdv.jour && (journee || choix.min === rdv.min) && journee === rdv.journee && (journee || duree === rdv.duree) && commercialId === rdv.commercialId && type === rdv.type;
  const verif = useMemo(
    () =>
      choix && choixVisible && !creneauInchange
        ? verifierCreneau({
            type, jour: choix.jour, debutMin: choix.min, duree, journee, evenements, creneaux: semaine.creneaux,
            dossierId: dossier?.id ?? null, commercial: commercial?.nom ?? "", maintenant, debut: instantParis(choix.jour, hhmm(choix.min)).getTime(),
          })
        : null,
    [choix, choixVisible, creneauInchange, type, duree, journee, evenements, semaine, dossier, commercial, maintenant],
  );

  /** Relit la semaine du commercial (et ses créneaux libres) ; l'adresse de la page suit, pour un rechargement (pas en modification). */
  function recharger(p: { commercialId?: number; lundi?: string; type?: TypeRdv; duree?: number }) {
    const c = p.commercialId ?? commercialId;
    const l = p.lundi ?? semaine.lundi;
    demarrer(async () => {
      const r = await chargerSemaine(c, l, dossier?.id ?? null, p.type ?? type, p.duree ?? duree, rdv?.id ?? null);
      if (r) setSemaine(r);
    });
    if (!edition && (p.commercialId || p.lundi)) {
      const u = new URL(window.location.href);
      u.searchParams.set("com", String(c));
      u.searchParams.set("semaine", l);
      window.history.replaceState(null, "", u.toString());
    }
  }

  function changerType(t: TypeRdv) {
    if (t === type) return;
    setType(t);
    // Le titre et la durée proposés suivent le type, tant qu'ils n'ont pas été changés à la main
    // (une tâche n'a pas de titre d'office ; une visio reprise d'une heure passe à 1 h 30 sur place).
    const appel = dossier?.appel ?? null;
    if (!titreTouche || titre === titreParDefaut(type, appel)) setTitre(titreParDefaut(t, appel));
    const d = dureeTouchee && duree !== dureeParDefaut(type) ? duree : dureeParDefaut(t);
    setDuree(d);
    recharger({ type: t, duree: d });
  }

  function changerDuree(d: number) {
    if (!Number.isFinite(d) || d < 15 || d > 720) return;
    setDuree(d);
    setDureeTouchee(true);
    recharger({ duree: d });
  }

  function choisirEtape(id: number) {
    const e = etapes.find((x) => x.id === id);
    if (!e) return;
    setEtapeId(id);
    setAdresse(e.adresse ?? "");
    setEtage(e.etage ?? "");
    setAscenseur(e.ascenseur);
    setAcces(e.acces ?? "");
  }

  function choisirLibre(l: { jour: string; heure: string }) {
    setChoix({ jour: l.jour, min: minutes(l.heure) });
    if (lundiDuJour(l.jour) !== semaine.lundi) recharger({ lundi: lundiDuJour(l.jour) });
  }

  const date = choix?.jour ?? "";
  const heureChoisie = choix ? hhmm(choix.min) : "";

  // En modification : ce qui a changé depuis l'ouverture. Le bouton n'enregistre que s'il y a quelque chose à enregistrer.
  const lieuSaisi = type === "phys" ? adresse.trim() : type === "visio" ? lien.trim() : lieuLibre.trim();
  const empreinte = JSON.stringify([type, commercialId, choix?.jour, journee ? 0 : choix?.min, journee, journee ? 0 : duree, titre.trim(), notes.trim(), lieuSaisi, type === "phys" ? [etapeId, etage, ascenseur, acces] : null]);
  const [empreinteDepart] = useState(empreinte);
  const modifie = edition && empreinte !== empreinteDepart;
  const nouveauDebut = choix ? instantParis(choix.jour, journee ? "12:00" : hhmm(choix.min)) : null;
  const deplace = !!rdv && !!nouveauDebut && nouveauDebut.getTime() !== new Date(rdv.debut).getTime();
  const quandCourt = (jour: string, min: number, j: boolean) => (j ? `${jourCourt(jour)} · journée` : `${jourCourt(jour)} · ${hFr(min)}`);
  const changements = rdv
    ? [
        deplace && choix && { cle: "quand", libelle: "Créneau", avant: quandCourt(rdv.jour, rdv.min, rdv.journee), apres: quandCourt(choix.jour, choix.min, journee) },
        commercialId !== rdv.commercialId && { cle: "qui", libelle: "Qui", avant: rdv.commercial, apres: commercial?.nom ?? "—" },
        type !== rdv.type && { cle: "type", libelle: "Type", avant: TYPES_RDV[rdv.type].court, apres: TYPES_RDV[type].court },
        !journee && !rdv.journee && duree !== rdv.duree && { cle: "duree", libelle: "Durée", avant: dureeFr(rdv.duree), apres: dureeFr(duree) },
      ].filter((x): x is { cle: string; libelle: string; avant: string; apres: string } => !!x)
    : [];
  // Une visite d'un dossier, déplacée à l'heure : sa confirmation repart de zéro, et le client peut être prévenu.
  const smsPossible = !!rdv?.confirmation && deplace && visite && !journee;

  const pret = !!choix && !!titre.trim() && !verif?.bloquant && !chargement && (!edition || modifie);
  const libelleBouton = edition
    ? modifie
      ? "Enregistrer les modifications"
      : "Aucune modification"
    : type === "phys"
      ? "Planifier la visite"
      : type === "visio"
        ? "Planifier la visio"
        : type === "tache"
          ? "Ajouter la tâche"
          : "Ajouter au planning";
  const retour =
    dossier && retourVers !== "planning"
      ? { label: "Retour au dossier", href: `/dossiers/${dossier.id}${edition ? "#demenagements-visites" : ""}` }
      : rdv
        ? { label: "Retour au planning", href: `/planning?semaine=${lundiDuJour(rdv.jour)}&com=${rdv.commercialId}` }
        : { label: "Retour au planning", href: `/planning?semaine=${semaine.lundi}&com=${commercialId}` };
  const depart = dossier?.etapes.find((e) => e.genre === "depart")?.adresse;
  const arrivee = [...(dossier?.etapes ?? [])].reverse().find((e) => e.genre === "arrivee")?.adresse;
  const proposer =
    dossier && visite && dossier.espace && !edition
      ? `/dossiers/${dossier.id}?vc=${commercialId}&vd=${[60, 90, 120].includes(duree) ? duree : 60}&vt=${type}#visite`
      : null;
  const fin = semaine.jours[semaine.jours.length - 1] ?? semaine.lundi;
  const quandTexte = choix
    ? journee
      ? `${maj(jourVisite(`${choix.jour}T12:00:00Z`))} · journée entière`
      : `${maj(jourVisite(`${choix.jour}T12:00:00Z`))} · ${hFr(choix.min)} – ${hFr(choix.min + duree)}`
    : null;
  // Les autres visites à venir du dossier (pas celle que l'on modifie).
  const autresAVenir = dossier?.aVenir.filter((r) => r.id !== rdv?.id) ?? [];
  const titrePage = rdv
    ? rdv.type === "phys"
      ? "Modifier la visite"
      : rdv.type === "visio"
        ? "Modifier la visio"
        : "Modifier le rendez-vous"
    : dossier
      ? source
        ? "Nouvelle visite"
        : "Planifier une visite"
      : "Nouveau rendez-vous";

  return (
    <div className={`view ${s.page}`}>
      <Bandeau
        surtitre={dossier ? `Planning · ${source ? "Nouvelle visite" : "Visite technique"}` : "Planning commercial"}
        titre={titrePage}
        texte={
          dossier
            ? [dossier.client, dossier.ref, depart || arrivee ? `${depart ?? "—"} → ${arrivee ?? "—"}` : null].filter(Boolean).join(" · ")
            : rdv
              ? `${TYPES_RDV[rdv.type].long} · ${rdv.titre}`
              : "Visite, visio, tâche ou règle perso : chacune a sa couleur au planning."
        }
        etiquettes={[dossier?.segment]}
        secondaire={retour}
      />

      <form action={envoyer} className={s.mise}>
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="commercial_id" value={commercialId} />
        <input type="hidden" name="dossier_id" value={dossier?.id ?? ""} />
        <input type="hidden" name="depuis_id" value={source?.id ?? ""} />
        <input type="hidden" name="duree_min" value={duree} />
        {rdv && <input type="hidden" name="rdv_id" value={rdv.id} />}
        {rdv && <input type="hidden" name="retour" value={retourVers ?? ""} />}
        {type === "phys" && etape && <input type="hidden" name="etape_id" value={etape.id} />}

        {/* ─── À gauche : quoi, où, pour qui ─── */}
        <div className={s.gauche}>
          {/* En modification : le rendez-vous tel qu'il est au planning, et ses gestes (effectuée, annuler). */}
          {rdv && <VisiteActuelle rdv={rdv} retour={retourVers} maintenant={maintenant} />}

          {!dossier && !edition && (
            <section className={s.carte}>
              <label className={s.etiquette} htmlFor="planif-dossier">
                Dossier lié <small>facultatif</small>
              </label>
              <select
                id="planif-dossier"
                defaultValue=""
                onChange={(e) => e.target.value && router.push(`/planning/nouveau?dossier=${e.target.value}&com=${commercialId}&semaine=${semaine.lundi}`)}
              >
                <option value="">— Aucun —</option>
                {dossiers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.libelle}
                  </option>
                ))}
              </select>
            </section>
          )}

          {dossier && (source || autresAVenir.length > 0 || (dossier.proposition && !edition)) && (
            <div className={s.avis}>
              {source && (
                <p className={s.avisInfo}>
                  <Ic n="link" />
                  <span>
                    À partir de {source.type === "visio" ? "la visio" : source.type === "phys" ? "la visite" : "du rendez-vous"} du {jourVisite(source.debut)} : type, lieu et
                    observations sont repris. <Link href={`/planning/nouveau?dossier=${dossier.id}`}>Repartir de zéro</Link>
                  </span>
                </p>
              )}
              {autresAVenir.map((r) => (
                <p key={r.id} className={s.avisAttention}>
                  <Ic n="alert" />
                  <span>
                    {edition ? "Autre visite au planning" : "Déjà au planning"} : {r.type === "visio" ? "visio" : "visite sur place"} le {momentVisite(r.debut)} avec {r.commercial}.
                  </span>
                </p>
              ))}
              {dossier.proposition && !edition && (
                <p className={s.avisInfo}>
                  <Ic n="bell" />
                  <span>
                    {dossier.proposition.creneaux} créneau{dossier.proposition.creneaux > 1 ? "x" : ""} proposé{dossier.proposition.creneaux > 1 ? "s" : ""} au client
                    attend{dossier.proposition.creneaux > 1 ? "ent" : ""} sa réponse dans son espace : planifier ici retire cette proposition.
                  </span>
                </p>
              )}
            </div>
          )}

          {/* Qui fait la visite : en tête, bien visible (David : « je dois pouvoir facilement changer de personne »). */}
          <section className={s.carte} aria-labelledby="planif-qui">
            <h2 className={s.titreCarte} id="planif-qui">
              <i>1</i>
              {dossier ? "Qui fait la visite ?" : "Pour qui ?"}
            </h2>
            <div className={s.personnes} role="radiogroup" aria-labelledby="planif-qui">
              {commerciaux.map((c) => {
                const initiales = c.nom.split(/\s+/).filter(Boolean).map((m) => m[0]).slice(0, 2).join("").toUpperCase();
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={c.id === commercialId}
                    className={s.personne}
                    onClick={() => {
                      if (c.id === commercialId) return;
                      setCommercialId(c.id);
                      recharger({ commercialId: c.id });
                    }}
                  >
                    <span className={s.avatar} aria-hidden>
                      {initiales}
                    </span>
                    <span className={s.personneNom}>
                      <b>{c.nom}</b>
                      {dossier?.commercialId === c.id && <small>Commercial du dossier</small>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className={s.carte} aria-labelledby="planif-type">
            <h2 className={s.titreCarte} id="planif-type">
              <i>2</i>
              {dossier ? "Sur place ou en visio ?" : "Quel rendez-vous ?"}
            </h2>
            <div className={s.types} role="radiogroup" aria-labelledby="planif-type">
              {(["phys", "visio"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={type === t}
                  className={`${s.carteType} t-${t}`}
                  onClick={() => changerType(t)}
                >
                  <i className={s.carteIcone}>
                    <Ic n={TYPES_RDV[t].icone} />
                  </i>
                  <b>{TYPES_RDV[t].court}</b>
                  <small>{t === "phys" ? "Chez le client" : "À distance"}</small>
                  <span className={s.coche} aria-hidden>
                    <Ic n="check" />
                  </span>
                </button>
              ))}
            </div>
            <div className={s.autres} role="radiogroup" aria-label="Autre rendez-vous">
              <span>Autre :</span>
              {(["tache", "perso"] as const).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={type === t} className={`${s.autre} t-${t}`} onClick={() => changerType(t)}>
                  <i aria-hidden />
                  {TYPES_RDV[t].long}
                </button>
              ))}
            </div>
          </section>

          <section className={s.carte} aria-labelledby="planif-ou">
            <h2 className={s.titreCarte} id="planif-ou">
              <i>3</i>
              {type === "phys" ? "Où a lieu la visite ?" : type === "visio" ? "Joindre le client" : "Où ?"}
            </h2>

            {type === "phys" && (
              <>
                {etapes.filter((e) => e.adresse).length > 1 && (
                  <div className={s.etapes} role="radiogroup" aria-label="Étape du trajet">
                    {etapes
                      .filter((e) => e.adresse)
                      .map((e) => (
                        <button key={e.id} type="button" role="radio" aria-checked={e.id === etapeId} className={s.etape} onClick={() => choisirEtape(e.id)} title={e.adresse ?? ""}>
                          <b>{e.libelle}</b>
                          <span>{e.adresse}</span>
                        </button>
                      ))}
                  </div>
                )}
                <div className={s.champ}>
                  <label htmlFor="planif-adresse">Adresse de la visite</label>
                  <ChampAdresse id="planif-adresse" name="lieu" value={adresse} onChange={setAdresse} placeholder="Numéro, voie, ville" required />
                </div>
                <div className={s.ligneChamps}>
                  <div className={s.champ}>
                    <label htmlFor="planif-etage">Étage</label>
                    <input id="planif-etage" type="text" name="etage" value={etage} onChange={(e) => setEtage(e.target.value)} placeholder="RDC, 3e…" />
                  </div>
                  <label className={s.case}>
                    <input type="checkbox" name="ascenseur" checked={ascenseur} onChange={(e) => setAscenseur(e.target.checked)} />
                    Ascenseur
                  </label>
                </div>
                <div className={s.champ}>
                  <label htmlFor="planif-acces">Accès, code, stationnement</label>
                  <input id="planif-acces" type="text" name="acces" value={acces} onChange={(e) => setAcces(e.target.value)} placeholder="Code 1234B, interphone…" />
                </div>
                {etape && (
                  <p className={s.aide}>
                    Étage et accès sont ceux de l&apos;étape « {etape.libelle} » du dossier : ce que vous saisissez ici y est enregistré.
                  </p>
                )}
              </>
            )}

            {type === "visio" && (
              <>
                {dossier ? (
                  <div className={s.contact}>
                    {dossier.telephone ? (
                      <a href={`tel:${dossier.telephone.replace(/\s/g, "")}`}>
                        <Ic n="tel" />
                        {dossier.telephone}
                      </a>
                    ) : (
                      <span className={s.manque}>
                        <Ic n="alert" />
                        Pas de téléphone sur la fiche : la confirmation par SMS ne pourra pas partir.
                      </span>
                    )}
                    {dossier.email ? (
                      <a href={`mailto:${dossier.email}`}>
                        <Ic n="mail" />
                        {dossier.email}
                      </a>
                    ) : (
                      <span className={s.manque}>
                        <Ic n="mail" />
                        Pas d&apos;e-mail sur la fiche
                      </span>
                    )}
                  </div>
                ) : null}
                <div className={s.champ}>
                  <label htmlFor="planif-lien">
                    Lien de la visio <small>facultatif</small>
                  </label>
                  <input id="planif-lien" type="url" name="lien_visio" value={lien} onChange={(e) => setLien(e.target.value)} placeholder="https://…" />
                </div>
                <p className={s.aide}>La plateforme n&apos;a pas d&apos;outil de visio : collez ici le lien de la réunion si vous en avez un, il figurera sur le rendez-vous.</p>
              </>
            )}

            {(type === "tache" || type === "perso") && (
              <div className={s.champ}>
                <label htmlFor="planif-lieu">
                  {type === "tache" ? "Lieu" : "Précision"} <small>facultatif</small>
                </label>
                {type === "tache" ? (
                  <ChampAdresse id="planif-lieu" name="lieu" value={lieuLibre} onChange={setLieuLibre} placeholder="Adresse, ou « Chez le client »" />
                ) : (
                  <input id="planif-lieu" type="text" name="lieu" value={lieuLibre} onChange={(e) => setLieuLibre(e.target.value)} placeholder="Visios uniquement…" />
                )}
              </div>
            )}
          </section>

          <section className={s.carte} aria-labelledby="planif-pour">
            <h2 className={s.titreCarte} id="planif-pour">
              <i>4</i>
              Pour {prenom || "le commercial"}
            </h2>
            <div className={s.champ}>
              <label htmlFor="planif-titre">Titre au planning</label>
              <input
                id="planif-titre"
                type="text"
                name="titre"
                value={titre}
                onChange={(e) => {
                  setTitre(e.target.value);
                  setTitreTouche(true);
                }}
                placeholder={type === "tache" ? "Livrer 40 cartons, rendez-vous médical…" : type === "perso" ? "Semaine des enfants, journée visio…" : "M. Dupuis"}
                required
              />
            </div>
            <div className={s.champ}>
              <label htmlFor="planif-notes">Observations</label>
              <textarea id="planif-notes" name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ce que le client a dit au téléphone, ce qu'il faut voir…" rows={4} />
            </div>
            {dossier?.observations && (
              <div className={s.observations}>
                <small>Observations du dossier</small>
                <p>{dossier.observations}</p>
              </div>
            )}
          </section>
        </div>

        {/* ─── À droite : le créneau ─── */}
        <div className={s.droite}>
          <section className={`${s.recap} t-${type}`} aria-live="polite">
            <div className={s.recapTete}>
              <i className={s.recapIcone}>
                <Ic n={TYPES_RDV[type].icone} />
              </i>
              <div className={s.recapTexte}>
                {edition && <small className={s.recapSurtitre}>{modifie ? "Après modification" : "Le rendez-vous"}</small>}
                {quandTexte ? <b>{quandTexte}</b> : <b className={s.recapVide}>Choisissez un créneau dans la semaine de {prenom}</b>}
                <span>
                  {TYPES_RDV[type].long} avec {commercial?.nom ?? "—"}
                  {type === "phys" && adresse ? ` · ${adresse}` : ""}
                  {choix && !choixVisible && (
                    <>
                      {" · "}
                      <button type="button" className={s.lienBouton} onClick={() => recharger({ lundi: lundiDuJour(choix.jour) })}>
                        revoir cette semaine
                      </button>
                    </>
                  )}
                </span>
              </div>
              <div className={s.recapActions}>
                <button type="submit" className={s.valider} disabled={!pret || enCours}>
                  {enCours ? "Enregistrement…" : libelleBouton}
                  <Ic n="right" />
                </button>
                {proposer && (
                  <Link href={proposer} className={s.proposer}>
                    ou proposer des créneaux au client
                  </Link>
                )}
                {edition && !modifie && <span className={s.recapAide}>Changez la personne, le type ou le créneau : un clic chacun.</span>}
              </div>
            </div>

            {/* Ce qui change : l'ancien barré, le nouveau à côté. */}
            {changements.length > 0 && (
              <ul className={s.changements} aria-label="Ce qui change">
                {changements.map((c) => (
                  <li key={c.cle}>
                    <small>{c.libelle}</small>
                    <s>{c.avant}</s>
                    <Ic n="right" />
                    <b>{c.apres}</b>
                  </li>
                ))}
              </ul>
            )}

            <div className={s.recapChamps}>
              <label className={s.mini}>
                <span>Jour</span>
                <input
                  type="date"
                  name="date"
                  value={date}
                  // Un rendez-vous passé se modifie (ses observations) sans être déplacé : son jour reste admis.
                  min={rdv && rdv.jour < aujourdhui ? rdv.jour : aujourdhui}
                  required
                  onChange={(e) => {
                    const j = e.target.value;
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(j)) return;
                    setChoix({ jour: j, min: choix?.min ?? 9 * 60 });
                    if (lundiDuJour(j) !== semaine.lundi) recharger({ lundi: lundiDuJour(j) });
                  }}
                />
              </label>
              {!journee && (
                <label className={s.mini}>
                  <span>Heure</span>
                  <input
                    type="time"
                    name="heure"
                    step={900}
                    value={heureChoisie}
                    required
                    onChange={(e) => {
                      if (!/^\d{2}:\d{2}$/.test(e.target.value)) return;
                      setChoix({ jour: choix?.jour ?? semaine.jours[0], min: minutes(e.target.value) });
                    }}
                  />
                </label>
              )}
              {!journee && (
                <div className={s.durees} role="radiogroup" aria-label="Durée">
                  <span>Durée</span>
                  {DUREES.map((d) => (
                    <button key={d} type="button" role="radio" aria-checked={duree === d} className={s.duree} onClick={() => changerDuree(d)}>
                      {dureeFr(d)}
                    </button>
                  ))}
                  {!DUREES.includes(duree) && (
                    <button type="button" role="radio" aria-checked className={s.duree}>
                      {dureeFr(duree)}
                    </button>
                  )}
                </div>
              )}
              {!dossier && (
                <label className={s.caseJournee}>
                  <input
                    type="checkbox"
                    name="journee"
                    checked={journee}
                    onChange={(e) => {
                      setJournee(e.target.checked);
                      if (choix) setChoix({ jour: choix.jour, min: 12 * 60 });
                    }}
                  />
                  Toute la journée <small>(« journée visio »…)</small>
                </label>
              )}
            </div>

            {(verif?.alertes.length || etat?.erreur) && (
              <ul className={s.alertes}>
                {etat?.erreur && (
                  <li data-ton="ko">
                    <Ic n="alert" />
                    <span>{etat.erreur}</span>
                  </li>
                )}
                {verif?.alertes.map((a, i) => (
                  <li key={i} data-ton={a.ton}>
                    <Ic n={a.ton === "info" ? "check" : "alert"} />
                    <span>{a.texte}</span>
                    {a.passerEnVisio && type === "phys" && (
                      <button type="button" onClick={() => changerType("visio")}>
                        Passer en visio
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* Une visite déplacée : sa confirmation repart de zéro, et le client peut être prévenu (case non cochée). */}
            {rdv && smsPossible && nouveauDebut && (type === "phys" || type === "visio") && (
              <PrevenirClient rdv={rdv} debut={nouveauDebut} commercial={commercial?.nom ?? rdv.commercial} type={type} coche={prevenir} cocher={setPrevenir} />
            )}
          </section>

          <section className={s.semaine} aria-label={`Semaine de ${commercial?.nom ?? "—"}`}>
            <div className={s.outils}>
              <div className={s.nav}>
                <button type="button" className={s.fleche} aria-label="Semaine précédente" onClick={() => recharger({ lundi: decaler(semaine.lundi, -7) })}>
                  <Ic n="left" />
                </button>
                <button type="button" className={s.aujourdhui} onClick={() => recharger({ lundi: lundiDuJour(aujourdhui) })}>
                  Aujourd&apos;hui
                </button>
                <button type="button" className={s.fleche} aria-label="Semaine suivante" onClick={() => recharger({ lundi: decaler(semaine.lundi, 7) })}>
                  <Ic n="right" />
                </button>
                <span className={s.periode}>
                  <b>{commercial?.nom}</b>
                  <small>
                    Du {jourCourt(semaine.lundi)} au {jourCourt(fin)}
                    {chargement ? " · chargement…" : ""}
                  </small>
                </span>
              </div>
              {visite && !journee && semaine.libres.length > 0 && (
                <div className={s.libres}>
                  <span>Premiers créneaux libres</span>
                  {semaine.libres.map((l) => (
                    <button
                      key={l.debut}
                      type="button"
                      className={s.libre}
                      aria-pressed={choix?.jour === l.jour && choix.min === minutes(l.heure)}
                      onClick={() => choisirLibre(l)}
                    >
                      {jourCourt(l.jour)} · {hFr(minutes(l.heure))}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <SemaineChoix
              jours={semaine.jours}
              aujourdhui={aujourdhui}
              minutesMaintenant={minutesMaintenant}
              evenements={evenements}
              creneaux={semaine.creneaux}
              dossierId={dossier?.id ?? null}
              type={type}
              duree={duree}
              journee={journee}
              choix={choix}
              // Le créneau actuel, dans la semaine de la personne qui l'a aujourd'hui.
              actuel={rdv && !rdv.journee && commercialId === rdv.commercialId ? { jour: rdv.jour, min: rdv.min, duree: rdv.duree } : null}
              edition={edition}
              conflit={!!verif?.bloquant}
              onChoisir={setChoix}
              chargement={chargement}
            />
            <LegendePlanning className={s.legende} />
          </section>
        </div>
      </form>
      {apres}
    </div>
  );
}

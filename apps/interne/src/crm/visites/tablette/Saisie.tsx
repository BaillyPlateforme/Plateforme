"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Picto, type NomPicto } from "@/terrain/composants/Picto";
import { nouvelleCle } from "@/terrain/composants/photo-navigateur";
import { CATALOGUE_TABLETTE, FAMILLES, famillesPourLaPiece, genreDePiece, referenceDuLibelle, type ReferenceFrequente } from "@/lib/visite/catalogue";
import {
  DESTINATIONS_SPECIALES, bilanVolumes, choixDe, destinationParDefaut, estTransporte, patchDuChoix, volumesParDestination,
  type ChoixDestination, type Destination,
} from "@/lib/visite/destinations";
import { objetsConnus, rechercherObjets, type ObjetConnu } from "@/lib/visite/objets";
import {
  ACCES_ESCALIER, ACCES_MONTE_MEUBLE, ACCES_POIDS_LOURD, ACCES_STATIONNEMENT, FORMULES, GENRE_ETAPE, PLAFONDS, PLAFONDS_ACCES,
  m3, m3Fin, plageVisite, jourVisite,
  type CleFormule, type EtapeAcces, type ObjetSaisi, type PieceSaisie,
} from "@/lib/visite/regles";
import type { EtatSaisie } from "./etat";
import { nomLibre, opsDupliquerLigne, opsDupliquerPiece, opsRepartir } from "./gestes";
import { noterUtilisateur, oublierVuesGardees } from "./hors-ligne";
import { informationsManquantes, type GroupeManques, type VueManque } from "./manques";
import { useEnregistrement, type NonEnregistree, type Statut } from "./useEnregistrement";
import { usePhotos, type PhotoTablette } from "./usePhotos";
import { urlPhotoVisite } from "./etat";
import s from "./tablette.module.css";

/*
 * La saisie de la visite, sur la tablette : à gauche les pièces (et les
 * accès, les destinations, les options), à droite la pièce ouverte — son
 * métré, ses photos, sa remarque. En portrait, les pièces passent en bandeau
 * au-dessus.
 *
 * Tout se tape au doigt : les meubles s'ajoutent d'une touche depuis le
 * catalogue de la tablette (celui de Dragan, volumes indicatifs), ou
 * en tapant le début de leur nom, un synonyme ou leur nom anglais ; la
 * quantité se règle au pas ou au clavier, le volume unitaire reste
 * modifiable. Le volume se recalcule à chaque geste ; le serveur le
 * recalcule aussi, et c'est lui qui le garde.
 *
 * La synthèse de Dragan (18/11/2026) : la destination sur chaque ligne,
 * toujours (adresses du trajet, garde-meuble, à laisser sur place, débarras,
 * pris en charge par le client, à confirmer) ; le volume transporté distingué
 * de ce qui ne l'est pas ; répartir les exemplaires d'une ligne entre des
 * destinations ; dupliquer une ligne ou une pièce ; une note par objet ; les
 * références les plus utilisées de l'équipe ; la liste des informations
 * manquantes avant le compte-rendu ; « Français / English » sur chaque ligne
 * du catalogue.
 *
 * Sans réseau, la saisie continue : tout est gardé sur la tablette et part
 * de soi-même au retour du réseau (useEnregistrement, usePhotos). Le
 * compte-rendu et la signature du client, eux, demandent le réseau.
 */

export interface ProprietesSaisie {
  visiteId: number;
  initiale: EtatSaisie;
  volumeInitial: number;
  /** L'heure du serveur à la lecture de la page (null : rouverte depuis la tablette, sans réseau). */
  majLe: string | null;
  utilisateur: number | null;
  dossier: { ref: string; client: string; contact: string | null; telephone: string | null; adresse: string | null };
  rdv: { debut: string; duree_min: number; type: string } | null;
  commercial: string | null;
  photos: { id: number; cle: string; piece: string | null; vignette: boolean }[];
  /** Les libellés déjà saisis par l'équipe dans d'autres dossiers, pour la saisie automatique. */
  historique: { label: string; volume: number }[];
  /** Les références les plus utilisées par l'équipe, par genre de pièce. */
  frequents: ReferenceFrequente[];
  /** Les destinations du dossier (étapes du trajet hors départ). */
  destinations: Destination[];
}

/** Ce que la tablette garde avec la vue de la saisie, pour la rouvrir sans réseau. */
export type EnteteSaisie = Pick<ProprietesSaisie, "volumeInitial" | "dossier" | "rdv" | "commercial" | "photos" | "historique" | "destinations"> & {
  /** Absent d'une vue gardée avant le 18/11/2026. */
  frequents?: ReferenceFrequente[];
};

type Vue = { genre: "piece"; cle: string } | { genre: "acces" } | { genre: "destinations" } | { genre: "options" };
type Agir = ReturnType<typeof useEnregistrement>["agir"];
/** Ce qu'on ajoute à une pièce : une référence du catalogue, une suggestion, un objet tapé. */
type Ajout = { label: string; volume: number; en?: string | null; horsCubage?: boolean };

const PIECES_COURANTES = ["Entrée", "Salon", "Salle à manger", "Cuisine", "Chambre", "Chambre d'enfant", "Salle de bain", "Bureau", "Buanderie", "Cave", "Garage", "Grenier", "Balcon", "Jardin"];

const nombre = (v: string) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

/**
 * La destination d'une pièce : celle qu'on lui a donnée (une étape ou une
 * destination hors adresse) ; sinon celle de tous ses objets s'ils vont au
 * même endroit ; sinon la destination par défaut (la première arrivée).
 */
function choixDeLaPiece(piece: PieceSaisie, objets: ObjetSaisi[], destinations: Destination[]): ChoixDestination | null {
  const propre = choixDe(piece, destinations);
  if (propre) return propre;
  const leurs = new Set(objets.map((o) => choixDe(o, destinations)));
  const seul = leurs.size === 1 ? [...leurs][0] : null;
  if (seul) return seul;
  const d = destinationParDefaut(destinations);
  return d != null ? `e${d}` : null;
}

/** Ce que porte un objet nouveau, ou une pièce, pour un choix du menu (rien : sans destination). */
const destinationDuChoix = (c: ChoixDestination | null, d: Destination[]) => {
  const p = c ? patchDuChoix(c, d) : null;
  return { destination: p?.destination ?? null, speciale: p?.speciale ?? null };
};

/** Le volume d'un article du catalogue, tel qu'on le lit : « 0,2 m³ », « à mesurer », « non compté ». */
const volumeLu = (a: { volume: number; aMesurer?: boolean; horsCubage?: boolean }) => (a.horsCubage ? "non compté" : a.aMesurer && !a.volume ? "à mesurer" : m3Fin(a.volume));

/** L'anglais du catalogue est-il signalé « à relire » pour ce libellé ? */
const enARelire = (libelle: string, en: string | null | undefined) => {
  const r = referenceDuLibelle(libelle);
  return !!en && !!r?.enARelire && r.en === en;
};

export default function Saisie(p: ProprietesSaisie) {
  const router = useRouter();
  const entete: EnteteSaisie = {
    volumeInitial: p.volumeInitial, dossier: p.dossier, rdv: p.rdv, commercial: p.commercial, photos: p.photos, historique: p.historique,
    destinations: p.destinations, frequents: p.frequents,
  };
  const { etat, agir, statut, enAttente, dernier, volumeServeur, enLigne, vider, nonEnregistrees, oublierNonEnregistrees, origine } = useEnregistrement(
    p.visiteId, p.initiale, p.volumeInitial, { majLe: p.majLe, utilisateur: p.utilisateur, entete },
  );
  const ph = usePhotos(p.visiteId, p.photos, vider);
  const [choisie, setVue] = useState<Vue>(() => (p.initiale.pieces[0] ? { genre: "piece", cle: p.initiale.pieces[0].cle } : { genre: "acces" }));
  const [ajoutPiece, setAjoutPiece] = useState(p.initiale.pieces.length === 0);
  const [depart, setDepart] = useState<string | null>(null);
  const [manques, setManques] = useState<GroupeManques[] | null>(null);
  const connus = useMemo(() => objetsConnus(CATALOGUE_TABLETTE, p.historique, etat.objets), [p.historique, etat.objets]);

  // Le volume transporté (celui du dossier, que le serveur garde), et ce qui ne l'est pas.
  const bilan = bilanVolumes(etat.objets);
  const horsConnexion = !enLigne || statut === "hors_ligne";
  // Une pièce retirée (ici ou par la reprise) : la vue revient à la première pièce.
  const existe = choisie.genre !== "piece" || etat.pieces.some((x) => x.cle === choisie.cle);
  const vue: Vue = existe ? choisie : etat.pieces[0] ? { genre: "piece", cle: etat.pieces[0].cle } : { genre: "acces" };
  const piece = vue.genre === "piece" ? etat.pieces.find((x) => x.cle === vue.cle) ?? null : null;

  // Ouverte avec du réseau : la tablette note qui la tient, oublie les vues trop anciennes ou d'un autre compte, et
  // (en production) installe son service worker, qui garde la page de secours pour rouvrir la visite sans réseau.
  const secours = p.majLe == null;
  useEffect(() => {
    if (secours) return;
    noterUtilisateur(p.utilisateur);
    oublierVuesGardees(p.utilisateur);
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/tablette/sw.js", { scope: "/tablette", updateViaCache: "none" })
      .then((r) => r.active?.postMessage("rafraichir"))
      .catch(() => undefined);
  }, [secours, p.utilisateur]);

  // Signée ailleurs entre-temps : la page du compte-rendu le montre — après la liste de ce qui n'a pas pu entrer, s'il y en a.
  useEffect(() => {
    if (statut === "signee" && nonEnregistrees.length === 0) router.replace(`/tablette/${p.visiteId}/signature`);
  }, [statut, nonEnregistrees.length, router, p.visiteId]);

  function creerPiece(base: string) {
    const nom = nomLibre(base.trim().slice(0, PLAFONDS.nom) || "Pièce", etat.pieces);
    const cle = nouvelleCle();
    const ordre = (etat.pieces.at(-1)?.ordre ?? 0) + 1;
    agir({ t: "piece", cle, nom, ordre, remarque: null });
    setVue({ genre: "piece", cle });
    setAjoutPiece(false);
  }

  /** Dupliquer une pièce : la copie (« Chambre 2 ») et ses objets, juste après ; ni ses photos ni sa remarque. */
  function dupliquerPiece(x: PieceSaisie) {
    const { cle, ops } = opsDupliquerPiece(x, etat.pieces, etat.objets, p.destinations, nouvelleCle);
    for (const op of ops) agir(op);
    setVue({ genre: "piece", cle });
  }

  /** Le compte-rendu : d'abord la liste des informations manquantes, s'il y en a (jamais bloquante). */
  function versCompteRendu() {
    const m = informationsManquantes(etat, p.destinations, nbPhotos);
    if (m.length) setManques(m);
    else void allerAuCompteRendu();
  }

  async function allerAuCompteRendu() {
    setManques(null);
    if (horsConnexion) {
      setDepart("Hors connexion : le compte-rendu et la signature du client demandent le réseau. La saisie reste gardée sur la tablette ; ouvrez le compte-rendu au retour du réseau.");
      return;
    }
    setDepart("Enregistrement de la saisie…");
    if (ph.enCours) {
      setDepart(`${pluriel(ph.enAttente, "photo")} ${ph.enAttente > 1 ? "partent" : "part"} encore : un instant.`);
      void ph.pousser();
      return;
    }
    const ok = await vider();
    if (!ok) {
      setDepart(`${enAttente || "Des"} modification${enAttente > 1 ? "s" : ""} pas encore enregistrée${enAttente > 1 ? "s" : ""} : vérifiez la connexion, puis réessayez.`);
      return;
    }
    router.push(`/tablette/${p.visiteId}/signature`);
  }

  function ouvrirManque(v: VueManque) {
    setManques(null);
    if (v.genre === "nouvelle-piece") setAjoutPiece(true);
    else setVue(v);
  }

  const nbPhotos = (cle: string) => ph.photos.filter((x) => x.piece === cle).length;

  return (
    <div className={s.saisie}>
      <header className={s.barre}>
        <Link
          href="/tablette"
          className={s.retour}
          aria-label="Retour aux visites"
          onClick={(e) => {
            // La liste des visites vient du serveur : sans réseau, seule la page de secours du service worker (qui liste
            // les visites gardées) s'ouvre, par un vrai chargement de page. Sans lui, on reste sur la visite.
            if (!horsConnexion) return;
            e.preventDefault();
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- un vrai chargement : le service worker sert la page de secours
            if (navigator.serviceWorker?.controller) window.location.assign("/tablette");
            else setDepart("Hors connexion : la liste des visites demande le réseau. Restez sur cette visite : ce que vous saisissez est gardé sur la tablette.");
          }}
        >
          <Picto nom="retour" taille={22} />
        </Link>
        <div className={s.barreTitre}>
          <b>{p.dossier.client}</b>
          <span>
            {p.dossier.ref}
            {p.rdv ? ` · ${jourVisite(p.rdv.debut)}, ${plageVisite(p.rdv.debut, p.rdv.duree_min)}` : ""}
            {p.dossier.adresse ? ` · ${p.dossier.adresse}` : ""}
          </span>
        </div>
        <EtatConnexion statut={statut} enAttente={enAttente} dernier={dernier} enLigne={enLigne} />
        <div className={s.volumeTotal} aria-live="polite">
          <small>Transporté</small>
          <b>{m3(bilan.transporte)}</b>
          {Math.abs(bilan.transporte - volumeServeur) > 0.005 && statut === "enregistre" ? (
            <em>serveur : {m3(volumeServeur)}</em>
          ) : bilan.nonTransporte > 0 ? (
            <em>+ {m3(bilan.nonTransporte)} non transporté</em>
          ) : null}
        </div>
        <button type="button" className={s.boutonCr} onClick={versCompteRendu} aria-disabled={horsConnexion}>
          <Picto nom="plume" taille={20} />
          Compte-rendu
        </button>
      </header>
      <div className={s.bandeaux}>
        <BandeauReseau statut={statut} horsConnexion={horsConnexion} enAttente={enAttente} photos={ph.enAttente} origine={origine} secours={secours} />
        {nonEnregistrees.length > 0 && (
          <NonEnregistrees liste={nonEnregistrees} signee={statut === "signee"} oublier={oublierNonEnregistrees} versCompteRendu={() => router.replace(`/tablette/${p.visiteId}/signature`)} />
        )}
        {depart && (
          <p className={s.bandeauInfo} role="status">
            {depart}
            <button type="button" onClick={() => setDepart(null)} aria-label="Fermer">
              <Picto nom="croix" taille={18} />
            </button>
          </p>
        )}
      </div>

      <div className={s.corps}>
        <nav className={s.rail} aria-label="Pièces et rubriques">
          <p className={s.railTitre}>
            Pièces <span>{etat.pieces.length}</span>
          </p>
          <ul className={s.railListe}>
            {etat.pieces.map((x) => {
              const objets = etat.objets.filter((o) => o.piece === x.cle);
              const b = bilanVolumes(objets);
              const actif = vue.genre === "piece" && vue.cle === x.cle;
              return (
                <li key={x.cle}>
                  <button type="button" className={`${s.railPiece} ${actif ? s.actif : ""}`} onClick={() => setVue({ genre: "piece", cle: x.cle })} aria-current={actif}>
                    <span className={s.railNom}>{x.nom}</span>
                    <span className={s.railDetail}>
                      {objets.reduce((n, o) => n + o.quantite, 0)} obj. · {nbPhotos(x.cle)} photo{nbPhotos(x.cle) > 1 ? "s" : ""}
                      {b.nonTransporte > 0 ? ` · ${m3(b.nonTransporte)} non transp.` : ""}
                    </span>
                    <span className={s.railVolume}>{m3(b.transporte)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {ajoutPiece ? (
            <div className={s.ajoutPiece}>
              <p>Ajouter une pièce</p>
              <div className={s.puces}>
                {PIECES_COURANTES.map((nom) => (
                  <button key={nom} type="button" className={s.puce} onClick={() => creerPiece(nom)}>
                    {nom}
                  </button>
                ))}
              </div>
              <form
                className={s.ajoutLibre}
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = String(new FormData(e.currentTarget).get("nom") ?? "").trim();
                  if (v) creerPiece(v);
                }}
              >
                <input name="nom" placeholder="Autre pièce…" maxLength={PLAFONDS.nom} aria-label="Nom de la pièce" />
                <button type="submit" aria-label="Ajouter la pièce">
                  <Picto nom="plus" taille={20} />
                </button>
              </form>
              {etat.pieces.length > 0 && (
                <button type="button" className={s.lienDoux} onClick={() => setAjoutPiece(false)}>
                  Fermer
                </button>
              )}
            </div>
          ) : (
            <button type="button" className={s.boutonAjoutPiece} onClick={() => setAjoutPiece(true)}>
              <Picto nom="plus" taille={20} /> Ajouter une pièce
            </button>
          )}
          <div className={s.railSep} />
          <button type="button" className={`${s.railRubrique} ${vue.genre === "acces" ? s.actif : ""}`} onClick={() => setVue({ genre: "acces" })}>
            <Picto nom="escalier" taille={20} />
            <span>Accès</span>
            <small>{etat.etapes.length} adresse{etat.etapes.length > 1 ? "s" : ""}</small>
          </button>
          <button type="button" className={`${s.railRubrique} ${vue.genre === "destinations" ? s.actif : ""}`} onClick={() => setVue({ genre: "destinations" })}>
            <Picto nom="camion" taille={20} />
            <span>Destinations</span>
            <small>
              {m3(bilan.transporte)} transportés{bilan.nonTransporte > 0 ? ` · ${m3(bilan.nonTransporte)} non transportés` : ""}
            </small>
          </button>
          <button type="button" className={`${s.railRubrique} ${vue.genre === "options" ? s.actif : ""}`} onClick={() => setVue({ genre: "options" })}>
            <Picto nom="options" taille={20} />
            <span>Options et remarques</span>
            <small>{etat.options.filter((o) => o.proposee).length} proposée{etat.options.filter((o) => o.proposee).length > 1 ? "s" : ""}</small>
          </button>
        </nav>

        <main className={s.panneau}>
          {vue.genre === "piece" && piece ? (
            <PanneauPiece
              key={piece.cle}
              piece={piece}
              objets={etat.objets.filter((o) => o.piece === piece.cle)}
              photos={ph.photos.filter((x) => x.piece === piece.cle)}
              connus={connus}
              frequents={p.frequents}
              destinations={p.destinations}
              agir={agir}
              onPhotos={(f) => ph.ajouter(piece.cle, f)}
              onRenvoyer={ph.renvoyer}
              onRetirerPhoto={ph.retirer}
              onDupliquer={() => dupliquerPiece(piece)}
              onRetirer={() => {
                agir({ t: "piece-", cle: piece.cle });
                ph.oublierPiece(piece.cle);
              }}
            />
          ) : vue.genre === "acces" ? (
            <PanneauAcces etapes={etat.etapes} agir={agir} />
          ) : vue.genre === "destinations" ? (
            <PanneauDestinations etat={etat} destinations={p.destinations} agir={agir} ouvrirPiece={(cle) => setVue({ genre: "piece", cle })} />
          ) : vue.genre === "options" ? (
            <PanneauOptions etat={etat} agir={agir} />
          ) : (
            <div className={s.vide}>
              <Picto nom="maison" taille={34} />
              <b>Commencez par une pièce</b>
              <p>Choisissez-la à gauche : l&apos;entrée, le salon, la cuisine… Chaque pièce a son métré, ses photos et sa remarque.</p>
            </div>
          )}
        </main>
      </div>
      {manques && <FeuilleManques groupes={manques} fermer={() => setManques(null)} ouvrir={ouvrirManque} continuer={() => void allerAuCompteRendu()} />}
    </div>
  );
}

/**
 * Avant le compte-rendu : les informations manquantes (manques.ts). Chacune
 * mène où la compléter ; rien n'est bloquant, le commercial peut continuer.
 */
function FeuilleManques({ groupes, fermer, ouvrir, continuer }: { groupes: GroupeManques[]; fermer: () => void; ouvrir: (v: VueManque) => void; continuer: () => void }) {
  const n = groupes.reduce((k, g) => k + g.manques.length, 0);
  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [fermer]);
  return (
    <div className={s.voile} role="presentation" onClick={(e) => e.target === e.currentTarget && fermer()}>
      <section className={s.feuille} role="dialog" aria-modal="true" aria-labelledby="titre-manques">
        <div className={s.feuilleTete}>
          <i>
            <Picto nom="alerte" taille={22} />
          </i>
          <div>
            <h2 id="titre-manques">Avant le compte-rendu</h2>
            <p>
              {n} information{n > 1 ? "s" : ""} manquante{n > 1 ? "s" : ""}. Complétez-les maintenant, ou continuez : rien n&apos;est bloquant.
            </p>
          </div>
        </div>
        <div className={s.feuilleCorps}>
          {groupes.map((g) => (
            <div key={g.titre} className={s.manques}>
              <h3>{g.titre}</h3>
              <ul>
                {g.manques.map((m, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => ouvrir(m.vue)}>
                      <span>{m.texte}</span>
                      <Picto nom="suite" taille={18} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className={s.feuilleBas}>
          <button type="button" className={s.boutonDoux} onClick={fermer}>
            Compléter la saisie
          </button>
          <button type="button" className={s.boutonPlein} onClick={continuer}>
            Continuer vers le compte-rendu <Picto nom="suite" taille={18} />
          </button>
        </div>
      </section>
    </div>
  );
}

// --- L'état de la connexion ------------------------------------------------------------------------

function EtatConnexion({ statut, enAttente, dernier, enLigne }: { statut: Statut; enAttente: number; dernier: number | null; enLigne: boolean }) {
  const [, battre] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => battre((n) => n + 1), 15_000);
    return () => window.clearInterval(t);
  }, []);
  const heure = dernier ? new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date(dernier)) : null;
  const vue: Record<Statut, { ton: string; icone: NomPicto; texte: string; sous?: string }> = {
    enregistre: { ton: s.ok, icone: "nuage", texte: "Enregistré", sous: heure ? `à ${heure}` : "Tout est au serveur" },
    modifie: { ton: s.neutre, icone: "nuage", texte: "Modifications…", sous: `${enAttente} à envoyer` },
    envoi: { ton: s.neutre, icone: "recharger", texte: "Enregistrement…", sous: `${enAttente} en cours` },
    erreur: { ton: s.alerte, icone: "recharger", texte: "Nouvel essai…", sous: `${enAttente} gardée${enAttente > 1 ? "s" : ""} ici` },
    hors_ligne: { ton: s.alerte, icone: "horsLigne", texte: "Hors connexion", sous: `${enAttente} gardée${enAttente > 1 ? "s" : ""} sur la tablette` },
    session: { ton: s.danger, icone: "alerte", texte: "Session expirée", sous: "Reconnectez-vous : rien n'est perdu" },
    signee: { ton: s.ok, icone: "coche", texte: "Compte-rendu signé" },
  };
  const v = !enLigne && statut !== "session" && statut !== "signee" ? vue.hors_ligne : vue[statut];
  return (
    <div className={`${s.connexion} ${v.ton}`} role="status" aria-live="polite">
      <i className={statut === "envoi" ? s.tourne : undefined}>
        <Picto nom={v.icone} taille={20} />
      </i>
      <span>
        <b>{v.texte}</b>
        {v.sous && <small>{v.sous}</small>}
      </span>
      {statut === "session" && (
        <a href="/login" target="_blank" rel="noopener">
          Se reconnecter
        </a>
      )}
    </div>
  );
}

/**
 * Le bandeau du réseau, sous la barre : sans réseau, ce qui attend sur la
 * tablette et ce qui va se passer ; au retour, la confirmation que tout est
 * parti.
 */
function BandeauReseau({
  statut, horsConnexion, enAttente, photos, origine, secours,
}: {
  statut: Statut;
  horsConnexion: boolean;
  enAttente: number;
  photos: number;
  origine: "serveur" | "tablette";
  /** Rouverte sans réseau par la page de secours, depuis ce que la tablette a gardé. */
  secours: boolean;
}) {
  const [retour, setRetour] = useState(false);
  const etaitHors = useRef(false);
  const toutParti = enAttente === 0 && photos === 0 && (statut === "enregistre" || statut === "modifie");
  useEffect(() => {
    if (horsConnexion) {
      etaitHors.current = true;
      return;
    }
    if (!etaitHors.current || !toutParti) return;
    etaitHors.current = false;
    const a = window.setTimeout(() => setRetour(true), 0);
    const b = window.setTimeout(() => setRetour(false), 5_000);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [horsConnexion, toutParti]);

  const attente = [enAttente ? pluriel(enAttente, "modification") : null, photos ? pluriel(photos, "photo") : null].filter(Boolean).join(" et ");
  if (horsConnexion)
    return (
      <div className={`${s.bandeauReseau} ${s.reseauHors}`} role="status" aria-live="polite">
        <i>
          <Picto nom="horsLigne" taille={22} />
        </i>
        <p>
          <b>Hors connexion{attente ? ` — ${attente} en attente` : ""}</b>
          <span>
            Continuez la saisie : tout est gardé sur la tablette et partira de soi-même, dans l&apos;ordre, au retour du réseau. Le compte-rendu et la signature du
            client demandent le réseau.
          </span>
        </p>
      </div>
    );
  if (statut === "session" && (enAttente || photos))
    return (
      <div className={`${s.bandeauReseau} ${s.reseauDanger}`} role="status" aria-live="polite">
        <i>
          <Picto nom="alerte" taille={22} />
        </i>
        <p>
          <b>Session expirée — {attente} gardée{enAttente + photos > 1 ? "s" : ""} sur la tablette</b>
          <span>Reconnectez-vous (bouton en haut) : elles partiront ensuite d&apos;elles-mêmes.</span>
        </p>
      </div>
    );
  if (statut === "erreur" && (enAttente || photos))
    return (
      <div className={`${s.bandeauReseau} ${s.reseauHors}`} role="status" aria-live="polite">
        <i>
          <Picto nom="recharger" taille={22} />
        </i>
        <p>
          <b>Le serveur ne répond pas — {attente} gardée{enAttente + photos > 1 ? "s" : ""} sur la tablette</b>
          <span>Nouvel essai dans un instant. Continuez la saisie.</span>
        </p>
      </div>
    );
  if (photos && statut !== "signee")
    return (
      <div className={`${s.bandeauReseau} ${s.reseauNeutre}`} role="status" aria-live="polite">
        <i className={s.tourne}>
          <Picto nom="recharger" taille={22} />
        </i>
        <p>
          <b>{pluriel(photos, "photo")} en cours d&apos;envoi</b>
          <span>Elles sont gardées sur la tablette jusqu&apos;à ce que le serveur les ait reçues.</span>
        </p>
      </div>
    );
  if (secours)
    return (
      <div className={`${s.bandeauReseau} ${toutParti ? s.reseauOk : s.reseauNeutre}`} role="status" aria-live="polite">
        <i>
          <Picto nom={toutParti ? "coche" : "info"} taille={22} />
        </i>
        <div>
          <b>{toutParti ? "Tout est enregistré" : "Visite rouverte depuis la tablette"}</b>
          <span>Cette page a été rouverte sans réseau, depuis ce que la tablette avait gardé. Rechargez-la pour retrouver la visite telle que le serveur la garde.</span>
          {toutParti && (
            <div className={s.nonEnregistreesActions}>
              <button type="button" className={s.boutonPlein} onClick={() => window.location.reload()}>
                <Picto nom="recharger" taille={18} /> Recharger la visite
              </button>
            </div>
          )}
        </div>
      </div>
    );
  if (retour)
    return (
      <div className={`${s.bandeauReseau} ${s.reseauOk}`} role="status" aria-live="polite">
        <i>
          <Picto nom="coche" taille={22} />
        </i>
        <p>
          <b>Réseau revenu : tout est enregistré</b>
          <span>Les modifications faites sans réseau ont rejoint le dossier.</span>
        </p>
      </div>
    );
  if (origine === "tablette" && !secours)
    return (
      <div className={`${s.bandeauReseau} ${s.reseauNeutre}`} role="status">
        <i>
          <Picto nom="info" taille={22} />
        </i>
        <p>
          <b>Saisie reprise depuis la tablette</b>
          <span>La page reçue était plus ancienne que ce que la tablette avait déjà enregistré : c&apos;est la version de la tablette qui s&apos;affiche.</span>
        </p>
      </div>
    );
  return null;
}

/** Ce que le serveur n'a pas pris : gardé sur la tablette et montré, jamais effacé sans que le commercial le demande. */
function NonEnregistrees({ liste, signee, oublier, versCompteRendu }: { liste: NonEnregistree[]; signee: boolean; oublier: () => void; versCompteRendu: () => void }) {
  const [copie, setCopie] = useState(false);
  const fige = liste.some((x) => x.raison === "fige");
  const texte = liste.map((x) => `- ${x.description}`).join("\n");
  return (
    <section className={`${s.bandeauReseau} ${s.reseauDanger} ${s.nonEnregistrees}`} role="alert">
      <i>
        <Picto nom="alerte" taille={22} />
      </i>
      <div>
        <b>
          {pluriel(liste.length, "modification")} faite{liste.length > 1 ? "s" : ""} sur cette tablette n&apos;
          {liste.length > 1 ? "ont" : "a"} pas pu être enregistrée{liste.length > 1 ? "s" : ""}
        </b>
        <span>
          {fige
            ? "Le compte-rendu de cette visite a été signé sur un autre appareil (ou la visite a été retirée) : il ne se modifie plus. Ces modifications restent gardées ici : transmettez-les au bureau."
            : "Le serveur les a refusées (valeur hors des limites). Elles restent gardées ici : transmettez-les au bureau."}
        </span>
        <details>
          <summary>Voir la liste</summary>
          <ul>
            {liste.map((x, i) => (
              <li key={i}>{x.description}</li>
            ))}
          </ul>
        </details>
        <div className={s.nonEnregistreesActions}>
          <button
            type="button"
            className={s.boutonDoux}
            onClick={() => {
              void navigator.clipboard?.writeText(texte).then(
                () => setCopie(true),
                () => setCopie(false),
              );
            }}
          >
            {copie ? "Liste copiée" : "Copier la liste"}
          </button>
          <button type="button" className={s.boutonDoux} onClick={oublier}>
            C&apos;est transmis : effacer
          </button>
          {signee && (
            <button type="button" className={s.boutonPlein} onClick={versCompteRendu}>
              Voir le compte-rendu signé
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

// --- Une pièce ------------------------------------------------------------------------------------------

function PanneauPiece({
  piece, objets, photos, connus, frequents, destinations, agir, onPhotos, onRenvoyer, onRetirerPhoto, onDupliquer, onRetirer,
}: {
  piece: PieceSaisie;
  objets: ObjetSaisi[];
  photos: PhotoTablette[];
  connus: ObjetConnu[];
  frequents: ReferenceFrequente[];
  destinations: Destination[];
  agir: Agir;
  onPhotos: (f: File[]) => void;
  onRenvoyer: (p: PhotoTablette) => void;
  onRetirerPhoto: (p: PhotoTablette) => void;
  onDupliquer: () => void;
  onRetirer: () => void;
}) {
  // Les familles du catalogue, celles de la pièce d'abord (catalogue.ts) ; tout le catalogue reste à portée.
  const familles = useMemo(() => famillesPourLaPiece(piece.nom), [piece.nom]);
  const [famille, setFamille] = useState(() => famillesPourLaPiece(piece.nom)[0] ?? FAMILLES[0]?.cle);
  const [confirmer, setConfirmer] = useState(false);
  const [nom, setNom] = useState(piece.nom);
  const proposes = useMemo(() => CATALOGUE_TABLETTE.filter((c) => c.groupe === famille), [famille]);
  const lesPlusUtilises = useMemo(() => frequents.filter((f) => f.genre === genreDePiece(piece.nom)), [frequents, piece.nom]);
  const bilan = bilanVolumes(objets);
  const choixPiece = choixDeLaPiece(piece, objets, destinations);
  const majPiece = (patch: Partial<PieceSaisie>) => agir({ t: "piece", ...piece, ...patch });
  const majObjet = (o: ObjetSaisi, patch: Partial<ObjetSaisi>) => agir({ t: "objet", ...o, ...patch });

  /** Un meuble de plus : la ligne identique qui va au même endroit prend un exemplaire de plus, sinon une ligne nouvelle. */
  function ajouter(a: Ajout) {
    const libelle = a.label.slice(0, PLAFONDS.libelle);
    const volume = a.horsCubage ? 0 : a.volume;
    const meme = objets.find(
      (o) => o.libelle.toLowerCase() === libelle.toLowerCase() && o.volume === volume && !!o.horsCubage === !!a.horsCubage && choixDe(o, destinations) === choixPiece,
    );
    if (meme) majObjet(meme, { quantite: Math.min(PLAFONDS.quantite, meme.quantite + 1) });
    else {
      const en = a.en !== undefined ? a.en : (referenceDuLibelle(libelle)?.en ?? null);
      agir({
        t: "objet", cle: nouvelleCle(), piece: piece.cle, libelle, quantite: 1, volume, demontage: false, fragile: false, note: null,
        ...destinationDuChoix(choixPiece, destinations), destinationLibre: null, libelleEn: en ? en.slice(0, PLAFONDS.libelleEn) : null, horsCubage: !!a.horsCubage,
      });
    }
  }

  /**
   * Un objet change de destination sur sa ligne (ou se répartit). Une pièce
   * sans destination posée prend celle de ses objets quand ils vont tous au
   * même endroit : sans précaution, envoyer le seul objet de la pièce au
   * garde-meuble y enverrait aussi la pièce, et avec elle les objets ajoutés
   * ensuite. La pièce garde donc d'abord la destination qu'elle affichait.
   */
  function figerLaPiece() {
    if (!choixDe(piece, destinations) && choixPiece) majPiece(destinationDuChoix(choixPiece, destinations));
  }

  function majObjetDeLaLigne(o: ObjetSaisi, patch: Partial<ObjetSaisi>) {
    if (patch.destination !== undefined || patch.speciale !== undefined) figerLaPiece();
    majObjet(o, patch);
  }

  function repartir(o: ObjetSaisi, n: number, choix: ChoixDestination) {
    const ops = opsRepartir(o, n, choix, objets, destinations, nouvelleCle);
    if (!ops.length) return;
    figerLaPiece();
    for (const op of ops) agir(op);
  }

  /** Toute la pièce part ailleurs : ses objets qui suivaient la pièce suivent ; un objet envoyé à part reste où il est. */
  function destinationPourLaPiece(choix: ChoixDestination) {
    if (choix === choixPiece) return;
    const patch = patchDuChoix(choix, destinations);
    if (!patch) return;
    majPiece({ destination: patch.destination, speciale: patch.speciale });
    for (const o of objets) if (!o.destinationLibre && (choixDe(o, destinations) ?? choixPiece) === choixPiece) majObjet(o, patch);
  }

  useEffect(() => {
    if (!confirmer) return;
    const t = window.setTimeout(() => setConfirmer(false), 3500);
    return () => window.clearTimeout(t);
  }, [confirmer]);

  const nbObjets = objets.reduce((n, o) => n + o.quantite, 0);
  const choixPieceListe = [
    ...destinations.map((d) => ({ valeur: `e${d.id}`, libelle: d.libelle, transporte: true })),
    ...DESTINATIONS_SPECIALES.map((x) => ({ valeur: `s:${x.cle}`, libelle: x.libelle, transporte: x.transporte })),
  ];

  return (
    <>
      <div className={s.panneauTete}>
        <input
          className={s.nomPiece}
          value={nom}
          maxLength={PLAFONDS.nom}
          onChange={(e) => {
            setNom(e.target.value);
            // Un nom vide ne part pas : le serveur le refuserait. Il reprend le précédent en quittant le champ.
            if (e.target.value.trim()) majPiece({ nom: e.target.value.trim() });
          }}
          onBlur={() => !nom.trim() && setNom(piece.nom)}
          aria-label="Nom de la pièce"
        />
        <div className={s.volumePiece}>
          <small>Volume transporté</small>
          <b>{m3(bilan.transporte)}</b>
          {bilan.nonTransporte > 0 && <em>+ {m3(bilan.nonTransporte)} non transporté</em>}
        </div>
        <button type="button" className={s.boutonDoux} onClick={onDupliquer} aria-label="Dupliquer la pièce" title="Une copie de la pièce et de ses objets, sans les photos ni la remarque">
          <Picto nom="copier" taille={18} />
          Dupliquer
        </button>
        <button type="button" className={`${s.boutonDoux} ${confirmer ? s.boutonDanger : ""}`} onClick={() => (confirmer ? onRetirer() : setConfirmer(true))}>
          <Picto nom="poubelle" taille={18} />
          {confirmer ? `Retirer la pièce${objets.length ? ` et ses ${objets.length} objets` : ""} ?` : "Retirer"}
        </button>
      </div>

      <section className={s.bloc} aria-label="Destination de la pièce">
        <div className={s.choix} style={{ marginTop: 0 }}>
          <span>Destination de la pièce</span>
          <div role="radiogroup" aria-label="Destination de la pièce">
            {choixPieceListe.map((c) => (
              <button
                key={c.valeur}
                type="button"
                role="radio"
                aria-checked={choixPiece === c.valeur}
                className={`${choixPiece === c.valeur ? s.choixOn : ""} ${c.transporte ? "" : s.choixHors}`}
                onClick={() => destinationPourLaPiece(c.valeur)}
              >
                {c.libelle}
              </button>
            ))}
          </div>
        </div>
        <p className={s.aideDest}>Les objets ajoutés vont à cette destination. Un objet peut aller ailleurs : changez-la sur sa ligne, ou répartissez ses exemplaires.</p>
      </section>

      <section className={s.bloc} aria-label="Ajout rapide">
        <div className={s.blocTete}>
          <h2>Ajouter un meuble</h2>
          <span className={s.compte}>{CATALOGUE_TABLETTE.length} références · catalogue de Dragan (V7)</span>
        </div>
        <RechercheObjet connus={connus} ajouter={ajouter} />
        {lesPlusUtilises.length > 0 && (
          <div className={s.frequents} aria-label="Les plus utilisés par l'équipe dans cette pièce">
            <span className={s.frequentsTitre}>Les plus utilisés ici</span>
            <div className={s.frequentsListe}>
              {lesPlusUtilises.map((f) => {
                const deja = objets.filter((o) => o.libelle.toLowerCase() === f.label.toLowerCase()).reduce((n, o) => n + o.quantite, 0);
                return (
                  <button key={f.label} type="button" className={`${s.frequent} ${deja ? s.articlePris : ""}`} onClick={() => ajouter({ label: f.label, volume: f.volume, en: f.en, horsCubage: f.horsCubage })}>
                    <span>{f.label}</span>
                    <small>{volumeLu({ volume: f.volume, horsCubage: f.horsCubage, aMesurer: referenceDuLibelle(f.label)?.aMesurer })}</small>
                    {deja > 0 && <em>{deja}</em>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className={s.familles} role="tablist" aria-label="Familles du catalogue">
          {familles.map((cle) => {
            const f = FAMILLES.find((x) => x.cle === cle);
            if (!f) return null;
            return (
              <button key={cle} type="button" role="tab" aria-selected={cle === famille} className={cle === famille ? s.familleActive : ""} onClick={() => setFamille(cle)} title={f.libelle}>
                {f.court}
              </button>
            );
          })}
        </div>
        <div className={s.catalogue}>
          {proposes.map((c) => {
            const deja = objets.filter((o) => o.libelle === c.label).reduce((n, o) => n + o.quantite, 0);
            return (
              <button key={c.label} type="button" className={`${s.article} ${deja ? s.articlePris : ""}`} onClick={() => ajouter({ label: c.label, volume: c.volume, en: c.en, horsCubage: c.horsCubage })}>
                <span>{c.label}</span>
                <small>
                  <b>{volumeLu(c)}</b> · {c.en}
                </small>
                {deja > 0 && <em>{deja}</em>}
              </button>
            );
          })}
        </div>
        <p className={s.noteCatalogue}>
          Volumes indicatifs, modifiables sur chaque ligne. Familles déduites du catalogue ; désignations anglaises reprises telles quelles, à relire.
        </p>
      </section>

      <section className={s.bloc} aria-label="Métré">
        <div className={s.blocTete}>
          <h2>Métré</h2>
          <span className={s.compte}>
            {pluriel(nbObjets, "objet")} · {m3(bilan.transporte)} transportés{bilan.nonTransporte > 0 ? ` · ${m3(bilan.nonTransporte)} non transportés` : ""}
          </span>
        </div>
        {objets.length === 0 ? (
          <p className={s.videLigne}>Aucun objet pour l&apos;instant : tapez son nom ou touchez un meuble ci-dessus.</p>
        ) : (
          <ul className={s.objets}>
            {objets.map((o) => (
              <LigneObjet
                key={o.cle}
                o={o}
                destinations={destinations}
                maj={(patch) => majObjetDeLaLigne(o, patch)}
                retirer={() => agir({ t: "objet-", cle: o.cle })}
                dupliquer={() => {
                  for (const op of opsDupliquerLigne(o, destinations, nouvelleCle)) agir(op);
                }}
                repartir={(n, choix) => repartir(o, n, choix)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className={s.bloc} aria-label="Photos">
        <div className={s.blocTete}>
          <h2>Photos</h2>
          <div className={s.boutonsPhoto}>
            <label className={s.boutonPlein}>
              <Picto nom="appareil" taille={20} /> Prendre une photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => {
                  onPhotos(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </label>
            <label className={s.boutonDoux}>
              <Picto nom="galerie" taille={20} /> Galerie
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  onPhotos(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
        {photos.length === 0 ? (
          <p className={s.videLigne}>Une vue d&apos;ensemble de la pièce, puis ce qui demande une attention : un meuble lourd, un passage étroit.</p>
        ) : (
          <div className={s.photos}>
            {photos.map((x) => (
              <figure key={x.cle} className={`${s.photo} ${x.etat === "echec" ? s.photoEchec : ""} ${x.etat === "attente" ? s.photoAttente : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- photo privée, servie par une URL signée d'une minute */}
                <img src={x.apercu ?? (x.id ? urlPhotoVisite(x.id, x.vignette) : "")} alt={`Photo de la pièce ${piece.nom}`} />
                {(x.etat === "preparation" || x.etat === "envoi") && (
                  <span className={s.progression}>
                    <i style={{ width: `${Math.round(x.progression * 100)}%` }} />
                  </span>
                )}
                {x.etat === "echec" && x.local && (
                  <button type="button" className={s.photoRenvoyer} onClick={() => onRenvoyer(x)}>
                    <Picto nom="recharger" taille={18} /> Renvoyer
                  </button>
                )}
                {(x.etat === "ok" || x.etat === "attente" || x.etat === "echec") && (
                  <button type="button" className={s.photoRetirer} onClick={() => onRetirerPhoto(x)} aria-label="Retirer la photo">
                    <Picto nom="croix" taille={16} />
                  </button>
                )}
                {x.erreur ? <figcaption>{x.erreur}</figcaption> : x.etat === "attente" ? <figcaption>Gardée sur la tablette : partira au retour du réseau.</figcaption> : null}
              </figure>
            ))}
          </div>
        )}
      </section>

      <section className={s.bloc} aria-label="Remarque">
        <div className={s.blocTete}>
          <h2>Remarque sur la pièce</h2>
          <span className={s.compte}>Figure au compte-rendu</span>
        </div>
        <textarea
          className={s.zone}
          rows={3}
          maxLength={PLAFONDS.remarque}
          value={piece.remarque ?? ""}
          onChange={(e) => majPiece({ remarque: e.target.value || null })}
          placeholder="Parquet fragile, porte étroite, objets à ne pas déménager…"
        />
      </section>
    </>
  );
}

/**
 * La saisie automatique : chaque lettre resserre les suggestions (« ta » →
 * table basse, tapis…, « ta ba » → table basse), et un synonyme ou le nom
 * anglais trouve aussi la référence (« kallax », « frigo », « sofa »). Une
 * suggestion s'ajoute d'une touche ; un objet inconnu s'ajoute avec son
 * volume ; une référence « à mesurer » prend le volume tapé, s'il y en a un.
 */
function RechercheObjet({ connus, ajouter }: { connus: ObjetConnu[]; ajouter: (a: Ajout) => void }) {
  const [frappe, setFrappe] = useState("");
  const [volume, setVolume] = useState("");
  const [aide, setAide] = useState<string | null>(null);
  const champ = useRef<HTMLInputElement>(null);
  const suggestions = useMemo(() => rechercherObjets(frappe, connus, 10), [frappe, connus]);

  function choisir(o: ObjetConnu) {
    const v = nombre(volume);
    const tape = volume.trim() && v != null && v >= 0 && v <= PLAFONDS.volume ? Math.round(v * 100) / 100 : null;
    const vol = o.aMesurer && tape != null ? tape : Math.round(o.volume * 100) / 100;
    ajouter({ label: o.label.slice(0, PLAFONDS.libelle), volume: vol, en: o.en ?? null, horsCubage: o.horsCubage });
    setFrappe("");
    setVolume("");
    setAide(o.aMesurer && tape == null ? `« ${o.label} » : volume à mesurer. Saisissez-le sur sa ligne, dans le métré.` : null);
    champ.current?.focus();
  }

  return (
    <div className={s.recherche}>
      <form
        className={s.objetLibre}
        onSubmit={(e) => {
          e.preventDefault();
          const libelle = frappe.trim();
          if (!libelle) return;
          const vol = nombre(volume);
          if (volume.trim() && vol != null && vol >= 0 && vol <= PLAFONDS.volume) {
            const r = referenceDuLibelle(libelle);
            choisir({ label: r?.label ?? libelle, volume: vol, source: "dossier", en: r?.en ?? null, horsCubage: r?.horsCubage });
            return;
          }
          if (suggestions[0]) choisir(suggestions[0]);
          else setAide("Objet inconnu : indiquez son volume en m³, puis « Ajouter ».");
        }}
      >
        <input
          ref={champ}
          value={frappe}
          onChange={(e) => {
            setFrappe(e.target.value);
            setAide(null);
          }}
          placeholder="Tapez un objet : table, piano, kallax…"
          maxLength={PLAFONDS.libelle}
          aria-label="Objet"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
        />
        <input value={volume} onChange={(e) => setVolume(e.target.value)} placeholder="m³" inputMode="decimal" aria-label="Volume unitaire en mètres cubes" />
        <button type="submit" className={s.boutonPlein}>
          <Picto nom="plus" taille={18} /> Ajouter
        </button>
      </form>
      {suggestions.length > 0 && (
        <div className={s.suggestions} role="listbox" aria-label="Objets proposés">
          {suggestions.map((o) => (
            <button key={`${o.source}-${o.label}`} type="button" role="option" aria-selected={false} className={s.suggestion} onClick={() => choisir(o)}>
              <span>{o.label}</span>
              {o.en && <i className={s.suggestionEn}>{o.en}</i>}
              <small>
                {volumeLu(o)}
                {o.source === "dossier" ? " · déjà relevé ici" : o.source === "historique" ? " · déjà saisi par l'équipe" : ""}
              </small>
            </button>
          ))}
        </div>
      )}
      {aide && <p className={s.aideRecherche}>{aide}</p>}
    </div>
  );
}

/**
 * Une ligne du métré : la désignation (« Français / English » quand elle vient
 * du catalogue), la quantité au pas ou au clavier, le volume unitaire
 * modifiable, le total, puis la destination — toujours —, le démontage, le
 * fragile, la note, dupliquer et répartir.
 */
function LigneObjet({
  o, destinations, maj, retirer, dupliquer, repartir,
}: {
  o: ObjetSaisi;
  destinations: Destination[];
  maj: (patch: Partial<ObjetSaisi>) => void;
  retirer: () => void;
  dupliquer: () => void;
  repartir: (n: number, choix: ChoixDestination) => void;
}) {
  // Une valeur en cours de frappe (null : celle de l'objet) : le champ suit l'objet quand un autre geste le change.
  const [quantite, setQuantite] = useState<string | null>(null);
  const [volume, setVolume] = useState<string | null>(null);
  const [libelle, setLibelle] = useState(o.libelle);
  const [confirmer, setConfirmer] = useState(false);
  const [noteOuverte, setNoteOuverte] = useState(false);
  const [repartition, setRepartition] = useState(false);
  useEffect(() => {
    if (!confirmer) return;
    const t = window.setTimeout(() => setConfirmer(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirmer]);
  const aSaisir = !o.horsCubage && !(o.volume > 0);
  const transporte = estTransporte(o);
  return (
    <li className={`${s.objet} ${s.objetReparti} ${transporte ? "" : s.objetNonTransporte} ${o.speciale === "a_confirmer" ? s.objetAConfirmer : ""}`}>
      <div className={s.objetDesignation}>
        <input
          className={s.objetNom}
          value={libelle}
          maxLength={PLAFONDS.libelle}
          onChange={(e) => {
            setLibelle(e.target.value);
            // Renommée, la ligne garde l'anglais de la référence du catalogue qui porte ce nom, sinon n'en a plus.
            const v = e.target.value.trim();
            if (v) maj({ libelle: v, libelleEn: referenceDuLibelle(v)?.en ?? (v === o.libelle ? (o.libelleEn ?? null) : null) });
          }}
          onBlur={() => !libelle.trim() && setLibelle(o.libelle)}
          aria-label="Objet"
        />
        {o.libelleEn && (
          <small className={s.objetEn} lang="en">
            / {o.libelleEn}
            {enARelire(o.libelle, o.libelleEn) && <em lang="fr"> · anglais à relire</em>}
          </small>
        )}
      </div>
      <div className={s.pas} role="group" aria-label="Quantité">
        <button type="button" onClick={() => (o.quantite > 1 ? maj({ quantite: o.quantite - 1 }) : setConfirmer(true))} aria-label="Un de moins">
          <Picto nom="moins" taille={18} />
        </button>
        <input
          className={s.quantite}
          value={quantite ?? String(o.quantite)}
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label={`Quantité : ${o.libelle}`}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 3);
            setQuantite(v);
            const n = Number(v);
            if (v && Number.isInteger(n) && n >= 1 && n <= PLAFONDS.quantite) maj({ quantite: n });
          }}
          onBlur={() => setQuantite(null)}
        />
        <button type="button" onClick={() => maj({ quantite: Math.min(PLAFONDS.quantite, o.quantite + 1) })} aria-label="Un de plus">
          <Picto nom="plus" taille={18} />
        </button>
      </div>
      {o.horsCubage ? (
        <span className={s.horsCubage} title="Protection : quantifiée, sans cubage">
          Non compté
        </span>
      ) : (
        <label className={`${s.unitaire} ${aSaisir ? s.aSaisir : ""}`}>
          <input
            value={volume ?? (aSaisir ? "" : String(o.volume).replace(".", ","))}
            inputMode="decimal"
            placeholder="à saisir"
            onChange={(e) => {
              setVolume(e.target.value);
              const n = nombre(e.target.value);
              if (e.target.value.trim() && n != null && n >= 0 && n <= PLAFONDS.volume) maj({ volume: Math.round(n * 100) / 100 });
            }}
            onBlur={() => setVolume(null)}
            aria-label="Volume unitaire"
          />
          <span>m³</span>
        </label>
      )}
      <b className={s.objetTotal}>{o.horsCubage ? "—" : m3(o.quantite * o.volume)}</b>
      <div className={s.bascules}>
        <ChoixDestination o={o} destinations={destinations} maj={maj} />
        <button type="button" aria-pressed={o.demontage} className={o.demontage ? s.basculeOn : ""} onClick={() => maj({ demontage: !o.demontage })}>
          <Picto nom="outil" taille={16} /> Démontage
        </button>
        <button type="button" aria-pressed={o.fragile} className={o.fragile ? s.basculeOn : ""} onClick={() => maj({ fragile: !o.fragile })}>
          <Picto nom="fragile" taille={16} /> Fragile
        </button>
        <button type="button" aria-expanded={noteOuverte || !!o.note} className={o.note ? s.basculeOn : ""} onClick={() => setNoteOuverte((x) => !x)}>
          <Picto nom="note" taille={16} /> Note
        </button>
        <button type="button" onClick={dupliquer}>
          <Picto nom="copier" taille={16} /> Dupliquer
        </button>
        {o.quantite > 1 && (
          <button type="button" aria-expanded={repartition} className={repartition ? s.basculeOn : ""} onClick={() => setRepartition((x) => !x)}>
            <Picto nom="repartir" taille={16} /> Répartir
          </button>
        )}
      </div>
      <button type="button" className={`${s.objetRetirer} ${confirmer ? s.boutonDanger : ""}`} onClick={() => (confirmer ? retirer() : setConfirmer(true))} aria-label={confirmer ? "Confirmer le retrait" : "Retirer l'objet"}>
        {confirmer ? "Retirer ?" : <Picto nom="croix" taille={18} />}
      </button>
      {(noteOuverte || !!o.note) && (
        <label className={s.objetNote}>
          <Picto nom="note" taille={16} />
          <input
            value={o.note ?? ""}
            maxLength={PLAFONDS.note}
            placeholder="Note sur l'objet : marbre à part, pied cassé, à emballer…"
            aria-label={`Note : ${o.libelle}`}
            autoFocus={noteOuverte && !o.note}
            onChange={(e) => maj({ note: e.target.value || null })}
          />
        </label>
      )}
      {repartition && o.quantite > 1 && (
        <Repartition
          o={o}
          destinations={destinations}
          valider={(n, choix) => {
            repartir(n, choix);
            setRepartition(false);
          }}
          annuler={() => setRepartition(false)}
        />
      )}
    </li>
  );
}

/**
 * Répartir les exemplaires d'une ligne (Dragan : « 6 chaises : 4 à l'adresse
 * A, 2 au garde-meubles ») : combien, vers où. La ligne garde le reste.
 */
function Repartition({ o, destinations, valider, annuler }: { o: ObjetSaisi; destinations: Destination[]; valider: (n: number, choix: ChoixDestination) => void; annuler: () => void }) {
  const actuel = choixDe(o, destinations);
  const choix = [
    ...destinations.map((d) => ({ valeur: `e${d.id}`, libelle: d.libelle })),
    ...DESTINATIONS_SPECIALES.map((x) => ({ valeur: `s:${x.cle}`, libelle: x.libelle })),
  ].filter((c) => c.valeur !== actuel);
  const [n, setN] = useState(Math.max(1, Math.floor(o.quantite / 2)));
  const [vers, setVers] = useState(choix[0]?.valeur ?? "");
  return (
    <div className={s.repartir} role="group" aria-label={`Répartir : ${o.libelle}`}>
      <span>Envoyer</span>
      <div className={s.pas}>
        <button type="button" onClick={() => setN((x) => Math.max(1, x - 1))} aria-label="Un exemplaire de moins">
          <Picto nom="moins" taille={18} />
        </button>
        <input
          className={s.quantite}
          value={String(n)}
          inputMode="numeric"
          aria-label="Nombre d'exemplaires à envoyer"
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const v = Number(e.target.value.replace(/\D/g, ""));
            if (Number.isInteger(v) && v >= 1) setN(Math.min(o.quantite, v));
          }}
        />
        <button type="button" onClick={() => setN((x) => Math.min(o.quantite, x + 1))} aria-label="Un exemplaire de plus">
          <Picto nom="plus" taille={18} />
        </button>
      </div>
      <span>sur {o.quantite} vers</span>
      <label className={s.destObjet}>
        <Picto nom="camion" taille={16} />
        <select value={vers} onChange={(e) => setVers(e.target.value)} aria-label="Destination des exemplaires">
          {choix.map((c) => (
            <option key={c.valeur} value={c.valeur}>
              {c.libelle}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className={s.boutonPlein} disabled={!vers} onClick={() => valider(n, vers)}>
        Répartir
      </button>
      <button type="button" className={s.boutonDoux} onClick={annuler}>
        Annuler
      </button>
    </div>
  );
}

/**
 * La destination d'un objet, toujours sur sa ligne : les adresses du trajet
 * (et le garde-meuble), puis à laisser sur place, débarras, pris en charge par
 * le client, à confirmer. Un menu, que la tablette ouvre en grand au doigt.
 */
function ChoixDestination({ o, destinations, maj }: { o: ObjetSaisi; destinations: Destination[]; maj: (patch: Partial<ObjetSaisi>) => void }) {
  const valeur = choixDe(o, destinations) ?? "";
  return (
    <label className={`${s.destObjet} ${estTransporte(o) ? "" : s.destHors} ${o.speciale === "a_confirmer" ? s.destAConfirmer : ""}`}>
      <Picto nom="camion" taille={16} />
      <select
        value={valeur}
        aria-label={`Destination : ${o.libelle}`}
        onChange={(e) => {
          const patch = patchDuChoix(e.target.value, destinations);
          if (patch) maj(patch);
        }}
      >
        {!valeur && <option value="">{o.destinationLibre ?? "Sans destination"}</option>}
        {destinations.length > 0 && (
          <optgroup label="Adresses du trajet">
            {destinations.map((d) => (
              <option key={d.id} value={`e${d.id}`}>
                {d.libelle}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="Autres destinations">
          {DESTINATIONS_SPECIALES.map((x) => (
            <option key={x.cle} value={`s:${x.cle}`}>
              {x.libelle}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}

// --- La répartition entre les destinations ------------------------------------------------------------

function PanneauDestinations({ etat, destinations, agir, ouvrirPiece }: { etat: EtatSaisie; destinations: Destination[]; agir: Agir; ouvrirPiece: (cle: string) => void }) {
  const lignes = volumesParDestination(etat.objets, destinations, true);
  const bilan = bilanVolumes(etat.objets);
  const nomPiece = new Map(etat.pieces.map((x) => [x.cle, x.nom]));
  const groupe = (o: ObjetSaisi) => choixDe(o, destinations) ?? `l${(o.destinationLibre ?? "").trim().toLowerCase()}`;
  return (
    <>
      <div className={s.panneauTete}>
        <h1 className={s.titrePanneau}>Destinations</h1>
        <p className={s.aide}>Le volume par destination. Changez la destination d&apos;un objet sur sa ligne, ou celle de toute une pièce depuis la pièce.</p>
      </div>
      <section className={s.bloc} aria-label="Volumes du dossier">
        <div className={s.bilan}>
          <div className={s.bilanFort}>
            <small>Transporté</small>
            <b>{m3(bilan.transporte)}</b>
            <span>Le volume du dossier et du devis</span>
          </div>
          <div>
            <small>Dont débarras</small>
            <b>{m3(bilan.debarras)}</b>
            <span>Emporté par Bailly</span>
          </div>
          <div>
            <small>Dont à confirmer</small>
            <b>{m3(bilan.aConfirmer)}</b>
            <span>Compté par prudence</span>
          </div>
          <div className={s.bilanHors}>
            <small>Non transporté</small>
            <b>{m3(bilan.nonTransporte)}</b>
            <span>À laisser sur place, pris en charge par le client</span>
          </div>
        </div>
        <p className={s.regles}>
          Règles de calcul, à valider : « À laisser sur place » et « Pris en charge par le client » ne comptent pas dans le volume transporté ; « Débarras » est emporté
          par Bailly, donc compté et montré à part ; « À confirmer » est compté, par prudence pour le chiffrage.
        </p>
      </section>
      <section className={s.bloc}>
        <ul className={s.repartition}>
          {lignes.map((l) => (
            <li key={l.cle} className={l.transporte ? "" : s.ligneHors}>
              <span>
                {l.libelle}
                {!l.transporte && <em> · non transporté</em>}
              </span>
              <small>{pluriel(l.objets, "objet")}</small>
              <b>{m3(l.volume)}</b>
            </li>
          ))}
        </ul>
      </section>
      {lignes.map((l) => {
        const objets = etat.objets.filter((o) => groupe(o) === l.cle);
        return (
          <section key={l.cle} className={s.bloc} aria-label={l.libelle}>
            <div className={s.blocTete}>
              <h2>
                <Picto nom="camion" taille={20} />
                {l.libelle}
              </h2>
              <span className={s.compte}>
                {pluriel(l.objets, "objet")} · {m3(l.volume)}
                {l.transporte ? "" : " · non transporté"}
              </span>
            </div>
            {objets.length === 0 ? (
              <p className={s.videLigne}>Aucun objet pour cette destination.</p>
            ) : (
              <ul className={s.objetsDest}>
                {objets.map((o) => (
                  <li key={o.cle}>
                    <button type="button" className={s.lienPiece} onClick={() => ouvrirPiece(o.piece)}>
                      {nomPiece.get(o.piece) ?? "Pièce"}
                    </button>
                    <span>
                      {o.quantite > 1 ? `${o.quantite} × ` : ""}
                      {o.libelle}
                    </span>
                    <b>{o.horsCubage ? "—" : m3(o.quantite * o.volume)}</b>
                    <ChoixDestination o={o} destinations={destinations} maj={(patch) => agir({ t: "objet", ...o, ...patch })} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}

// --- Les accès ------------------------------------------------------------------------------------------

function Choix<K extends string>({
  libelle, valeurs, valeur, choisir, precision,
}: {
  libelle: string;
  valeurs: Record<K, string>;
  valeur: K | null;
  choisir: (v: K | null) => void;
  /** Une case libre au bout des choix, pour ce qu'ils ne prévoient pas. */
  precision?: { valeur: string | null; changer: (v: string | null) => void; libelle: string };
}) {
  return (
    <div className={s.choix}>
      <span>{libelle}</span>
      <div role="radiogroup" aria-label={libelle}>
        {(Object.entries(valeurs) as [K, string][]).map(([k, v]) => (
          <button key={k} type="button" role="radio" aria-checked={valeur === k} className={valeur === k ? s.choixOn : ""} onClick={() => choisir(valeur === k ? null : k)}>
            {v}
          </button>
        ))}
        {precision && (
          <input
            className={s.precision}
            value={precision.valeur ?? ""}
            maxLength={PLAFONDS_ACCES.precision}
            placeholder="Autre chose à noter…"
            aria-label={precision.libelle}
            onChange={(e) => precision.changer(e.target.value || null)}
          />
        )}
      </div>
    </div>
  );
}

function PanneauAcces({ etapes, agir }: { etapes: EtapeAcces[]; agir: Agir }) {
  const maj = (e: EtapeAcces, patch: Partial<EtapeAcces>) => {
    const x = { ...e, ...patch };
    agir({
      t: "etape", id: x.id, etage: x.etage, ascenseur: x.ascenseur, escalier: x.escalier, portage_m: x.portage_m,
      stationnement: x.stationnement, poids_lourd: x.poids_lourd, monte_meuble: x.monte_meuble,
      monte_charge: !!x.monte_charge, transbordement: !!x.transbordement, acces: x.acces,
      ascenseur_taille: x.ascenseur_taille ?? null, escalier_precision: x.escalier_precision ?? null, stationnement_precision: x.stationnement_precision ?? null,
    });
  };
  return (
    <>
      <div className={s.panneauTete}>
        <h1 className={s.titrePanneau}>Accès</h1>
        <p className={s.aide}>Le même vocabulaire que le questionnaire des conditions de livraison de l&apos;espace client.</p>
      </div>
      {etapes.length === 0 && <p className={s.videLigne}>Aucune adresse au dossier : renseignez l&apos;itinéraire dans la fiche du CRM.</p>}
      {etapes.map((e, i) => (
        <section key={e.id} className={s.bloc}>
          <div className={s.blocTete}>
            <h2>
              <span className={s.numero}>{i + 1}</span>
              {GENRE_ETAPE[e.genre] ?? "Étape"}
            </h2>
            <span className={s.compte}>{e.adresse ?? "Adresse à préciser dans la fiche"}</span>
          </div>
          <div className={s.grilleAcces}>
            <label className={s.champ}>
              <span>Étage</span>
              <input value={e.etage ?? ""} maxLength={20} placeholder="RDC, 3, 5 bis…" onChange={(x) => maj(e, { etage: x.target.value || null })} />
            </label>
            <div className={s.choix}>
              <span>Ascenseur</span>
              <div role="radiogroup" aria-label="Ascenseur">
                <button type="button" role="radio" aria-checked={e.ascenseur} className={e.ascenseur ? s.choixOn : ""} onClick={() => maj(e, { ascenseur: true })}>
                  Oui
                </button>
                <button type="button" role="radio" aria-checked={!e.ascenseur} className={!e.ascenseur ? s.choixOn : ""} onClick={() => maj(e, { ascenseur: false })}>
                  Non
                </button>
                {e.ascenseur && (
                  <label className={s.tailleAsc}>
                    <input
                      value={e.ascenseur_taille ?? ""}
                      maxLength={PLAFONDS_ACCES.ascenseurTaille}
                      inputMode="numeric"
                      placeholder="Taille"
                      aria-label="Taille de l'ascenseur (nombre de personnes)"
                      onChange={(x) => maj(e, { ascenseur_taille: x.target.value || null })}
                    />
                    <span>pers.</span>
                  </label>
                )}
              </div>
            </div>
            <label className={s.champ}>
              <span>Portage (m)</span>
              <input
                value={e.portage_m ?? ""}
                inputMode="numeric"
                placeholder="Du camion à la porte"
                onChange={(x) => {
                  const n = nombre(x.target.value);
                  maj(e, { portage_m: x.target.value.trim() === "" ? null : n != null && n >= 0 && n <= 1000 ? Math.round(n) : e.portage_m });
                }}
              />
            </label>
          </div>
          <Choix
            libelle="Escalier"
            valeurs={ACCES_ESCALIER}
            valeur={e.escalier}
            choisir={(v) => maj(e, { escalier: v })}
            precision={{ valeur: e.escalier_precision ?? null, changer: (v) => maj(e, { escalier_precision: v }), libelle: "Précisions sur l'escalier" }}
          />
          <Choix
            libelle="Stationnement"
            valeurs={ACCES_STATIONNEMENT}
            valeur={e.stationnement}
            choisir={(v) => maj(e, { stationnement: v })}
            precision={{ valeur: e.stationnement_precision ?? null, changer: (v) => maj(e, { stationnement_precision: v }), libelle: "Précisions sur le stationnement" }}
          />
          <Choix libelle="Accès poids lourd" valeurs={ACCES_POIDS_LOURD} valeur={e.poids_lourd} choisir={(v) => maj(e, { poids_lourd: v })} />
          <Choix libelle="Monte-meuble" valeurs={ACCES_MONTE_MEUBLE} valeur={e.monte_meuble} choisir={(v) => maj(e, { monte_meuble: v })} />
          <div className={s.choix}>
            <span>Monte-charge et transbordement</span>
            <div>
              <button type="button" aria-pressed={!!e.monte_charge} className={e.monte_charge ? s.choixOn : ""} onClick={() => maj(e, { monte_charge: !e.monte_charge })}>
                Monte-charge
              </button>
              <button type="button" aria-pressed={!!e.transbordement} className={e.transbordement ? s.choixOn : ""} onClick={() => maj(e, { transbordement: !e.transbordement })}>
                Transbordement
              </button>
            </div>
          </div>
          <label className={s.champ} style={{ marginTop: 14 }}>
            <span>Précisions d&apos;accès</span>
            <input value={e.acces ?? ""} maxLength={PLAFONDS.acces} placeholder="Code portail, cour intérieure, horaires de la rue…" onChange={(x) => maj(e, { acces: x.target.value || null })} />
          </label>
        </section>
      ))}
    </>
  );
}

// --- Options et remarques -------------------------------------------------------------------------------

function PanneauOptions({ etat, agir }: { etat: EtatSaisie; agir: Agir }) {
  return (
    <>
      <div className={s.panneauTete}>
        <h1 className={s.titrePanneau}>Options et remarques</h1>
        <p className={s.aide}>Ce qui est proposé ici figure au compte-rendu que le client signe.</p>
      </div>
      <section className={s.bloc}>
        <div className={s.blocTete}>
          <h2>Formule envisagée</h2>
          <span className={s.compte}>Les trois formules du devis</span>
        </div>
        <div className={s.formules}>
          {FORMULES.map((f) => (
            <button
              key={f.cle}
              type="button"
              aria-pressed={etat.formule === f.cle}
              className={`${s.formule} ${etat.formule === f.cle ? s.formuleOn : ""}`}
              onClick={() => agir({ t: "visite", formule: etat.formule === f.cle ? null : (f.cle as CleFormule) })}
            >
              <b>{f.nom}</b>
              <span>{f.sous}</span>
              <i>
                <Picto nom="coche" taille={16} />
              </i>
            </button>
          ))}
        </div>
      </section>
      <section className={s.bloc}>
        <div className={s.blocTete}>
          <h2>Prestations proposées</h2>
          <span className={s.compte}>{etat.options.filter((o) => o.proposee).length} sur {etat.options.length}</span>
        </div>
        <div className={s.options}>
          {etat.options.map((o, i) => (
            <button
              key={o.libelle}
              type="button"
              aria-pressed={o.proposee}
              className={`${s.option} ${o.proposee ? s.optionOn : ""}`}
              onClick={() => agir({ t: "visite", options: etat.options.map((x, j) => (j === i ? { ...x, proposee: !x.proposee } : x)) })}
            >
              <i>{o.proposee && <Picto nom="coche" taille={15} />}</i>
              {o.libelle}
            </button>
          ))}
        </div>
      </section>
      <section className={s.bloc}>
        <div className={s.blocTete}>
          <h2>Remarques</h2>
          <span className={s.compte}>Visibles du client sur le compte-rendu</span>
        </div>
        <textarea
          className={s.zone}
          rows={6}
          maxLength={PLAFONDS.remarques}
          value={etat.remarques ?? ""}
          onChange={(e) => agir({ t: "visite", remarques: e.target.value || null })}
          placeholder="Ce que le client a demandé, ce qui a été convenu pendant la visite…"
        />
      </section>
    </>
  );
}

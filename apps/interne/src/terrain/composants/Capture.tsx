"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { retirerPhoto } from "../actions";
import {
  CATEGORIES,
  PLAFOND_NOTE,
  PLAFOND_PHOTO,
  heureParis,
  libelleCategorie,
  urlPhoto,
  type Categorie,
  type PhotoVue,
} from "../regles";
import { Picto } from "./Picto";
import { nouvelleCle, poster as posterFormulaire, preparer } from "./photo-navigateur";
import Visionneuse from "./Visionneuse";
import s from "./terrain.module.css";
import v from "./visionneuse.module.css";

/*
 * La prise de photos d'un chantier.
 *
 * Le déménageur choisit la catégorie (avant, après, détail), une note s'il
 * le faut, puis prend une ou plusieurs photos (l'appareil photo, ou la
 * galerie du téléphone pour en choisir plusieurs d'un coup). Chaque photo
 * entre dans une file :
 *
 *   1. préparée dans le navigateur : réduite à 2 400 px de côté au plus
 *      (une photo de téléphone de 4 à 12 Mo tombe sous le mégaoctet), et une
 *      vignette de 480 px pour la galerie ;
 *   2. envoyée seule, avec sa progression : une photo qui échoue n'arrête
 *      pas les autres, et se renvoie à part. Une coupure réseau est
 *      réessayée deux fois d'elle-même, puis la photo attend un geste (ou le
 *      retour du réseau). Chaque photo porte une clé tirée ici : un renvoi
 *      dont la première réponse s'est perdue n'en fait pas deux.
 *
 * L'heure qui fait foi est celle du serveur, à la réception. La position est
 * jointe si le téléphone l'a donnée (jamais exigée). Le mode hors ligne est
 * hors du périmètre : une file non envoyée se perd si l'on ferme la page, ce
 * que le navigateur rappelle avant de partir.
 */

type Position = { lat: number; lng: number; precision: number; a: number };
type EtatPosition = "inconnu" | "recherche" | "ok" | "refusee" | "indisponible";
type Etat = "preparation" | "attente" | "envoi" | "ok" | "echec";

type Item = {
  cle: string;
  fichier: File;
  categorie: Categorie;
  note: string | null;
  position: Position | null;
  priseAppareil: number | null;
  etat: Etat;
  progression: number;
  essai: number;
  erreur?: string;
  reseau?: boolean;
  apercu?: string;
  photo?: Blob;
  vignette?: Blob | null;
  largeur?: number;
  hauteur?: number;
};

/** Une position de moins de cinq minutes vaut pour la photo qu'on prend. */
const FRAICHEUR_POSITION_MS = 5 * 60_000;
const ATTENTES_MS = [2_000, 6_000];

/** L'envoi d'une photo de chantier : la route de l'outil terrain. */
const poster = (fd: FormData, progres: (p: number) => void) => posterFormulaire("/api/terrain/photos", fd, progres);

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Le stockage de l'onglet ne change que par nous : rien à écouter. */
const sansAbonnement = () => () => undefined;

export default function Capture({
  dossierId,
  refDossier,
  photosInitiales,
  agentId,
  bureau,
  auteur,
  delaiRetraitMin,
}: {
  dossierId: number;
  refDossier: string;
  photosInitiales: PhotoVue[];
  agentId: number | null;
  bureau: boolean;
  auteur: string;
  delaiRetraitMin: number;
}) {
  const router = useRouter();
  const [choisie, setChoisie] = useState<Categorie | null>(null);
  const [note, setNote] = useState("");
  const [noteOuverte, setNoteOuverte] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [etatPosition, setEtatPosition] = useState<EtatPosition>("inconnu");
  const surveillance = useRef<number | null>(null);

  // La file : la vérité est dans la référence (lue par la boucle d'envoi), l'état n'en est que le reflet.
  const fileRef = useRef<Item[]>([]);
  const [file, setFile] = useState<Item[]>([]);
  const changer = useCallback((f: (l: Item[]) => Item[]) => {
    fileRef.current = f(fileRef.current);
    setFile(fileRef.current);
  }, []);
  const maj = useCallback((cle: string, patch: Partial<Item>) => changer((l) => l.map((i) => (i.cle === cle ? { ...i, ...patch } : i))), [changer]);

  const [ajoutees, setAjoutees] = useState<PhotoVue[]>([]);
  const [retirees, setRetirees] = useState<Set<number>>(new Set());
  const [filtre, setFiltre] = useState<Categorie | "toutes">("toutes");
  const [ouverte, setOuverte] = useState<number | null>(null);

  // La catégorie choisie reste la même en revenant sur le dossier (le temps de l'onglet) ; « Avant » sinon.
  const cleCategorie = `bailly-terrain-categorie-${dossierId}`;
  const memorisee = useSyncExternalStore(
    sansAbonnement,
    () => {
      try {
        const c = sessionStorage.getItem(cleCategorie);
        return c === "avant" || c === "apres" || c === "detail" ? c : null;
      } catch {
        return null; // stockage indisponible (navigation privée)
      }
    },
    () => null,
  );
  const categorie: Categorie = choisie ?? memorisee ?? "avant";
  const choisirCategorie = (c: Categorie) => {
    setChoisie(c);
    try {
      sessionStorage.setItem(cleCategorie, c);
    } catch {
      // Sans stockage, le choix vaut pour la page.
    }
  };

  // L'horloge de la page, pour savoir si une photo se retire encore : relue toutes les 30 secondes.
  const [maintenant, setMaintenant] = useState<number | null>(null);
  useEffect(() => {
    const lire = () => setMaintenant(Date.now());
    const premier = setTimeout(lire, 0);
    const suite = setInterval(lire, 30_000);
    return () => {
      clearTimeout(premier);
      clearInterval(suite);
    };
  }, []);

  // ─── La position ───
  const suivrePosition = useCallback(() => {
    if (!("geolocation" in navigator)) return setEtatPosition("indisponible");
    if (surveillance.current !== null) return;
    setEtatPosition("recherche");
    surveillance.current = navigator.geolocation.watchPosition(
      (p) => {
        setPosition({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy, a: Date.now() });
        setEtatPosition("ok");
      },
      (e) => {
        if (e.code === e.PERMISSION_DENIED) {
          setEtatPosition("refusee");
          if (surveillance.current !== null) navigator.geolocation.clearWatch(surveillance.current);
          surveillance.current = null;
        } else setEtatPosition((avant) => (avant === "ok" ? "ok" : "indisponible"));
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    );
  }, []);

  useEffect(() => {
    // Sans géolocalisation, le bouton « Joindre ma position » le dira au premier geste.
    if (!("geolocation" in navigator)) return;
    // Déjà autorisée : on la suit sans rien demander. Sinon, on attend le geste du déménageur.
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((st) => {
        if (st.state === "granted") suivrePosition();
        else if (st.state === "denied") setEtatPosition("refusee");
      })
      .catch(() => undefined);
    return () => {
      if (surveillance.current !== null) navigator.geolocation.clearWatch(surveillance.current);
      surveillance.current = null;
    };
  }, [suivrePosition]);

  // ─── La boucle d'envoi ───
  const tourne = useRef(false);
  const [accuse, setAccuse] = useState(false);
  const accuseMinuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (accuseMinuteur.current) clearTimeout(accuseMinuteur.current);
    },
    [],
  );

  const traiter = useCallback(
    async (cle: string) => {
      const lire = () => fileRef.current.find((i) => i.cle === cle);
      let it = lire();
      if (!it) return;
      if (!it.photo) {
        maj(cle, { etat: "preparation" });
        const prep = await preparer(it.fichier);
        maj(cle, { ...prep, apercu: prep.vignette ? URL.createObjectURL(prep.vignette) : undefined });
        it = lire();
        if (!it) return;
      }
      if (!it.photo || it.photo.size > PLAFOND_PHOTO) {
        maj(cle, { etat: "echec", erreur: "Photo trop lourde (15 Mo au plus).", reseau: false });
        return;
      }
      for (let essai = 0; ; essai++) {
        it = lire();
        if (!it?.photo) return; // retirée de la file entre-temps
        maj(cle, { etat: "envoi", progression: 0, essai, erreur: undefined });
        const fd = new FormData();
        fd.set("cle", it.cle);
        fd.set("dossier", String(dossierId));
        fd.set("categorie", it.categorie);
        if (it.note) fd.set("note", it.note);
        if (it.position) {
          fd.set("lat", String(it.position.lat));
          fd.set("lng", String(it.position.lng));
          fd.set("precision", String(Math.round(it.position.precision)));
        }
        if (it.priseAppareil) fd.set("prise_appareil", String(it.priseAppareil));
        if (it.largeur) fd.set("largeur", String(it.largeur));
        if (it.hauteur) fd.set("hauteur", String(it.hauteur));
        fd.set("photo", it.photo, it.photo.type === "image/jpeg" ? `${it.cle}.jpg` : it.fichier.name);
        if (it.vignette) fd.set("vignette", it.vignette, `${it.cle}-v.jpg`);

        const r = await poster(fd, (p) => maj(cle, { progression: p }));
        if ((r.statut === 200 || r.statut === 201) && r.corps?.id) {
          maj(cle, { etat: "ok", progression: 1 });
          const recue = r.corps.priseLe ?? new Date().toISOString();
          const pos = it.position;
          setAjoutees((l) => [
            {
              id: r.corps!.id!,
              categorie: it!.categorie,
              note: it!.note,
              auteur,
              equipe: null,
              agentId,
              priseLe: recue,
              priseAppareil: it!.priseAppareil ? new Date(it!.priseAppareil).toISOString() : null,
              jour: recue.slice(0, 10),
              latitude: pos?.lat ?? null,
              longitude: pos?.lng ?? null,
              precision: pos?.precision ?? null,
              vignette: !!it!.vignette,
              demo: false,
            },
            ...l,
          ]);
          return;
        }
        const reseau = r.statut === 0;
        const passager = reseau || r.statut === 408 || r.statut === 429 || r.statut >= 500;
        if (passager && essai < ATTENTES_MS.length) {
          maj(cle, { etat: "attente", erreur: reseau ? "Réseau coupé : nouvel essai…" : "Le serveur hésite : nouvel essai…" });
          await attendre(ATTENTES_MS[essai]);
          continue;
        }
        maj(cle, {
          etat: "echec",
          reseau,
          erreur:
            r.corps?.erreur ??
            (reseau ? "Pas de réseau : la photo est gardée ici et repartira au retour du réseau. Ne fermez pas la page." : `Envoi refusé (erreur ${r.statut}).`),
        });
        return;
      }
    },
    [agentId, auteur, dossierId, maj],
  );

  const lancer = useCallback(async () => {
    if (tourne.current) return;
    tourne.current = true;
    try {
      for (;;) {
        const suivante = fileRef.current.find((i) => i.etat === "attente" && !i.erreur);
        if (!suivante) break;
        await traiter(suivante.cle);
      }
    } finally {
      tourne.current = false;
    }
    // Tout est parti : la page se met à jour (compteurs, galerie) depuis le serveur, et le dock le dit quelques secondes.
    // Pas de mise à jour s'il reste une photo en échec : sans réseau, Next rechargerait la page entière, et la file
    // (les photos pas encore envoyées) serait perdue. La galerie montre déjà celles qui sont parties.
    if (fileRef.current.length && fileRef.current.every((i) => i.etat === "ok")) {
      router.refresh();
      setAccuse(true);
      if (accuseMinuteur.current) clearTimeout(accuseMinuteur.current);
      accuseMinuteur.current = setTimeout(() => setAccuse(false), 5000);
    }
  }, [router, traiter]);

  const reessayer = useCallback(
    (cles?: string[]) => {
      changer((l) => l.map((i) => (i.etat === "echec" && (!cles || cles.includes(i.cle)) ? { ...i, etat: "attente", erreur: undefined, progression: 0 } : i)));
      void lancer();
    },
    [changer, lancer],
  );

  // Le réseau revient : les photos tombées faute de réseau repartent d'elles-mêmes.
  useEffect(() => {
    const revenu = () => reessayer(fileRef.current.filter((i) => i.etat === "echec" && i.reseau).map((i) => i.cle));
    window.addEventListener("online", revenu);
    return () => window.removeEventListener("online", revenu);
  }, [reessayer]);

  // Une photo pas encore partie (en cours ou en échec) se perdrait en quittant la page : le navigateur le rappelle.
  const enCours = file.some((i) => i.etat !== "ok");
  useEffect(() => {
    if (!enCours) return;
    const avant = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", avant);
    return () => window.removeEventListener("beforeunload", avant);
  }, [enCours]);

  // Les aperçus libèrent leur mémoire en quittant la page.
  useEffect(
    () => () => {
      for (const i of fileRef.current) if (i.apercu) URL.revokeObjectURL(i.apercu);
    },
    [],
  );

  function choisir(e: React.ChangeEvent<HTMLInputElement>) {
    const fichiers = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!fichiers.length) return;
    const pos = position && Date.now() - position.a < FRAICHEUR_POSITION_MS ? position : null;
    const laNote = note.replace(/\s+/g, " ").trim().slice(0, PLAFOND_NOTE) || null;
    const items: Item[] = fichiers
      .filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name))
      .map((f) => ({
        cle: nouvelleCle(),
        fichier: f,
        categorie,
        note: laNote,
        position: pos,
        priseAppareil: f.lastModified || null,
        etat: "attente",
        progression: 0,
        essai: 0,
      }));
    if (!items.length) return;
    changer((l) => [...l, ...items]);
    // La note valait pour ces photos-là : la suivante repart sans.
    setNote("");
    setNoteOuverte(false);
    setAccuse(false);
    void lancer();
  }

  const retirerDeLaFile = (cle: string) =>
    changer((l) => {
      const i = l.find((x) => x.cle === cle);
      if (i?.apercu) URL.revokeObjectURL(i.apercu);
      return l.filter((x) => x.cle !== cle);
    });

  // ─── La galerie du dossier ───
  const photos = useMemo(() => {
    const vues = new Map<number, PhotoVue>();
    for (const p of [...ajoutees, ...photosInitiales]) if (!vues.has(p.id) && !retirees.has(p.id)) vues.set(p.id, p);
    return [...vues.values()].sort((a, b) => b.priseLe.localeCompare(a.priseLe) || b.id - a.id);
  }, [ajoutees, photosInitiales, retirees]);
  const nouvelles = useMemo(() => new Set(ajoutees.map((p) => p.id)), [ajoutees]);
  const visibles = filtre === "toutes" ? photos : photos.filter((p) => p.categorie === filtre);
  const parCategorie = (c: Categorie) => photos.filter((p) => p.categorie === c).length;

  const peutRetirer = (p: PhotoVue) =>
    bureau || (maintenant !== null && agentId !== null && p.agentId === agentId && maintenant - new Date(p.priseLe).getTime() < delaiRetraitMin * 60_000);

  async function retirer(p: PhotoVue) {
    if (!window.confirm("Retirer cette photo du dossier ?")) return;
    // La visionneuse se ferme d'abord : elle ne redemande pas une photo en train de disparaître.
    setOuverte(null);
    const r = await retirerPhoto(p.id).catch(() => ({ ok: false as const, erreur: "Pas de réseau : la photo n'a pas été retirée. Réessayez." }));
    if (!r.ok) {
      window.alert(r.erreur);
      return;
    }
    setRetirees((avant) => new Set(avant).add(p.id));
    router.refresh();
  }

  const envoyees = file.filter((i) => i.etat === "ok").length;
  const echecs = file.filter((i) => i.etat === "echec");
  const actives = file.filter((i) => i.etat !== "ok");
  const enRoute = file.filter((i) => i.etat === "attente" || i.etat === "preparation" || i.etat === "envoi");
  // La progression du lot : chaque photo pèse autant, celles déjà parties comptent pleines.
  const lot = file.filter((i) => i.etat !== "echec");
  const avancement = lot.length ? lot.reduce((t, i) => t + (i.etat === "ok" ? 1 : i.etat === "envoi" ? i.progression : 0), 0) / lot.length : 0;

  /* L'état de l'envoi, dans le dock, sous le pouce : sans faire défiler, on sait si c'est parti. */
  const etatDock =
    echecs.length > 0 && enRoute.length === 0 ? (
      <div className={`${s.etatDock} ${s.etatDockEchec}`} role="status">
        <Picto nom="alerte" taille={20} />
        <span>
          {echecs.length} photo{echecs.length > 1 ? "s" : ""} non envoyée{echecs.length > 1 ? "s" : ""}
        </span>
        <button type="button" className={s.etatDockBouton} onClick={() => reessayer()}>
          Renvoyer
        </button>
      </div>
    ) : enRoute.length > 0 ? (
      <div className={s.etatDock} role="status">
        <span className={s.etatDockTexte}>
          Envoi de {enRoute.length} photo{enRoute.length > 1 ? "s" : ""}… <b>{Math.round(avancement * 100)} %</b>
        </span>
        <span className={s.progres}>
          <i style={{ width: `${Math.max(4, Math.round(avancement * 100))}%` }} />
        </span>
      </div>
    ) : accuse && envoyees > 0 ? (
      <div className={`${s.etatDock} ${s.etatDockOk}`} role="status">
        <Picto nom="coche" taille={20} />
        <span>
          {envoyees} photo{envoyees > 1 ? "s" : ""} envoyée{envoyees > 1 ? "s" : ""} au dossier
        </span>
      </div>
    ) : null;

  const piluleNote = (
    <button type="button" className={`${s.pilule} ${noteOuverte || note ? s.piluleActive : ""}`} onClick={() => setNoteOuverte((o) => !o)} aria-expanded={noteOuverte}>
      <Picto nom="note" taille={18} />
      {note ? "Note jointe" : "Note"}
    </button>
  );
  const pilulePosition =
    etatPosition === "ok" && position ? (
      <span className={`${s.pilule} ${s.piluleOk}`}>
        <Picto nom="position" taille={18} />
        Position jointe · {Math.round(position.precision)} m près
      </span>
    ) : etatPosition === "recherche" ? (
      <span className={s.pilule}>
        <Picto nom="position" taille={18} />
        Recherche de la position…
      </span>
    ) : etatPosition === "refusee" ? (
      <span className={`${s.pilule} ${s.piluleRefus}`} title="Le téléphone refuse la position : les photos partent sans.">
        <Picto nom="position" taille={18} />
        Position refusée
      </span>
    ) : etatPosition === "indisponible" ? (
      <button type="button" className={`${s.pilule} ${s.piluleRefus}`} onClick={suivrePosition}>
        <Picto nom="position" taille={18} />
        Position indisponible
      </button>
    ) : (
      <button type="button" className={s.pilule} onClick={suivrePosition}>
        <Picto nom="position" taille={18} />
        Joindre ma position
      </button>
    );

  return (
    <>
      {(actives.length > 0 || envoyees > 0) && (
        <section className={s.file} aria-label="Envoi des photos" aria-live="polite">
          {envoyees > 0 && (
            <div className={s.recu}>
              <Picto nom="coche" />
              {envoyees} photo{envoyees > 1 ? "s" : ""} envoyée{envoyees > 1 ? "s" : ""} au dossier
            </div>
          )}
          {echecs.length > 1 && (
            <div className={s.alerteLigne}>
              <span>
                {echecs.length} photos en attente d&apos;envoi
              </span>
              <button type="button" className={s.petitBouton} onClick={() => reessayer()}>
                <Picto nom="recharger" taille={18} />
                Tout renvoyer
              </button>
            </div>
          )}
          {actives.map((i) => (
            <div key={i.cle} className={`${s.envoi} ${i.etat === "echec" ? s.envoiEchec : ""}`}>
              <span className={s.apercu} style={i.apercu ? { backgroundImage: `url(${i.apercu})` } : undefined}>
                {!i.apercu && <Picto nom="appareil" />}
              </span>
              <span className={s.envoiTexte}>
                <b>
                  {libelleCategorie(i.categorie)}
                  {i.note ? " · avec une note" : ""}
                </b>
                {(i.etat === "envoi" || i.etat === "preparation") && (
                  <span className={`${s.progres} ${i.etat === "preparation" ? s.progresAttente : ""}`}>
                    <i style={{ width: `${Math.round(i.progression * 100)}%` }} />
                  </span>
                )}
                <small>
                  {i.etat === "preparation"
                    ? "Préparation de la photo…"
                    : i.etat === "envoi"
                      ? `Envoi… ${Math.round(i.progression * 100)} %${i.essai > 0 ? ` (essai ${i.essai + 1})` : ""}`
                      : i.etat === "attente"
                        ? (i.erreur ?? "En attente")
                        : i.erreur}
                </small>
              </span>
              {i.etat === "echec" ? (
                <span style={{ display: "flex", gap: 6 }}>
                  <button type="button" className={s.petitBouton} onClick={() => reessayer([i.cle])} aria-label="Renvoyer cette photo">
                    <Picto nom="recharger" taille={20} />
                  </button>
                  <button type="button" className={`${s.petitBouton} ${s.petitBoutonDoux}`} onClick={() => retirerDeLaFile(i.cle)} aria-label="Abandonner cette photo">
                    <Picto nom="croix" taille={20} />
                  </button>
                </span>
              ) : (
                <span />
              )}
            </div>
          ))}
        </section>
      )}

      <section aria-label="Photos du dossier">
        <div className={s.rubrique}>
          <h2>
            Photos du chantier
            <small>{photos.length ? `${photos.length} au dossier ${refDossier}` : "Aucune pour l'instant"}</small>
          </h2>
        </div>
        {photos.length === 0 ? (
          <div className={s.vide}>
            <span className={s.videPicto}>
              <Picto nom="appareil" taille={26} />
            </span>
            <b>Pas encore de photo</b>
            <p>Choisissez avant, après ou détail en bas de l&apos;écran, puis prenez la photo : elle part au dossier.</p>
          </div>
        ) : (
          <>
            <div className={s.filtres} role="group" aria-label="Filtrer les photos">
              <button type="button" className={s.filtre} aria-pressed={filtre === "toutes"} onClick={() => setFiltre("toutes")}>
                Toutes <em>{photos.length}</em>
              </button>
              {CATEGORIES.map((c) => (
                <button key={c.cle} type="button" className={s.filtre} aria-pressed={filtre === c.cle} onClick={() => setFiltre(c.cle)}>
                  {c.label} <em>{parCategorie(c.cle)}</em>
                </button>
              ))}
            </div>
            {visibles.length === 0 ? (
              <p className={s.aide}>Aucune photo dans cette catégorie.</p>
            ) : (
              <div className={s.grille}>
                {visibles.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`${s.vignette} ${nouvelles.has(p.id) ? s.vignetteNouvelle : ""}`}
                    onClick={() => setOuverte(i)}
                    aria-label={`${libelleCategorie(p.categorie)}, ${heureParis(p.priseLe)}, par ${p.auteur}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- une URL signée d'une minute, servie par la porte des photos : pas d'optimisation d'image */}
                    <img src={urlPhoto(p.id, { vignette: true })} alt="" loading="lazy" decoding="async" />
                    <span className={s.vignetteEtiquette}>
                      {libelleCategorie(p.categorie)} · {heureParis(p.priseLe)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {ouverte !== null && visibles[ouverte] && (
        <Visionneuse
          photos={visibles}
          index={ouverte}
          onFermer={() => setOuverte(null)}
          onAller={setOuverte}
          actions={(p) =>
            peutRetirer(p) ? (
              <button type="button" className={`${v.bouton} ${v.danger}`} onClick={() => retirer(p)}>
                <Picto nom="poubelle" taille={19} />
                Retirer
              </button>
            ) : null
          }
        />
      )}

      <div className={s.dock}>
        <div className={s.dockInterieur}>
          {etatDock}
          {noteOuverte && (
            <textarea
              className={s.note}
              value={note}
              maxLength={PLAFOND_NOTE}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Une précision pour les prochaines photos (facultatif)"
              aria-label="Note jointe aux prochaines photos"
              autoFocus
            />
          )}
          <div className={s.categories} role="group" aria-label="Catégorie des prochaines photos">
            {CATEGORIES.map((c) => (
              <button key={c.cle} type="button" className={s.categorie} aria-pressed={categorie === c.cle} onClick={() => choisirCategorie(c.cle)}>
                {c.label}
              </button>
            ))}
          </div>
          <div className={s.options}>
            {piluleNote}
            {pilulePosition}
          </div>
          <div className={s.declencheurs}>
            <label className={s.declencheur}>
              <input type="file" accept="image/*" capture="environment" multiple className={s.cache} onChange={choisir} />
              <Picto nom="appareil" taille={28} />
              Photo « {libelleCategorie(categorie).toLowerCase()} »
            </label>
            <label className={s.depuisGalerie} aria-label="Choisir des photos dans la galerie du téléphone">
              <input type="file" accept="image/*" multiple className={s.cache} onChange={choisir} />
              <Picto nom="galerie" taille={27} />
            </label>
          </div>
        </div>
      </div>
    </>
  );
}

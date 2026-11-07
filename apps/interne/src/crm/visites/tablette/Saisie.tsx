"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Picto, type NomPicto } from "@/terrain/composants/Picto";
import { nouvelleCle } from "@/terrain/composants/photo-navigateur";
import {
  ACCES_ESCALIER, ACCES_MONTE_MEUBLE, ACCES_POIDS_LOURD, ACCES_STATIONNEMENT, FORMULES, GENRE_ETAPE, PLAFONDS,
  m3, m3Fin, plageVisite, jourVisite, volumeObjets,
  type CleFormule, type EtapeAcces, type ObjetSaisi, type PieceSaisie,
} from "@/lib/visite/regles";
import { volumePiece, type EtatSaisie } from "./etat";
import { useEnregistrement, type Statut } from "./useEnregistrement";
import { usePhotos, type PhotoTablette } from "./usePhotos";
import { urlPhotoVisite } from "./etat";
import s from "./tablette.module.css";

/*
 * La saisie de la visite, sur la tablette : à gauche les pièces (et les
 * accès, les options), à droite la pièce ouverte — son métré, ses photos, sa
 * remarque. En portrait, les pièces passent en bandeau au-dessus.
 *
 * Tout se tape au doigt : les meubles courants s'ajoutent d'une touche depuis
 * le catalogue du questionnaire (volumes indicatifs), la quantité se règle
 * au pas, le volume unitaire reste modifiable. Le volume total se recalcule
 * à chaque geste ; le serveur le recalcule aussi, et c'est lui qui le garde.
 */

type Catalogue = { label: string; volume: number; groupe: string }[];

export interface ProprietesSaisie {
  visiteId: number;
  initiale: EtatSaisie;
  volumeInitial: number;
  dossier: { ref: string; client: string; contact: string | null; telephone: string | null; adresse: string | null };
  rdv: { debut: string; duree_min: number; type: string } | null;
  commercial: string | null;
  photos: { id: number; cle: string; piece: string | null; vignette: boolean }[];
  catalogue: Catalogue;
}

type Vue = { genre: "piece"; cle: string } | { genre: "acces" } | { genre: "options" };

const PIECES_COURANTES = ["Entrée", "Salon", "Salle à manger", "Cuisine", "Chambre", "Salle de bain", "Bureau", "Cave", "Garage", "Balcon"];
const GROUPES = ["Salon", "Chambre", "Cuisine", "Divers", "Cartons"];

/** Le groupe du catalogue qui va avec une pièce : « Chambre 2 » → Chambre. */
function groupeDe(nom: string) {
  const n = nom.toLowerCase();
  if (/salon|séjour|sejour|salle à manger|salle a manger|living/.test(n)) return "Salon";
  if (/chambre|dressing/.test(n)) return "Chambre";
  if (/cuisine|cellier|buanderie/.test(n)) return "Cuisine";
  return "Divers";
}

/** Un nom libre : « Chambre », puis « Chambre 2 »… */
function nomLibre(base: string, pieces: PieceSaisie[]) {
  const pris = new Set(pieces.map((p) => p.nom.toLowerCase()));
  if (!pris.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) if (!pris.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
}

const nombre = (v: string) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export default function Saisie(p: ProprietesSaisie) {
  const router = useRouter();
  const { etat, agir, statut, enAttente, dernier, volumeServeur, enLigne, vider } = useEnregistrement(p.visiteId, p.initiale, p.volumeInitial);
  const ph = usePhotos(p.visiteId, p.photos, vider);
  const [choisie, setVue] = useState<Vue>(() => (p.initiale.pieces[0] ? { genre: "piece", cle: p.initiale.pieces[0].cle } : { genre: "acces" }));
  const [ajoutPiece, setAjoutPiece] = useState(p.initiale.pieces.length === 0);
  const [depart, setDepart] = useState<string | null>(null);

  const volume = volumeObjets(etat.objets);
  // Une pièce retirée (ici ou par la reprise) : la vue revient à la première pièce.
  const existe = choisie.genre !== "piece" || etat.pieces.some((x) => x.cle === choisie.cle);
  const vue: Vue = existe ? choisie : etat.pieces[0] ? { genre: "piece", cle: etat.pieces[0].cle } : { genre: "acces" };
  const piece = vue.genre === "piece" ? etat.pieces.find((x) => x.cle === vue.cle) ?? null : null;

  // Signée ailleurs entre-temps : la page du compte-rendu le montre.
  useEffect(() => {
    if (statut === "signee") router.replace(`/tablette/${p.visiteId}/signature`);
  }, [statut, router, p.visiteId]);

  function creerPiece(base: string) {
    const nom = nomLibre(base.trim().slice(0, PLAFONDS.nom) || "Pièce", etat.pieces);
    const cle = nouvelleCle();
    const ordre = (etat.pieces.at(-1)?.ordre ?? 0) + 1;
    agir({ t: "piece", cle, nom, ordre, remarque: null });
    setVue({ genre: "piece", cle });
    setAjoutPiece(false);
  }

  async function versCompteRendu() {
    setDepart("Enregistrement de la saisie…");
    if (ph.enCours) {
      setDepart("Des photos partent encore : un instant.");
      return;
    }
    const ok = await vider();
    if (!ok) {
      setDepart(`${enAttente || "Des"} modification${enAttente > 1 ? "s" : ""} pas encore enregistrée${enAttente > 1 ? "s" : ""} : vérifiez la connexion, puis réessayez.`);
      return;
    }
    router.push(`/tablette/${p.visiteId}/signature`);
  }

  const nbPhotos = (cle: string) => ph.photos.filter((x) => x.piece === cle).length;

  return (
    <div className={s.saisie}>
      <header className={s.barre}>
        <Link href="/tablette" className={s.retour} aria-label="Retour aux visites">
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
          <small>Volume</small>
          <b>{m3(volume)}</b>
          {Math.abs(volume - volumeServeur) > 0.005 && statut === "enregistre" ? <em>serveur : {m3(volumeServeur)}</em> : null}
        </div>
        <button type="button" className={s.boutonCr} onClick={versCompteRendu}>
          <Picto nom="plume" taille={20} />
          Compte-rendu
        </button>
      </header>
      {depart && (
        <p className={s.bandeauInfo} role="status">
          {depart}
          <button type="button" onClick={() => setDepart(null)} aria-label="Fermer">
            <Picto nom="croix" taille={18} />
          </button>
        </p>
      )}

      <div className={s.corps}>
        <nav className={s.rail} aria-label="Pièces et rubriques">
          <p className={s.railTitre}>
            Pièces <span>{etat.pieces.length}</span>
          </p>
          <ul className={s.railListe}>
            {etat.pieces.map((x) => {
              const objets = etat.objets.filter((o) => o.piece === x.cle);
              const actif = vue.genre === "piece" && vue.cle === x.cle;
              return (
                <li key={x.cle}>
                  <button type="button" className={`${s.railPiece} ${actif ? s.actif : ""}`} onClick={() => setVue({ genre: "piece", cle: x.cle })} aria-current={actif}>
                    <span className={s.railNom}>{x.nom}</span>
                    <span className={s.railDetail}>
                      {objets.reduce((n, o) => n + o.quantite, 0)} obj. · {nbPhotos(x.cle)} photo{nbPhotos(x.cle) > 1 ? "s" : ""}
                    </span>
                    <span className={s.railVolume}>{m3(volumePiece(etat.objets, x.cle))}</span>
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
              catalogue={p.catalogue}
              agir={agir}
              onPhotos={(f) => ph.ajouter(piece.cle, f)}
              onRenvoyer={ph.renvoyer}
              onRetirerPhoto={ph.retirer}
              onRetirer={() => {
                agir({ t: "piece-", cle: piece.cle });
                ph.oublierPiece(piece.cle);
              }}
            />
          ) : vue.genre === "acces" ? (
            <PanneauAcces etapes={etat.etapes} agir={agir} />
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
  const heure = dernier ? new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(dernier)) : null;
  const vue: Record<Statut, { ton: string; icone: NomPicto; texte: string; sous?: string }> = {
    enregistre: { ton: s.ok, icone: "nuage", texte: "Enregistré", sous: heure ? `à ${heure}` : "Tout est au serveur" },
    modifie: { ton: s.neutre, icone: "nuage", texte: "Modifications…", sous: `${enAttente} à envoyer` },
    envoi: { ton: s.neutre, icone: "recharger", texte: "Enregistrement…", sous: `${enAttente} en cours` },
    erreur: { ton: s.alerte, icone: "recharger", texte: "Nouvel essai…", sous: `${enAttente} gardée${enAttente > 1 ? "s" : ""} ici` },
    hors_ligne: { ton: s.alerte, icone: "horsLigne", texte: "Hors connexion", sous: `${enAttente} gardée${enAttente > 1 ? "s" : ""} sur la tablette` },
    session: { ton: s.danger, icone: "alerte", texte: "Session expirée", sous: "Reconnectez-vous : rien n'est perdu" },
    signee: { ton: s.ok, icone: "coche", texte: "Compte-rendu signé" },
  };
  const v = statut === "enregistre" && !enLigne ? vue.hors_ligne : vue[statut];
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

// --- Une pièce ------------------------------------------------------------------------------------------

function PanneauPiece({
  piece, objets, photos, catalogue, agir, onPhotos, onRenvoyer, onRetirerPhoto, onRetirer,
}: {
  piece: PieceSaisie;
  objets: ObjetSaisi[];
  photos: PhotoTablette[];
  catalogue: Catalogue;
  agir: ReturnType<typeof useEnregistrement>["agir"];
  onPhotos: (f: File[]) => void;
  onRenvoyer: (p: PhotoTablette) => void;
  onRetirerPhoto: (p: PhotoTablette) => void;
  onRetirer: () => void;
}) {
  const [groupe, setGroupe] = useState(() => groupeDe(piece.nom));
  const [confirmer, setConfirmer] = useState(false);
  const [nom, setNom] = useState(piece.nom);
  const proposes = useMemo(() => catalogue.filter((c) => c.groupe === groupe), [catalogue, groupe]);
  const volume = Math.round(objets.reduce((n, o) => n + o.quantite * o.volume, 0) * 100) / 100;
  const majPiece = (patch: Partial<PieceSaisie>) => agir({ t: "piece", ...piece, ...patch });
  const majObjet = (o: ObjetSaisi, patch: Partial<ObjetSaisi>) => agir({ t: "objet", ...o, ...patch });

  function ajouter(libelle: string, vol: number) {
    const meme = objets.find((o) => o.libelle.toLowerCase() === libelle.toLowerCase() && o.volume === vol);
    if (meme) majObjet(meme, { quantite: Math.min(PLAFONDS.quantite, meme.quantite + 1) });
    else agir({ t: "objet", cle: nouvelleCle(), piece: piece.cle, libelle: libelle.slice(0, PLAFONDS.libelle), quantite: 1, volume: vol, demontage: false, fragile: false, note: null });
  }

  useEffect(() => {
    if (!confirmer) return;
    const t = window.setTimeout(() => setConfirmer(false), 3500);
    return () => window.clearTimeout(t);
  }, [confirmer]);

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
          <small>Volume de la pièce</small>
          <b>{m3(volume)}</b>
        </div>
        <button type="button" className={`${s.boutonDoux} ${confirmer ? s.boutonDanger : ""}`} onClick={() => (confirmer ? onRetirer() : setConfirmer(true))}>
          <Picto nom="poubelle" taille={18} />
          {confirmer ? `Retirer la pièce${objets.length ? ` et ses ${objets.length} objets` : ""} ?` : "Retirer"}
        </button>
      </div>

      <section className={s.bloc} aria-label="Ajout rapide">
        <div className={s.blocTete}>
          <h2>Ajouter un meuble</h2>
          <div className={s.onglets} role="tablist">
            {GROUPES.map((g) => (
              <button key={g} type="button" role="tab" aria-selected={g === groupe} className={g === groupe ? s.ongletActif : ""} onClick={() => setGroupe(g)}>
                {g}
              </button>
            ))}
          </div>
        </div>
        <div className={s.catalogue}>
          {proposes.map((c) => {
            const deja = objets.find((o) => o.libelle === c.label);
            return (
              <button key={c.label} type="button" className={`${s.article} ${deja ? s.articlePris : ""}`} onClick={() => ajouter(c.label, c.volume)}>
                <span>{c.label}</span>
                <small>{m3Fin(c.volume)}</small>
                {deja && <em>{deja.quantite}</em>}
              </button>
            );
          })}
        </div>
        <form
          className={s.objetLibre}
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const libelle = String(fd.get("libelle") ?? "").trim();
            const vol = nombre(String(fd.get("volume") ?? ""));
            if (!libelle || vol == null || vol < 0 || vol > PLAFONDS.volume) return;
            ajouter(libelle, Math.round(vol * 100) / 100);
            e.currentTarget.reset();
          }}
        >
          <input name="libelle" placeholder="Autre objet (piano, aquarium…)" maxLength={PLAFONDS.libelle} aria-label="Objet" required />
          <input name="volume" placeholder="m³" inputMode="decimal" aria-label="Volume unitaire en mètres cubes" required />
          <button type="submit" className={s.boutonPlein}>
            <Picto nom="plus" taille={18} /> Ajouter
          </button>
        </form>
      </section>

      <section className={s.bloc} aria-label="Métré">
        <div className={s.blocTete}>
          <h2>Métré</h2>
          <span className={s.compte}>
            {objets.reduce((n, o) => n + o.quantite, 0)} objet{objets.reduce((n, o) => n + o.quantite, 0) > 1 ? "s" : ""} · {m3(volume)}
          </span>
        </div>
        {objets.length === 0 ? (
          <p className={s.videLigne}>Aucun objet pour l&apos;instant : touchez un meuble ci-dessus.</p>
        ) : (
          <ul className={s.objets}>
            {objets.map((o) => (
              <LigneObjet key={o.cle} o={o} maj={(patch) => majObjet(o, patch)} retirer={() => agir({ t: "objet-", cle: o.cle })} />
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
              <figure key={x.cle} className={`${s.photo} ${x.etat === "echec" ? s.photoEchec : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- photo privée, servie par une URL signée d'une minute */}
                <img src={x.apercu ?? (x.id ? urlPhotoVisite(x.id, x.vignette) : "")} alt={`Photo de la pièce ${piece.nom}`} />
                {(x.etat === "preparation" || x.etat === "envoi") && (
                  <span className={s.progression}>
                    <i style={{ width: `${Math.round(x.progression * 100)}%` }} />
                  </span>
                )}
                {x.etat === "echec" && (
                  <button type="button" className={s.photoRenvoyer} onClick={() => onRenvoyer(x)}>
                    <Picto nom="recharger" taille={18} /> Renvoyer
                  </button>
                )}
                {x.etat === "ok" && (
                  <button type="button" className={s.photoRetirer} onClick={() => onRetirerPhoto(x)} aria-label="Retirer la photo">
                    <Picto nom="croix" taille={16} />
                  </button>
                )}
                {x.erreur && <figcaption>{x.erreur}</figcaption>}
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

function LigneObjet({ o, maj, retirer }: { o: ObjetSaisi; maj: (patch: Partial<ObjetSaisi>) => void; retirer: () => void }) {
  const [volume, setVolume] = useState(String(o.volume).replace(".", ","));
  const [libelle, setLibelle] = useState(o.libelle);
  const [confirmer, setConfirmer] = useState(false);
  useEffect(() => {
    if (!confirmer) return;
    const t = window.setTimeout(() => setConfirmer(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirmer]);
  return (
    <li className={s.objet}>
      <input
        className={s.objetNom}
        value={libelle}
        maxLength={PLAFONDS.libelle}
        onChange={(e) => {
          setLibelle(e.target.value);
          if (e.target.value.trim()) maj({ libelle: e.target.value.trim() });
        }}
        onBlur={() => !libelle.trim() && setLibelle(o.libelle)}
        aria-label="Objet"
      />
      <div className={s.pas} role="group" aria-label="Quantité">
        <button type="button" onClick={() => (o.quantite > 1 ? maj({ quantite: o.quantite - 1 }) : setConfirmer(true))} aria-label="Un de moins">
          <Picto nom="moins" taille={18} />
        </button>
        <b>{o.quantite}</b>
        <button type="button" onClick={() => maj({ quantite: Math.min(PLAFONDS.quantite, o.quantite + 1) })} aria-label="Un de plus">
          <Picto nom="plus" taille={18} />
        </button>
      </div>
      <label className={s.unitaire}>
        <input
          value={volume}
          inputMode="decimal"
          onChange={(e) => {
            setVolume(e.target.value);
            const n = nombre(e.target.value);
            if (n != null && n >= 0 && n <= PLAFONDS.volume) maj({ volume: Math.round(n * 100) / 100 });
          }}
          aria-label="Volume unitaire"
        />
        <span>m³</span>
      </label>
      <b className={s.objetTotal}>{m3(o.quantite * o.volume)}</b>
      <div className={s.bascules}>
        <button type="button" aria-pressed={o.demontage} className={o.demontage ? s.basculeOn : ""} onClick={() => maj({ demontage: !o.demontage })}>
          <Picto nom="outil" taille={16} /> Démontage
        </button>
        <button type="button" aria-pressed={o.fragile} className={o.fragile ? s.basculeOn : ""} onClick={() => maj({ fragile: !o.fragile })}>
          <Picto nom="fragile" taille={16} /> Fragile
        </button>
      </div>
      <button type="button" className={`${s.objetRetirer} ${confirmer ? s.boutonDanger : ""}`} onClick={() => (confirmer ? retirer() : setConfirmer(true))} aria-label={confirmer ? "Confirmer le retrait" : "Retirer l'objet"}>
        {confirmer ? "Retirer ?" : <Picto nom="croix" taille={18} />}
      </button>
    </li>
  );
}

// --- Les accès ------------------------------------------------------------------------------------------

function Choix<K extends string>({ libelle, valeurs, valeur, choisir }: { libelle: string; valeurs: Record<K, string>; valeur: K | null; choisir: (v: K | null) => void }) {
  return (
    <div className={s.choix}>
      <span>{libelle}</span>
      <div role="radiogroup" aria-label={libelle}>
        {(Object.entries(valeurs) as [K, string][]).map(([k, v]) => (
          <button key={k} type="button" role="radio" aria-checked={valeur === k} className={valeur === k ? s.choixOn : ""} onClick={() => choisir(valeur === k ? null : k)}>
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

function PanneauAcces({ etapes, agir }: { etapes: EtapeAcces[]; agir: ReturnType<typeof useEnregistrement>["agir"] }) {
  const maj = (e: EtapeAcces, patch: Partial<EtapeAcces>) => {
    const x = { ...e, ...patch };
    agir({
      t: "etape", id: x.id, etage: x.etage, ascenseur: x.ascenseur, escalier: x.escalier, portage_m: x.portage_m,
      stationnement: x.stationnement, poids_lourd: x.poids_lourd, monte_meuble: x.monte_meuble, acces: x.acces,
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
          <Choix libelle="Escalier" valeurs={ACCES_ESCALIER} valeur={e.escalier} choisir={(v) => maj(e, { escalier: v })} />
          <Choix libelle="Stationnement" valeurs={ACCES_STATIONNEMENT} valeur={e.stationnement} choisir={(v) => maj(e, { stationnement: v })} />
          <Choix libelle="Accès poids lourd" valeurs={ACCES_POIDS_LOURD} valeur={e.poids_lourd} choisir={(v) => maj(e, { poids_lourd: v })} />
          <Choix libelle="Monte-meuble" valeurs={ACCES_MONTE_MEUBLE} valeur={e.monte_meuble} choisir={(v) => maj(e, { monte_meuble: v })} />
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

function PanneauOptions({ etat, agir }: { etat: EtatSaisie; agir: ReturnType<typeof useEnregistrement>["agir"] }) {
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

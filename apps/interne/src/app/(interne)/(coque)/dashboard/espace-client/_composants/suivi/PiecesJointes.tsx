"use client";

import { useMemo, useRef, useState } from "react";
import { deposerDocumentEquipe, supprimerDocument } from "@/lib/actions/espace-client-equipe";
import { CATEGORIES_DOCUMENT_EQUIPE } from "@/lib/espace-client/libelles";
import { TYPES_DOCUMENTS, verifierFichier } from "@/lib/espace-client/schemas";
import { Icone } from "@/ui/icones";
import { Retour, useAction, usePorte } from "../socle";
import { estImage, estPdf, jourCourt, tailleLisible, type Apercable, type DonneesFiche, type FichierVu } from "./outils";
import { Visionneuse } from "./Visionneuse";
import s from "./suivi.module.css";

/*
 * Les pièces jointes d'un dossier : d'abord ce qu'on attend du client (les
 * pièces de sa destination et de son segment), reçu ou non ; puis tous les
 * fichiers du dossier — pièces du client, documents de l'équipe, devis et
 * factures, photos —, à voir dans la page, à télécharger un par un ou tous
 * ensemble (ZIP), et le dépôt d'un document par l'équipe.
 *
 * Chaque adresse est un lien signé de cinq minutes vers la porte de
 * l'équipe : la fiche se relit toutes les quatre minutes (Fiche.tsx) pour
 * qu'un lien affiché soit toujours valable.
 */

type Filtre = "tous" | FichierVu["groupe"];

const vers = (f: FichierVu): Apercable => ({ cle: f.cle, libelle: f.libelle, nom: f.nom, mime: f.mime, lien: f.lien, telecharger: f.telecharger, categorie: f.categorie, par: f.par, le: f.le, taille: f.taille });

/** La vignette d'un fichier : l'image elle-même, sinon une page au type du fichier. */
function Vignette({ f, petite = false }: { f: Pick<FichierVu, "mime" | "lien" | "libelle" | "type">; petite?: boolean }) {
  if (estImage(f.mime) && !petite)
    // eslint-disable-next-line @next/next/no-img-element -- adresse signée qui redirige vers le stockage
    return <img className={s.vignetteImage} src={f.lien} alt="" loading="lazy" />;
  const type = estPdf(f.mime) ? "pdf" : estImage(f.mime) ? "image" : "autre";
  const icone = type === "image" ? "image" : f.type === "facture" ? "facture" : f.type === "devis" ? "devis" : "fichier";
  return petite ? (
    <span className={s.picto} data-type={type} data-genre={f.type}>
      <Icone nom={icone} taille={16} />
    </span>
  ) : (
    <span className={s.vignettePage} data-type={type} data-genre={f.type}>
      <span className={s.feuille}>
        <Icone nom={icone} taille={22} />
        <b>{type === "pdf" ? "PDF" : type === "image" ? "IMAGE" : "FICHIER"}</b>
      </span>
    </span>
  );
}

export function PiecesJointes({ d, recharger, compact = false, lienFiche }: { d: DonneesFiche; recharger: () => void; compact?: boolean; lienFiche?: string }) {
  const { demo } = usePorte();
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [vue, setVue] = useState<{ liste: Apercable[]; i: number } | null>(null);
  const [ajout, setAjout] = useState(false);
  const action = useAction(recharger);

  const liste = useMemo(() => d.fichiers.filter((f) => filtre === "tous" || f.groupe === filtre), [d.fichiers, filtre]);
  const compte = (g: Filtre) => (g === "tous" ? d.fichiers.length : d.fichiers.filter((f) => f.groupe === g).length);
  const ouvrir = (cle: string, parmi: FichierVu[] = d.fichiers) => {
    const i = parmi.findIndex((f) => f.cle === cle);
    if (i >= 0) setVue({ liste: parmi.map(vers), i });
  };
  const retirer = (f: FichierVu) =>
    f.documentId &&
    confirm(`Retirer « ${f.libelle} » de l'espace du client ?\n\nLe fichier est supprimé du stockage et disparaît de son espace. Le geste est noté au journal.`) &&
    action.lancer(() => supprimerDocument(f.documentId!));

  const obligatoires = d.pieces.filter((p) => p.obligatoire);
  const recues = obligatoires.filter((p) => p.depot).length;
  const destination = d.dossier.portee === "international" ? (d.pays[d.dossier.pays_destination] ?? d.dossier.pays_destination) : "France";

  return (
    <div className={s.pj} data-compact={compact ? "" : undefined}>
      {/* 1 · Ce qu'on attend du client. */}
      <div className={s.demandees}>
        <div className={s.blocTete}>
          <div>
            <h3>Pièces demandées au client</h3>
            <p>
              {d.segment.libelle} · {destination}
              {d.pieces.length > obligatoires.length && ` · ${d.pieces.length - obligatoires.length} facultative${d.pieces.length - obligatoires.length > 1 ? "s" : ""}`}
            </p>
          </div>
          {obligatoires.length > 0 && (
            <div className={s.progression} data-complet={recues === obligatoires.length ? "" : undefined}>
              <span>
                <b>{recues}</b> sur {obligatoires.length} reçue{recues > 1 ? "s" : ""}
              </span>
              <span className={s.barre}>
                <i style={{ width: `${(recues / obligatoires.length) * 100}%` }} data-complet={recues === obligatoires.length ? "" : undefined} />
              </span>
            </div>
          )}
        </div>
        {d.pieces.length ? (
          <ul className={s.exigences}>
            {d.pieces.map((p) => (
              <li key={p.id} className={s.exigence} data-etat={p.depot ? "recue" : p.obligatoire ? "manquante" : "facultative"}>
                <span className={s.exigenceIcone}>
                  <Icone nom={p.depot ? "coche" : p.obligatoire ? "alerte" : "horloge"} taille={15} />
                </span>
                <span className={s.exigenceTexte}>
                  <b>
                    {p.libelle}
                    {p.pays && <em>{d.pays[p.pays] ?? p.pays}</em>}
                  </b>
                  {p.description && <small>{p.description}</small>}
                </span>
                {p.depot ? (
                  <span className={s.exigenceFichier}>
                    <button type="button" className={s.puceFichier} onClick={() => ouvrir(`doc:${p.depot!.id}`)} title={`Voir ${p.depot.nom}`}>
                      <Vignette f={{ mime: p.depot.mime, lien: p.depot.lien, libelle: p.libelle, type: "doc" }} petite />
                      <span>
                        <b>{p.depot.nom}</b>
                        <small>
                          Reçue le {jourCourt(p.depot.le)}
                          {tailleLisible(p.depot.taille) && ` · ${tailleLisible(p.depot.taille)}`}
                        </small>
                      </span>
                    </button>
                    <a className={s.boutonIcone} href={p.depot.telecharger} download title="Télécharger" aria-label={`Télécharger ${p.depot.nom}`}>
                      <Icone nom="telecharger" taille={16} />
                    </a>
                  </span>
                ) : (
                  <span
                    className={s.etat}
                    data-etat={p.obligatoire ? "manquante" : "facultative"}
                    title={p.si_concerne ? "Pièce conditionnelle : le CRM ne dit pas encore si ce dossier est concerné. Elle est demandée au client « si vous êtes concerné »." : undefined}
                  >
                    {p.obligatoire ? "Manquante" : p.si_concerne ? "Si concerné" : "Facultative"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className={s.vide}>Aucune pièce n&apos;est demandée pour ce segment et cette destination.</p>
        )}
      </div>

      {/* 2 · Tous les fichiers du dossier. */}
      <div className={s.fichiers}>
        <div className={s.blocTete}>
          <div>
            <h3>Tous les fichiers</h3>
            <p>Déposés par le client ou l&apos;équipe, devis et factures, photos</p>
          </div>
          {!compact && (
            <div className={s.gestes}>
              {d.archive && (
                <a className={s.boutonClair} href={d.archive} download title="Toutes les pièces jointes de ce dossier, en une archive ZIP">
                  <Icone nom="telecharger" taille={16} />
                  Tout télécharger
                  <small>ZIP</small>
                </a>
              )}
              <button type="button" className={ajout ? s.boutonClair : s.boutonPlein} onClick={() => setAjout((x) => !x)} aria-expanded={ajout}>
                <Icone nom={ajout ? "fermer" : "plus"} taille={16} />
                {ajout ? "Fermer" : "Ajouter un document"}
              </button>
            </div>
          )}
        </div>

        {!compact && ajout && <Depot d={d} recharger={recharger} fermer={() => setAjout(false)} />}

        {!compact && d.fichiers.length > 0 && (
          <div className={s.filtres} role="tablist" aria-label="Filtrer les fichiers">
            {([["tous", "Tous"], ...d.groupes.map((g) => [g.cle, g.libelle])] as [Filtre, string][]).map(([cle, libelle]) => (
              <button key={cle} type="button" role="tab" aria-selected={filtre === cle} className={s.filtre} onClick={() => setFiltre(cle)} disabled={cle !== "tous" && !compte(cle)}>
                {libelle}
                <i>{compte(cle)}</i>
              </button>
            ))}
          </div>
        )}

        {d.fichiers.length === 0 ? (
          <p className={s.vide}>Aucun fichier pour l&apos;instant : les pièces du client, les documents de l&apos;équipe, les devis et les photos arriveront ici.</p>
        ) : compact ? (
          <ul className={s.listeFichiers}>
            {d.fichiers.map((f) => (
              <li key={f.cle} className={s.ligneFichier}>
                <button type="button" className={s.ligneFichierNom} onClick={() => ouvrir(f.cle)}>
                  <Vignette f={f} petite />
                  <span>
                    <b>{f.libelle}</b>
                    <small>
                      {f.categorie} · {f.par} · {jourCourt(f.le)}
                      {tailleLisible(f.taille) && ` · ${tailleLisible(f.taille)}`}
                    </small>
                  </span>
                </button>
                <button type="button" className={s.lienDiscret} onClick={() => ouvrir(f.cle)}>
                  <Icone nom="oeil" taille={15} />
                  Aperçu
                </button>
                <a className={s.lienDiscret} href={f.telecharger} download>
                  <Icone nom="telecharger" taille={15} />
                  Télécharger
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <ul className={s.grille}>
            {liste.map((f) => (
              <li key={f.cle} className={s.fichier}>
                <button type="button" className={s.fichierVignette} onClick={() => ouvrir(f.cle, liste)} aria-label={`Aperçu : ${f.libelle}`}>
                  <Vignette f={f} />
                  <span className={s.survol}>
                    <Icone nom="oeil" taille={18} />
                    Aperçu
                  </span>
                </button>
                <div className={s.fichierCorps}>
                  <p className={s.fichierNom} title={`${f.libelle} — ${f.nom}`}>
                    {f.libelle}
                  </p>
                  <p className={s.fichierMeta}>
                    <span className={s.categorie} data-groupe={f.groupe}>
                      {f.categorie}
                    </span>
                  </p>
                  <p className={s.fichierPar}>
                    {f.par} · {jourCourt(f.le)}
                    {tailleLisible(f.taille) && ` · ${tailleLisible(f.taille)}`}
                  </p>
                </div>
                <div className={s.fichierGestes}>
                  <button type="button" onClick={() => ouvrir(f.cle, liste)} title="Aperçu" aria-label={`Aperçu de ${f.libelle}`}>
                    <Icone nom="oeil" taille={16} />
                  </button>
                  <a href={f.telecharger} download title="Télécharger" aria-label={`Télécharger ${f.libelle}`}>
                    <Icone nom="telecharger" taille={16} />
                  </a>
                  {f.source === "equipe" && f.documentId && !demo && (
                    <button type="button" data-danger="" onClick={() => retirer(f)} title="Retirer de l'espace du client" aria-label={`Retirer ${f.libelle}`} disabled={action.enCours}>
                      <Icone nom="corbeille" taille={16} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {compact && (
          <div className={s.compactPied}>
            {d.archive && (
              <a className={s.boutonClair} href={d.archive} download>
                <Icone nom="telecharger" taille={16} />
                Tout télécharger (ZIP)
              </a>
            )}
            {lienFiche && (
              <a className={s.lienFort} href={`${lienFiche}#pieces`}>
                Gérer les pièces dans la fiche de l&apos;espace
                <Icone nom="fleche" taille={15} />
              </a>
            )}
          </div>
        )}
        <Retour r={action.resultat} />
      </div>

      {vue && <Visionneuse fichiers={vue.liste} index={vue.i} changer={(i) => setVue((v) => (v ? { ...v, i } : v))} fermer={() => setVue(null)} />}
    </div>
  );
}

/** Le dépôt d'un document par l'équipe : glisser-déposer ou parcourir, un nom, une catégorie. */
function Depot({ d, recharger, fermer }: { d: DonneesFiche; recharger: () => void; fermer: () => void }) {
  const action = useAction(recharger);
  const form = useRef<HTMLFormElement>(null);
  const champFichier = useRef<HTMLInputElement>(null);
  const [fichier, setFichier] = useState<File | null>(null);
  const [nom, setNom] = useState("");
  const [survol, setSurvol] = useState(false);
  const [locale, setLocale] = useState<string | null>(null);
  const erreurs = action.resultat && !action.resultat.ok ? (action.resultat.erreurs ?? {}) : {};

  const choisir = (f: File | null) => {
    setFichier(f);
    setLocale(f ? verifierFichier(f, TYPES_DOCUMENTS) : null);
    if (f && !nom.trim()) setNom(f.name.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[-_]+/g, " ").trim());
  };

  return (
    <form
      ref={form}
      className={s.depot}
      onSubmit={(e) => {
        e.preventDefault();
        const m = verifierFichier(fichier, TYPES_DOCUMENTS);
        setLocale(m);
        if (m || !fichier) return;
        const fd = new FormData(e.currentTarget);
        fd.set("fichier", fichier);
        action.lancer(
          () => deposerDocumentEquipe(d.dossier.id, fd),
          (r) => {
            if (!r.ok) return;
            form.current?.reset();
            setFichier(null);
            setNom("");
            setTimeout(fermer, 1600);
          },
        );
      }}
    >
      <label
        className={s.zone}
        data-survol={survol ? "" : undefined}
        data-plein={fichier ? "" : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSurvol(false);
          choisir(e.dataTransfer.files?.[0] ?? null);
        }}
      >
        <input ref={champFichier} type="file" accept={TYPES_DOCUMENTS.join(",")} className={s.cache} onChange={(e) => choisir(e.target.files?.[0] ?? null)} />
        <span className={s.zonePicto}>
          <Icone nom={fichier ? "fichier" : "telecharger"} taille={22} />
        </span>
        {fichier ? (
          <span className={s.zoneTexte}>
            <b>{fichier.name}</b>
            <small>{tailleLisible(fichier.size)} · cliquez pour en choisir un autre</small>
          </span>
        ) : (
          <span className={s.zoneTexte}>
            <b>Glissez un fichier ici, ou parcourez</b>
            <small>PDF ou image (JPEG, PNG, HEIC, WebP), 10 Mo au plus</small>
          </span>
        )}
      </label>
      {(locale ?? erreurs.fichier) && <p className={s.erreur}>{locale ?? erreurs.fichier}</p>}
      <div className={s.depotChamps}>
        <label>
          <span>Nom du document, tel que le client le lira</span>
          <input name="libelle" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. : Lettre de voiture" />
          {erreurs.libelle && <em className={s.erreur}>{erreurs.libelle}</em>}
        </label>
        <label>
          <span>Catégorie</span>
          <select name="categorie" defaultValue="autre">
            {CATEGORIES_DOCUMENT_EQUIPE.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={s.depotPied}>
        <button className={s.boutonPlein} disabled={action.enCours || !fichier}>
          <Icone nom="plus" taille={16} />
          {action.enCours ? "Dépôt…" : "Déposer dans son espace"}
        </button>
        <p>Le client est prévenu par e-mail (« Document déposé »){d.mode.envois.mode === "actif" ? "." : " — envoi désactivé : le message est journalisé, rien ne part."}</p>
      </div>
      <Retour r={action.resultat} />
    </form>
  );
}

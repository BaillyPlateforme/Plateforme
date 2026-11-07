"use client";

import { useState, useTransition } from "react";
import { creerColonne, majColonne } from "../actions";
import { capacitePour, dateCourte } from "../outils";
import { GENRES, type Colonne, type ConteneurCrm, type Genre, type Taille } from "../types";
import { Fenetre, type Message } from "./elements";
import { Picto, PICTO_GENRE } from "./Picto";
import s from "./dispatch.module.css";

const STATUTS: Record<string, string> = { preparation: "en préparation", charge: "chargé", en_mer: "en mer", arrive: "arrivé", livre: "livré" };

/**
 * Ajouter ou régler une colonne du Kanban : ce qu'elle représente (un
 * conteneur, une tournée, une date, une zone), son nom, sa destination, sa
 * date, sa capacité, et — pour un conteneur — le conteneur du module
 * Conteneurs auquel elle correspond.
 */
export default function ModaleColonne({
  planId,
  colonne,
  plan,
  conteneurs,
  destinations,
  genreParDefaut,
  onFermer,
  onMessage,
}: {
  planId: number;
  colonne: Colonne | null;
  plan: { capacite20: number; capacite40: number };
  conteneurs: ConteneurCrm[];
  destinations: string[];
  genreParDefaut: Genre;
  onFermer: () => void;
  onMessage: (m: Message) => void;
}) {
  const [genre, setGenre] = useState<Genre>(colonne?.genre ?? genreParDefaut);
  const [taille, setTaille] = useState<Taille>(colonne?.taille ?? "40");
  const [libelle, setLibelle] = useState(colonne?.libelle ?? "");
  const [zone, setZone] = useState(colonne?.zone ?? "");
  const [jour, setJour] = useState(colonne?.jour ?? "");
  const [capacite, setCapacite] = useState(colonne?.capacite != null ? String(colonne.capacite).replace(".", ",") : genreParDefaut === "conteneur" ? String(plan.capacite40) : "");
  const [conteneurId, setConteneurId] = useState<number | null>(colonne?.conteneurId ?? null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const choisirTaille = (t: Taille) => {
    setTaille(t);
    // La capacité suit la taille tant que l'utilisateur ne l'a pas changée à la main.
    const avant = String(capacitePour(taille, plan) ?? "");
    if (!capacite || capacite.replace(",", ".") === avant) setCapacite(String(capacitePour(t, plan)));
  };
  const choisirGenre = (g: Genre) => {
    setGenre(g);
    if (g === "conteneur" && !capacite) setCapacite(String(capacitePour(taille, plan)));
    if (g !== "conteneur" && capacite === String(capacitePour(taille, plan))) setCapacite("");
  };
  const lier = (id: number | null) => {
    setConteneurId(id);
    const tc = conteneurs.find((c) => c.id === id);
    if (!tc) return;
    const t: Taille = /20/.test(tc.taille) ? "20" : "40";
    setTaille(t);
    if (!libelle.trim()) setLibelle(`${tc.numero} · ${t} pieds`);
    // « Fort-de-France (Martinique) » : la zone est le territoire entre parenthèses.
    if (!zone.trim()) setZone(tc.destination.match(/\(([^)]+)\)/)?.[1] ?? tc.destination);
    if (!jour && tc.departPrevu) setJour(tc.departPrevu);
  };

  const enregistrer = (e: React.FormEvent) => {
    e.preventDefault();
    const champs = {
      genre,
      libelle,
      taille: genre === "conteneur" ? taille : null,
      capacite: capacite.trim() || null,
      zone: zone.trim(),
      jour: jour || "",
      conteneurId: genre === "conteneur" ? conteneurId : null,
    };
    demarrer(async () => {
      setErreur(null);
      const r = colonne ? await majColonne(planId, colonne.id, champs) : await creerColonne(planId, champs);
      if (!r.ok) return setErreur(r.erreur);
      onMessage({ texte: colonne ? `« ${libelle.trim()} » mise à jour` : `Colonne « ${libelle.trim()} » ajoutée` });
      onFermer();
    });
  };

  const dateLabel = genre === "conteneur" ? "Départ prévu" : genre === "tournee" ? "Date de la tournée" : genre === "date" ? "Date" : "Date (facultative)";

  return (
    <Fenetre
      titre={colonne ? `Régler « ${colonne.libelle} »` : "Ajouter une colonne"}
      sousTitre="Une colonne représente un conteneur, une tournée, une date ou une zone : chaque client y est une bulle."
      picto={PICTO_GENRE[genre]}
      onFermer={onFermer}
    >
      <form onSubmit={enregistrer} style={{ display: "contents" }}>
        <div className={s.fenetreCorps}>
          <div className={s.grille}>
            <div className={s.champ}>
              <span>Ce que représente la colonne</span>
              <div className={s.choix} role="radiogroup">
                {(Object.keys(GENRES) as Genre[]).map((g) => (
                  <label key={g}>
                    <input type="radio" name="genre" checked={genre === g} onChange={() => choisirGenre(g)} />
                    <Picto nom={PICTO_GENRE[g]} taille={16} /> {GENRES[g].nom}
                  </label>
                ))}
              </div>
            </div>

            {genre === "conteneur" && (
              <>
                <div className={s.champ}>
                  <label htmlFor="tc">Conteneur du module Conteneurs (facultatif)</label>
                  <select id="tc" value={conteneurId ?? ""} onChange={(e) => lier(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">Aucun : conteneur pas encore réservé</option>
                    {conteneurs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.numero} · {c.destination} · {STATUTS[c.statut] ?? c.statut}
                        {c.departPrevu ? ` · départ ${dateCourte(c.departPrevu)}` : ""}
                      </option>
                    ))}
                  </select>
                  <small>Relie la colonne à sa fiche (numéro, plomb, statut) ; le remplissage reste calculé sur ce plan.</small>
                </div>
                <div className={s.champ}>
                  <span>Taille</span>
                  <div className={s.choix} role="radiogroup">
                    {(["20", "40"] as Taille[]).map((t) => (
                      <label key={t}>
                        <input type="radio" name="taille" checked={taille === t} onChange={() => choisirTaille(t)} />
                        {t} pieds <small style={{ color: "inherit", opacity: 0.7 }}>· {String(capacitePour(t, plan)).replace(".", ",")} m³</small>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className={s.champ}>
              <label htmlFor="libelle">Nom de la colonne</label>
              <input
                id="libelle"
                type="text"
                required
                maxLength={80}
                value={libelle}
                onChange={(e) => setLibelle(e.target.value)}
                placeholder={genre === "conteneur" ? "Martinique 2 · 40 pieds" : genre === "tournee" ? "Tournée Fort-de-France nord" : genre === "date" ? "Livraisons du 2 décembre" : "Centre et sud"}
              />
            </div>
            <div className={`${s.champ} ${s.demi}`}>
              <label htmlFor="zone">{genre === "zone" ? "Zone géographique" : "Destination servie"}</label>
              <input id="zone" type="text" list="destinations-plan" value={zone} onChange={(e) => setZone(e.target.value)} placeholder="Martinique" />
              <datalist id="destinations-plan">
                {destinations.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
              <small>Guide la proposition de regroupement.</small>
            </div>
            <div className={`${s.champ} ${s.demi}`}>
              <label htmlFor="jour">{dateLabel}</label>
              <input id="jour" type="date" value={jour} onChange={(e) => setJour(e.target.value)} />
            </div>
            <div className={`${s.champ} ${s.demi}`}>
              <label htmlFor="capacite">Capacité{genre === "conteneur" ? "" : " (facultative)"}</label>
              <div className={s.unite}>
                <input id="capacite" type="text" inputMode="decimal" value={capacite} onChange={(e) => setCapacite(e.target.value)} placeholder="Sans limite" />
                <span>m³</span>
              </div>
            </div>
          </div>
          {genre === "conteneur" && (
            <div className={s.note} style={{ marginTop: 16 }}>
              <Picto nom="alerte" taille={16} />
              <span>
                Les capacités proposées ({String(plan.capacite20).replace(".", ",")} m³ pour un 20 pieds, {String(plan.capacite40).replace(".", ",")} m³ pour un 40 pieds) sont des valeurs
                indicatives — le volume intérieur courant d&apos;un conteneur standard —, à ajuster selon le volume réellement chargeable chez Bailly.
              </span>
            </div>
          )}
          {erreur && (
            <p className={s.erreur} style={{ marginTop: 14 }}>
              {erreur}
            </p>
          )}
        </div>
        <div className={s.fenetrePied}>
          <button type="button" className={s.bouton} onClick={onFermer}>
            Annuler
          </button>
          <button type="submit" className={s.boutonPlein} disabled={enCours}>
            {enCours ? "Enregistrement…" : colonne ? "Enregistrer" : "Ajouter la colonne"}
          </button>
        </div>
      </form>
    </Fenetre>
  );
}

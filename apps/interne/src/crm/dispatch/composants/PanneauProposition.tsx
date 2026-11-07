"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { appliquerProposition, ecarterProposition, proposer } from "../actions";
import { cleDestination, estVerrouillee, lireVolume, m3, somme } from "../outils";
import { GENRES, type Ligne, type Parametres, type Plan, type Proposition } from "../types";
import { Fenetre, Jauge, type Message } from "./elements";
import { Picto, PICTO_GENRE } from "./Picto";
import s from "./dispatch.module.css";

export type EtatIa = { disponible: boolean; modele: string; raison: string | null };

const secondes = (ms: number | null) => (ms == null ? "" : ms < 1000 ? "moins d'une seconde" : `${Math.round(ms / 100) / 10} s`.replace(".", ","));

/**
 * La proposition de regroupement : les paramètres (ce qu'on regroupe, quels
 * clients, quelles colonnes, les capacités, les contraintes), le calcul, puis
 * la proposition elle-même — qui ne touche au planning que si le dispatcheur
 * l'applique.
 */
export default function PanneauProposition({
  plan,
  lignes,
  couleurs,
  ia,
  onFermer,
  onMessage,
}: {
  plan: Plan;
  lignes: Ligne[];
  couleurs: Map<string, string>;
  ia: EtatIa;
  onFermer: () => void;
  onMessage: (m: Message) => void;
}) {
  const ouvertes = plan.colonnes.filter((c) => !estVerrouillee(c));
  const idsOuverts = new Set(ouvertes.map((c) => c.id));
  const nonPlaces = lignes.filter((l) => l.colonneId == null).length;
  const dansOuvertes = lignes.filter((l) => l.colonneId != null && idsOuverts.has(l.colonneId)).length;
  const verrouillees = plan.colonnes.length - ouvertes.length;
  const tournees = plan.colonnes.filter((c) => c.genre === "tournee").length;

  const [proposition, setProposition] = useState<Proposition | null>(plan.proposition);
  const [etape, setEtape] = useState<"parametres" | "calcul" | "resultat">(plan.proposition ? "resultat" : "parametres");
  const [p, setP] = useState<Parametres>(
    () =>
      plan.proposition?.parametres ?? {
        methode: ia.disponible ? "ia" : "regles",
        mode: tournees > plan.colonnes.length / 2 ? "tournee" : "conteneur",
        repartir: nonPlaces > 0 ? "non_places" : "tout",
        garderColonnes: true,
        nouvellesColonnes: true,
        capacite20: plan.capacite20,
        capacite40: plan.capacite40,
        capaciteTournee: null,
        contraintes: "",
      },
  );
  const [cap20, setCap20] = useState(String(p.capacite20).replace(".", ","));
  const [cap40, setCap40] = useState(String(p.capacite40).replace(".", ","));
  const [capTournee, setCapTournee] = useState(p.capaciteTournee ? String(p.capaciteTournee).replace(".", ",") : "");
  const [erreur, setErreur] = useState<string | null>(null);
  const [debut, setDebut] = useState(0);
  const [ecoule, setEcoule] = useState(0);
  const [enCours, demarrer] = useTransition();

  useEffect(() => {
    if (etape !== "calcul") return;
    const t = setInterval(() => setEcoule(Date.now() - debut), 250);
    return () => clearInterval(t);
  }, [etape, debut]);

  const lancer = () => {
    const c20 = lireVolume(cap20), c40 = lireVolume(cap40), ct = capTournee.trim() ? lireVolume(capTournee) : null;
    if (!c20 || !c40 || c20 <= 0 || c40 <= 0) return setErreur("Indiquez les capacités des conteneurs 20 et 40 pieds, en m³.");
    if (capTournee.trim() && (!ct || ct <= 0)) return setErreur("Volume par tournée illisible.");
    const params: Parametres = { ...p, capacite20: c20, capacite40: c40, capaciteTournee: ct };
    setErreur(null);
    setP(params);
    setDebut(Date.now());
    setEcoule(0);
    setEtape("calcul");
    demarrer(async () => {
      const r = await proposer(plan.id, params);
      if (!r.ok) {
        setErreur(r.erreur);
        setEtape("parametres");
        return;
      }
      setProposition(r.donnees ?? null);
      setEtape("resultat");
    });
  };

  const appliquer = () =>
    proposition &&
    demarrer(async () => {
      const r = await appliquerProposition(plan.id, proposition.id);
      if (!r.ok) return setErreur(r.erreur);
      const { places = 0, creees = 0 } = r.donnees ?? {};
      onMessage({
        texte: `Proposition appliquée : ${places} client${places > 1 ? "s" : ""} placé${places > 1 ? "s" : ""}${creees ? `, ${creees} colonne${creees > 1 ? "s" : ""} créée${creees > 1 ? "s" : ""}` : ""}. Ajustez au glisser-déposer, puis verrouillez ce qui est validé.`,
      });
      onFermer();
    });
  const ecarter = () =>
    proposition &&
    demarrer(async () => {
      const r = await ecarterProposition(plan.id, proposition.id);
      if (!r.ok) return setErreur(r.erreur);
      onMessage({ texte: "Proposition écartée : le planning n'a pas changé." });
      onFermer();
    });

  const parId = useMemo(() => new Map(lignes.map((l) => [l.id, l])), [lignes]);
  const quoi = p.mode === "conteneur" ? "conteneurs" : "tournées";

  /* ── Le calcul en cours ── */
  if (etape === "calcul")
    return (
      <Fenetre titre="Proposition de regroupement" picto="etincelle" taille="large" onFermer={onFermer}>
        <div className={s.etapesIa} aria-live="polite">
          <span className={s.orbe}>
            <Picto nom={p.methode === "ia" ? "etincelle" : "regles"} taille={32} />
          </span>
          <h3>{p.methode === "ia" ? "L'IA étudie votre plan…" : "Calcul du regroupement…"}</h3>
          <p>
            {p.repartir === "tout" ? nonPlaces + dansOuvertes : nonPlaces} clients à placer en {quoi}, selon leur destination, leur volume
            {p.methode === "ia" ? ", leurs remarques et vos contraintes" : ""}. {p.methode === "ia" ? "Comptez de quelques secondes à une minute." : ""}
          </p>
          <span className={s.chrono}>{Math.floor(ecoule / 1000)} s</span>
        </div>
      </Fenetre>
    );

  /* ── La proposition ── */
  if (etape === "resultat" && proposition) {
    const changes = [...proposition.colonnes.flatMap((c) => c.lignes), ...proposition.nonAffectees.map((n) => n.ligne)].filter((id) => {
      const l = parId.get(id);
      return !l || (l.colonneId != null && proposition.parametres.repartir === "non_places") || (l.colonneId != null && !idsOuverts.has(l.colonneId));
    }).length;
    const places = proposition.colonnes.reduce((n, c) => n + c.lignes.length, 0);
    const nouvelles = proposition.colonnes.filter((c) => c.colonneId == null).length;
    return (
      <Fenetre
        titre="Proposition de regroupement"
        sousTitre="Rien n'est modifié tant que vous ne l'avez pas appliquée. Ensuite, tout se corrige au glisser-déposer."
        picto="etincelle"
        taille="large"
        onFermer={onFermer}
        pied={
          <>
            <button type="button" className={s.bouton} onClick={ecarter} disabled={enCours}>
              Écarter
            </button>
            <span className={s.espace} />
            <button type="button" className={s.bouton} onClick={() => setEtape("parametres")} disabled={enCours}>
              <Picto nom="recharger" taille={16} /> Modifier les paramètres et relancer
            </button>
            <button type="button" className={s.boutonPlein} onClick={appliquer} disabled={enCours || places === 0}>
              <Picto nom="coche" taille={16} /> {enCours ? "Application…" : `Appliquer au planning (${places} client${places > 1 ? "s" : ""})`}
            </button>
          </>
        }
      >
        <div className={s.fenetreCorps}>
          <div className={`${s.source} ${proposition.repli ? s.repli : ""}`}>
            <Picto nom={proposition.methode === "ia" ? "etincelle" : proposition.repli ? "alerte" : "regles"} taille={18} />
            {proposition.methode === "ia" ? (
              <span>
                <b>Proposée par l&apos;IA</b> · {proposition.modele} · {secondes(proposition.dureeMs)}
              </span>
            ) : proposition.repli ? (
              <span>
                <b>L&apos;IA n&apos;a pas pu proposer : {proposition.repli}.</b> Proposition calculée par les règles simples (regroupement par pays, puis volumes décroissants) — elles ne lisent
                ni les remarques ni vos contraintes.
              </span>
            ) : (
              <span>
                <b>Calculée par les règles simples</b> : regroupement par pays, puis volumes décroissants. Les remarques et les contraintes ne sont pas lues.
              </span>
            )}
          </div>
          {proposition.resume && <p className={s.resume}>{proposition.resume}</p>}
          {changes > 0 && (
            <div className={s.note} style={{ marginTop: 12 }}>
              <Picto nom="alerte" taille={16} />
              <span>
                {changes} client{changes > 1 ? "s ont" : " a"} changé de place depuis le calcul : {changes > 1 ? "ils seront ignorés" : "il sera ignoré"} à l&apos;application.
              </span>
            </div>
          )}
          {proposition.alertes.length > 0 && (
            <div className={s.alertes}>
              {proposition.alertes.map((a, i) => (
                <div key={i} className={s.note}>
                  <Picto nom="alerte" taille={16} />
                  <span>{a}</span>
                </div>
              ))}
            </div>
          )}
          <div className={s.propositions}>
            {proposition.colonnes.map((c) => {
              const ls = c.lignes.map((id) => parId.get(id)).filter((l): l is Ligne => !!l);
              const deja = c.colonneId != null && proposition.parametres.repartir === "non_places" ? lignes.filter((l) => l.colonneId === c.colonneId) : [];
              return (
                <article key={c.ref} className={`${s.proposee} ${c.colonneId == null ? s.nouvelle : ""}`}>
                  <div className={s.teteHaut}>
                    <span className={s.genre}>
                      <Picto nom={PICTO_GENRE[c.genre]} taille={13} />
                      {GENRES[c.genre].nom}
                      {c.taille ? ` · ${c.taille}'` : ""}
                    </span>
                    <span className={s.espace} />
                    {c.colonneId == null && <span className={s.nouveau}>À créer</span>}
                  </div>
                  <h4>{c.libelle}</h4>
                  <Jauge volume={somme([...ls, ...deja])} capacite={c.capacite} />
                  {c.raison && <p className={s.raison}>{c.raison}</p>}
                  <div className={s.puces}>
                    {deja.map((l) => (
                      <span key={l.id} className={s.puce} style={{ ["--c" as string]: couleurs.get(cleDestination(l)), opacity: 0.6 }} title="Déjà dans la colonne">
                        <i />
                        <span>{l.client}</span>
                        <em>{m3(l.volume)}</em>
                      </span>
                    ))}
                    {ls.map((l) => (
                      <span key={l.id} className={s.puce} style={{ ["--c" as string]: couleurs.get(cleDestination(l)) }} title={[l.ville, l.pays].filter(Boolean).join(", ")}>
                        <i />
                        <span>{l.client}</span>
                        <em>{m3(l.volume)}</em>
                      </span>
                    ))}
                    {ls.length + deja.length === 0 && <span className={s.sousTitre}>Aucun client</span>}
                  </div>
                </article>
              );
            })}
          </div>
          {proposition.nonAffectees.length > 0 && (
            <div className={s.section}>
              <h3>Non placés · {proposition.nonAffectees.length}</h3>
              <ul className={s.nonPlaces}>
                {proposition.nonAffectees.map((n) => {
                  const l = parId.get(n.ligne);
                  return (
                    <li key={n.ligne}>
                      <b>
                        {l?.client ?? "Client retiré"} {l && <small style={{ fontWeight: 500 }}>· {m3(l.volume)}</small>}
                      </b>
                      <span>{n.raison}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {nouvelles > 0 && (
            <p className={s.sousTitre} style={{ marginTop: 14 }}>
              {nouvelles} colonne{nouvelles > 1 ? "s" : ""} en pointillé {nouvelles > 1 ? "seront créées" : "sera créée"} à l&apos;application, avec les capacités du plan.
            </p>
          )}
          {erreur && (
            <p className={s.erreur} style={{ marginTop: 14 }}>
              {erreur}
            </p>
          )}
        </div>
      </Fenetre>
    );
  }

  /* ── Les paramètres ── */
  const aPlacer = p.repartir === "tout" ? nonPlaces + dansOuvertes : nonPlaces;
  return (
    <Fenetre
      titre="Proposer un regroupement"
      sousTitre="L'IA propose qui va où, selon la destination, le volume et les contraintes. Vous voyez la proposition avant qu'elle ne touche au planning."
      picto="etincelle"
      taille="large"
      onFermer={onFermer}
      pied={
        <>
          {proposition && (
            <button type="button" className={s.bouton} onClick={() => setEtape("resultat")}>
              <Picto nom="gauche" taille={16} /> Revoir la dernière proposition
            </button>
          )}
          <span className={s.espace} />
          <button type="button" className={s.bouton} onClick={onFermer}>
            Annuler
          </button>
          <button type="button" className={s.boutonPlein} onClick={lancer} disabled={enCours || aPlacer === 0}>
            <Picto nom={p.methode === "ia" ? "etincelle" : "regles"} taille={16} /> Proposer pour {aPlacer} client{aPlacer > 1 ? "s" : ""}
          </button>
        </>
      }
    >
      <div className={s.fenetreCorps}>
        <div className={s.grille}>
          <div className={`${s.champ} ${s.demi}`}>
            <span>Regrouper en</span>
            <div className={s.choix} role="radiogroup">
              {(["conteneur", "tournee"] as const).map((m) => (
                <label key={m}>
                  <input type="radio" name="mode" checked={p.mode === m} onChange={() => setP({ ...p, mode: m })} />
                  <Picto nom={PICTO_GENRE[m]} taille={16} /> {m === "conteneur" ? "Conteneurs" : "Tournées de livraison"}
                </label>
              ))}
            </div>
          </div>
          <div className={`${s.champ} ${s.demi}`}>
            <span>Méthode</span>
            <div className={s.choix} role="radiogroup">
              <label title={ia.raison ?? undefined}>
                <input type="radio" name="methode" checked={p.methode === "ia"} disabled={!ia.disponible} onChange={() => setP({ ...p, methode: "ia" })} />
                <Picto nom="etincelle" taille={16} /> IA · Gemini
              </label>
              <label>
                <input type="radio" name="methode" checked={p.methode === "regles"} onChange={() => setP({ ...p, methode: "regles" })} />
                <Picto nom="regles" taille={16} /> Règles simples
              </label>
            </div>
            <small>
              {ia.disponible
                ? `Modèle ${ia.modele}. Si elle ne répond pas, les règles simples prennent le relais, et l'écran le dit.`
                : `IA indisponible : ${ia.raison}. Les règles simples regroupent par pays, puis par volume.`}
            </small>
          </div>

          <div className={s.champ}>
            <span>Clients à placer</span>
            <div className={s.choix} role="radiogroup">
              <label>
                <input type="radio" name="repartir" checked={p.repartir === "non_places"} onChange={() => setP({ ...p, repartir: "non_places" })} />
                Les clients à répartir · {nonPlaces}
              </label>
              <label>
                <input type="radio" name="repartir" checked={p.repartir === "tout"} onChange={() => setP({ ...p, repartir: "tout" })} />
                Tous ceux des colonnes non verrouillées · {nonPlaces + dansOuvertes}
              </label>
            </div>
            <small>
              {verrouillees > 0
                ? `${verrouillees} colonne${verrouillees > 1 ? "s" : ""} verrouillée${verrouillees > 1 ? "s" : ""} : la proposition n'y touche pas.`
                : "Aucune colonne verrouillée : verrouillez celles qui sont validées pour les protéger."}{" "}
              {p.repartir === "non_places" && dansOuvertes > 0 ? `Les ${dansOuvertes} clients déjà placés restent où ils sont, et comptent dans le remplissage.` : ""}
            </small>
          </div>

          <div className={s.champ}>
            <span>Colonnes</span>
            <label className={s.case}>
              <input type="checkbox" checked={p.garderColonnes} onChange={(e) => setP({ ...p, garderColonnes: e.target.checked })} />
              <span>
                Remplir mes colonnes ouvertes · {ouvertes.length}
                <small>{ouvertes.length ? ouvertes.map((c) => c.libelle).join(", ") : "Aucune colonne ouverte pour l'instant."}</small>
              </span>
            </label>
            <label className={s.case} style={{ marginTop: 8 }}>
              <input type="checkbox" checked={p.nouvellesColonnes} onChange={(e) => setP({ ...p, nouvellesColonnes: e.target.checked })} />
              <span>
                Créer des {quoi} si nécessaire
                <small>Elles n&apos;existeront qu&apos;une fois la proposition appliquée.</small>
              </span>
            </label>
          </div>

          {p.mode === "conteneur" ? (
            <>
              <div className={`${s.champ} ${s.tiers}`}>
                <label htmlFor="c20">Conteneur 20 pieds</label>
                <div className={s.unite}>
                  <input id="c20" type="text" inputMode="decimal" value={cap20} onChange={(e) => setCap20(e.target.value)} />
                  <span>m³</span>
                </div>
              </div>
              <div className={`${s.champ} ${s.tiers}`}>
                <label htmlFor="c40">Conteneur 40 pieds</label>
                <div className={s.unite}>
                  <input id="c40" type="text" inputMode="decimal" value={cap40} onChange={(e) => setCap40(e.target.value)} />
                  <span>m³</span>
                </div>
              </div>
              <div className={`${s.champ} ${s.tiers}`} style={{ justifyContent: "flex-end" }}>
                <div className={s.note} style={{ padding: "9px 12px" }}>
                  <Picto nom="alerte" taille={15} />
                  <span>Valeurs indicatives, à valider avec Bailly. Modifiées ici, elles s&apos;appliquent aux conteneurs non verrouillés du plan.</span>
                </div>
              </div>
            </>
          ) : (
            <div className={`${s.champ} ${s.demi}`}>
              <label htmlFor="ct">Volume maximal par tournée (facultatif)</label>
              <div className={s.unite}>
                <input id="ct" type="text" inputMode="decimal" value={capTournee} onChange={(e) => setCapTournee(e.target.value)} placeholder="Sans limite" />
                <span>m³</span>
              </div>
              <small>La capacité du véhicule de livraison, si vous voulez que la proposition en tienne compte.</small>
            </div>
          )}

          <div className={s.champ}>
            <label htmlFor="contraintes">Contraintes à respecter {p.methode === "regles" && <em style={{ fontStyle: "normal", fontWeight: 500 }}>(lues par l&apos;IA seulement)</em>}</label>
            <textarea
              id="contraintes"
              rows={3}
              maxLength={2000}
              value={p.contraintes}
              onChange={(e) => setP({ ...p, contraintes: e.target.value })}
              placeholder="Ex. : la famille Désiré et Mme Pélage ensemble ; garder de la place dans le second conteneur de Martinique ; le Canada part en janvier…"
            />
          </div>
        </div>
        {erreur && (
          <p className={s.erreur} style={{ marginTop: 14 }}>
            {erreur}
          </p>
        )}
      </div>
    </Fenetre>
  );
}

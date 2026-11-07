"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { deplacerLigne, majLigne, supprimerLigne } from "../actions";
import { m3 } from "../outils";
import { verifierLigne } from "../saisie";
import type { Colonne, DossierOption, Evenement, Ligne, LigneSaisie } from "../types";
import type { Message } from "./elements";
import { Picto } from "./Picto";
import s from "./dispatch.module.css";

const heure = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(iso));

/**
 * La fiche d'un client du plan, en tiroir : ses champs, sa place (colonne),
 * son rattachement à un dossier du CRM, et ce qui lui est arrivé.
 */
export default function TiroirLigne({
  planId,
  ligne,
  colonnes,
  dossiers,
  couleur,
  historique,
  capaciteMax,
  onFermer,
  onMessage,
}: {
  planId: number;
  ligne: Ligne;
  colonnes: Colonne[];
  dossiers: DossierOption[];
  couleur: string;
  historique: Evenement[];
  capaciteMax: number;
  onFermer: () => void;
  onMessage: (m: Message) => void;
}) {
  const colonne = colonnes.find((c) => c.id === ligne.colonneId) ?? null;
  const figee = !!colonne?.verrouilleeLe;
  const [champs, setChamps] = useState<LigneSaisie>({
    client: ligne.client,
    ville: ligne.ville ?? "",
    pays: ligne.pays ?? "",
    volume: String(ligne.volume).replace(".", ","),
    remarques: ligne.remarques ?? "",
    dossier: ligne.dossierRef ?? "",
    telephone: ligne.telephone ?? "",
  });
  const [erreur, setErreur] = useState<string | null>(null);
  const [retrait, setRetrait] = useState(false);
  const [enCours, demarrer] = useTransition();
  const refs = useMemo(() => new Map(dossiers.map((d) => [d.ref.toUpperCase(), d])), [dossiers]);
  const verdict = verifierLigne(champs, { capaciteMax, dossiers: refs });
  const dossier = refs.get(champs.dossier.trim().toUpperCase());
  const maj = (k: keyof LigneSaisie) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setChamps((c) => ({ ...c, [k]: e.target.value }));
  const erreurDe = (k: keyof LigneSaisie) => verdict.erreurs.find((x) => x.champ === k)?.texte;
  const avisDe = (k: keyof LigneSaisie) => verdict.avertissements.find((x) => x.champ === k)?.texte;

  const enregistrer = () =>
    demarrer(async () => {
      setErreur(null);
      const r = await majLigne(planId, ligne.id, champs);
      if (!r.ok) return setErreur(r.erreur);
      onMessage({ texte: `Fiche de ${champs.client.trim()} enregistrée` });
      onFermer();
    });
  const placer = (valeur: string) =>
    demarrer(async () => {
      const cible = valeur === "" ? null : Number(valeur);
      const r = await deplacerLigne(planId, ligne.id, cible, null);
      if (!r.ok) return setErreur(r.erreur);
      onMessage({ texte: `${ligne.client} : ${cible == null ? "à répartir" : `placé dans « ${colonnes.find((c) => c.id === cible)?.libelle} »`}` });
    });
  const retirer = () =>
    demarrer(async () => {
      const r = await supprimerLigne(planId, ligne.id);
      if (!r.ok) return setErreur(r.erreur);
      onMessage({ texte: `${ligne.client} retiré du plan` });
      onFermer();
    });

  return (
    <>
      <div className={s.voile} onClick={onFermer} aria-hidden />
      <aside className={`${s.racine} ${s.tiroir}`} role="dialog" aria-modal="true" aria-label={`Fiche de ${ligne.client}`}>
        <div className={s.tiroirTete}>
          <span className={s.pastille} style={{ background: `color-mix(in srgb, ${couleur} 14%, #fff)`, color: couleur }}>
            <Picto nom="utilisateur" taille={21} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2>{ligne.client}</h2>
            <p>
              {[ligne.ville, ligne.pays].filter(Boolean).join(", ") || "Destination à préciser"} · {m3(ligne.volume)}
            </p>
          </div>
          <button type="button" className={s.rond} onClick={onFermer} aria-label="Fermer la fiche">
            <Picto nom="fermer" taille={18} />
          </button>
        </div>

        <div className={s.tiroirCorps}>
          {figee && (
            <div className={`${s.note} ${s.verte}`} style={{ marginBottom: 16 }}>
              <Picto nom="cadenas" taille={16} />
              <span>
                Ce client est dans « {colonne?.libelle} », validée et verrouillée{colonne?.verrouilleePar ? ` par ${colonne.verrouilleePar}` : ""}. Déverrouillez la colonne pour
                le modifier ou le déplacer.
              </span>
            </div>
          )}

          <div className={s.champ}>
            <label htmlFor="placement">Placement</label>
            <select id="placement" value={ligne.colonneId ?? ""} disabled={figee || enCours} onChange={(e) => placer(e.target.value)}>
              <option value="">À répartir</option>
              {colonnes.map((c) => (
                <option key={c.id} value={c.id} disabled={!!c.verrouilleeLe && c.id !== ligne.colonneId}>
                  {c.libelle}
                  {c.verrouilleeLe ? " (verrouillée)" : ""}
                </option>
              ))}
            </select>
            <small>Ou glissez la bulle d&apos;une colonne à l&apos;autre.</small>
          </div>

          <fieldset disabled={figee || enCours} style={{ border: 0, marginTop: 18 }}>
            <div className={s.grille}>
              <div className={s.champ}>
                <label htmlFor="client">Client</label>
                <input id="client" type="text" value={champs.client} onChange={maj("client")} aria-invalid={!!erreurDe("client")} />
                {erreurDe("client") && <small style={{ color: "#be123c" }}>{erreurDe("client")}</small>}
              </div>
              <div className={`${s.champ} ${s.demi}`}>
                <label htmlFor="ville">Ville</label>
                <input id="ville" type="text" value={champs.ville} onChange={maj("ville")} />
              </div>
              <div className={`${s.champ} ${s.demi}`}>
                <label htmlFor="pays">Pays ou territoire</label>
                <input id="pays" type="text" value={champs.pays} onChange={maj("pays")} />
              </div>
              {(erreurDe("ville") || avisDe("pays")) && (
                <small className={s.champ} style={{ color: erreurDe("ville") ? "#be123c" : "#b45309", marginTop: -6 }}>
                  {erreurDe("ville") ?? avisDe("pays")}
                </small>
              )}
              <div className={`${s.champ} ${s.demi}`}>
                <label htmlFor="volume">Volume</label>
                <div className={s.unite}>
                  <input id="volume" type="text" inputMode="decimal" value={champs.volume} onChange={maj("volume")} aria-invalid={!!erreurDe("volume")} />
                  <span>m³</span>
                </div>
                {(erreurDe("volume") || avisDe("volume")) && <small style={{ color: erreurDe("volume") ? "#be123c" : "#b45309" }}>{erreurDe("volume") ?? avisDe("volume")}</small>}
              </div>
              <div className={`${s.champ} ${s.demi}`}>
                <label htmlFor="telephone">Téléphone</label>
                <input id="telephone" type="tel" value={champs.telephone} onChange={maj("telephone")} />
              </div>
              <div className={s.champ}>
                <label htmlFor="remarques">Remarques et contraintes</label>
                <textarea id="remarques" rows={3} value={champs.remarques} onChange={maj("remarques")} placeholder="Accès, objets fragiles, date souhaitée…" />
              </div>
              <div className={s.champ}>
                <label htmlFor="dossier">Dossier du CRM</label>
                <input id="dossier" type="text" list="dossiers-crm" value={champs.dossier} onChange={maj("dossier")} placeholder="BD-2026-…" autoComplete="off" />
                <datalist id="dossiers-crm">
                  {dossiers.map((d) => (
                    <option key={d.id} value={d.ref}>
                      {d.nom}
                      {d.arrivee ? ` · ${d.arrivee}` : ""}
                    </option>
                  ))}
                </datalist>
                {dossier ? (
                  <small>
                    Rattaché à{" "}
                    <Link href={`/dossiers/${dossier.id}`} style={{ color: "#4b2fe0", fontWeight: 650 }}>
                      {dossier.ref} · {dossier.nom}
                    </Link>
                  </small>
                ) : (
                  avisDe("dossier") && <small style={{ color: "#b45309" }}>{avisDe("dossier")}</small>
                )}
              </div>
            </div>
          </fieldset>

          {erreur && (
            <p className={s.erreur} style={{ marginTop: 16 }}>
              {erreur}
            </p>
          )}

          <div className={s.section}>
            <h3>Historique de ce client</h3>
            {historique.length === 0 ? (
              <p className={s.sousTitre}>Aucune modification depuis son import.</p>
            ) : (
              <ul className={s.evenements}>
                {historique.slice(0, 12).map((h) => (
                  <li key={h.id} className={s.evenement} style={{ gridTemplateColumns: "minmax(0,1fr) auto", padding: "8px 0" }}>
                    <p style={{ fontSize: 13 }}>
                      {h.libelle}
                      {h.qui && <small>{h.qui}</small>}
                    </p>
                    <span className={s.heure}>{heure(h.quand)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className={s.tiroirPied}>
          {retrait ? (
            <button type="button" className={s.boutonDanger} onClick={retirer} disabled={enCours}>
              <Picto nom="corbeille" taille={16} /> Confirmer le retrait
            </button>
          ) : (
            <button type="button" className={s.bouton} onClick={() => setRetrait(true)} disabled={figee || enCours}>
              <Picto nom="corbeille" taille={16} /> Retirer du plan
            </button>
          )}
          <button type="button" className={s.boutonPlein} onClick={enregistrer} disabled={figee || enCours || verdict.erreurs.length > 0}>
            {enCours ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </aside>
    </>
  );
}

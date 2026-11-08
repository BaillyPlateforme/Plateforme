"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { annuler, envoyerMaintenant, exclureDossier, reactiver, repousser, retirerExclusion, type Retour } from "./actions";
import { COLONNES, defRelance, ecart, libelleCanal, STATUT_ENVOI, type Relance } from "./regles";
import { IconeCanal } from "./Section";
import s from "./relances.module.css";

/*
 * Le Kanban des relances : à venir, aujourd'hui, en retard, envoyées,
 * désactivées. Chaque carte se repousse, s'annule ou part tout de suite. Les
 * règles se règlent dans Réglages › Règles des relances.
 */

const jourFr = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

/** « dans 3 j », « aujourd'hui », « il y a 2 j ». */
function relatif(aujourdhui: string, jour: string) {
  const n = ecart(aujourdhui, jour);
  if (n === 0) return "aujourd’hui";
  if (n === 1) return "demain";
  if (n === -1) return "hier";
  return n > 0 ? `dans ${n} j` : `il y a ${-n} j`;
}

export function useGestes() {
  const [retour, setRetour] = useState<Retour | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();
  const agir = (f: () => Promise<Retour>, question?: string) => {
    if (question && !confirm(question)) return;
    demarrer(async () => {
      const r = await f();
      setRetour(r);
      router.refresh();
    });
  };
  return { retour, setRetour, enCours, agir };
}

/** Le compte rendu d'un geste, en bas à droite ; il se ferme seul au bout de six secondes. */
export function Toast({ retour, fermer }: { retour: Retour | null; fermer: () => void }) {
  useEffect(() => {
    if (!retour) return;
    const t = setTimeout(fermer, 6000);
    return () => clearTimeout(t);
  }, [retour, fermer]);
  if (!retour) return null;
  return (
    <div className={s.toast} data-ok={retour.ok} role="status">
      <i />
      {retour.ok ? (retour.message ?? "C’est fait.") : retour.erreur}
      <button type="button" onClick={fermer} aria-label="Fermer">
        ✕
      </button>
    </div>
  );
}

/** Les désactivées et les envoyées s'accumulent : on n'en montre d'abord que quelques-unes. */
const REPLIEES = 6;

export default function Kanban({ relances, aujourdhui, borneRattrapage }: { relances: Relance[]; aujourdhui: string; borneRattrapage: string }) {
  const { retour, setRetour, enCours, agir } = useGestes();
  const [deplie, setDeplie] = useState<Record<string, boolean>>({});
  return (
    <>
      <Toast retour={retour} fermer={() => setRetour(null)} />
      <div className={s.kanban}>
        {COLONNES.map((col) => {
          const toutes = relances.filter((r) => r.colonne === col.cle);
          const pliable = (col.cle === "desactivee" || col.cle === "envoyee") && toutes.length > REPLIEES && !deplie[col.cle];
          // Les cartes du mini-Kanban mènent ici filtrées sur leur dossier : la carte visée n'est pas repliée.
          const liste = pliable ? toutes.slice(0, REPLIEES) : toutes;
          const parVeille = col.cle === "aujourdhui" || col.cle === "retard" ? liste.filter((r) => r.prevue >= borneRattrapage).length : 0;
          return (
            <section key={col.cle} id={`col-${col.cle}`} className={s.colonne} style={{ ["--c" as string]: col.couleur }} aria-label={col.titre}>
              <header className={s.colTete}>
                <i />
                <span>{col.titre}</span>
                <b>{toutes.length}</b>
                {(col.cle === "aujourdhui" || col.cle === "retard") && liste.length > 0 && (
                  <small>
                    {parVeille} partira{parVeille > 1 ? "ont" : ""} avec la veille{liste.length - parVeille ? ` · ${liste.length - parVeille} attend${liste.length - parVeille > 1 ? "ent" : ""} une décision` : ""}
                  </small>
                )}
              </header>
              {liste.length === 0 && <p className={s.colVide}>{col.vide}</p>}
              {liste.map((r) => {
                const def = defRelance(r.type)!;
                const ouverte = ["avenir", "aujourdhui", "retard"].includes(col.cle);
                return (
                  <article key={r.cle} id={r.cle} className={s.relance}>
                    <div className={s.relanceHaut}>
                      <span className={s.typeBadge} style={{ ["--c" as string]: def.couleur }}>
                        <i />
                        {r.libelle}
                      </span>
                      <span className={s.rang} title="Rang dans la suite de relances">
                        {r.rang}/{r.sur}
                      </span>
                      <span className={s.icCanaux} title={r.canaux.map(libelleCanal).join(", ") || "Aucun canal prêt"}>
                        {r.canaux.map((c) => (
                          <IconeCanal key={c} canal={c} />
                        ))}
                      </span>
                    </div>
                    <h4>
                      <Link href={`/dossiers/${r.dossierId}`}>{r.client || r.ref}</Link>
                    </h4>
                    <p>
                      {r.ref} · {r.objet}
                    </p>
                    <div className={s.quand}>
                      {col.cle === "envoyee" ? (
                        <>
                          {r.envoyeeLe && <span>Partie le {jourFr(r.envoyeeLe.slice(0, 10))}</span>}
                          <span className={s.puce} data-ton={r.envoiStatut === "envoye" ? "ok" : "attention"}>
                            {STATUT_ENVOI[r.envoiStatut ?? ""]?.libelle ?? r.envoiStatut ?? "—"}
                          </span>
                        </>
                      ) : (
                        <>
                          <span>
                            {r.reportee ? "Repoussée au" : "Prévue le"} {jourFr(r.prevue)}
                          </span>
                          {ouverte && (
                            <span className={s.puce} data-ton={col.cle === "retard" ? "danger" : col.cle === "aujourdhui" ? "info" : "neutre"}>
                              {relatif(aujourdhui, r.prevue)}
                            </span>
                          )}
                          {col.cle === "retard" && r.prevue < borneRattrapage && (
                            <span className={s.puce} data-ton="attention">
                              Attend une décision
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    {r.motif && col.cle !== "envoyee" && <p className={s.motif}>{r.motif}</p>}
                    {ouverte && (
                      <div className={s.gestes}>
                        <button className={s.bouton} data-ton="principal" disabled={enCours} onClick={() => agir(() => envoyerMaintenant(r.cle), `Envoyer maintenant la relance à ${r.client || r.ref} ?`)}>
                          Envoyer
                        </button>
                        <button className={s.bouton} disabled={enCours} onClick={() => agir(() => repousser(r.cle, 3))}>
                          +3 j
                        </button>
                        <button className={s.bouton} disabled={enCours} onClick={() => agir(() => repousser(r.cle, 7))}>
                          +7 j
                        </button>
                        <button className={s.bouton} data-ton="danger" disabled={enCours} onClick={() => agir(() => annuler(r.cle), `Annuler les relances « ${r.libelle} » de ${r.client || r.ref} ?`)}>
                          Annuler
                        </button>
                      </div>
                    )}
                    {col.cle === "desactivee" && r.motif === "Annulée par l'équipe." && (
                      <div className={s.gestes}>
                        <button className={s.bouton} disabled={enCours} onClick={() => agir(() => reactiver(r.cle))}>
                          Réactiver
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
              {pliable && (
                <button type="button" className={s.bouton} onClick={() => setDeplie({ ...deplie, [col.cle]: true })}>
                  Afficher les {toutes.length - liste.length} autres
                </button>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

/** Dans le bandeau d'une page filtrée sur un dossier : le marquer « ne pas relancer », ou le rétablir. */
export function BoutonExclusion({ dossierId, exclu }: { dossierId: number; exclu: boolean }) {
  const { retour, setRetour, enCours, agir } = useGestes();
  return (
    <>
      <button
        type="button"
        data-ton="contour"
        disabled={enCours}
        onClick={() =>
          exclu
            ? agir(() => retirerExclusion(dossierId, "*"))
            : agir(() => exclureDossier(dossierId, "*"), "Ne plus relancer ce dossier, pour tous les types de relance ?")
        }
      >
        {exclu ? "Relancer de nouveau" : "Ne pas relancer"}
      </button>
      <Toast retour={retour} fermer={() => setRetour(null)} />
    </>
  );
}

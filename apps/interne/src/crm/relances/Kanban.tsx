"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icone } from "@/ui/icones";
import CarteKanban, { Action, Note, type Signal } from "@/crm/kanban/Carte";
import CarteDossier from "@/crm/kanban/CarteDossier";
import TeteColonne, { Sens, styleEtape } from "@/crm/kanban/Colonne";
import type { Carte } from "@/crm/kanban/donnees";
import { ETATS_RELANCE } from "@/crm/kanban/etapes";
import { annuler, exclureDossier, reactiver, repousser, retirerExclusion, type Retour } from "./actions";
import PanneauEnvoi from "./PanneauEnvoi";
import { defRelance, ecart, libelleCanal, STATUT_ENVOI, type Relance } from "./regles";
import { IconeCanal, lienRelances } from "./Section";
import k from "@/crm/kanban/kanban.module.css";
import s from "./relances.module.css";

/*
 * Le Kanban des relances : à venir, aujourd'hui, en retard, envoyées,
 * désactivées. Chaque carte se repousse, s'annule ou part tout de suite :
 * « Envoyer » ouvre l'écran d'envoi (PanneauEnvoi : ce que la relance
 * demande, à cocher, et le message dessous), l'œil son aperçu. Les règles se
 * règlent dans Réglages › Règles des relances.
 *
 * Les colonnes et les cartes sont celles de tous les tableaux du CRM
 * (src/crm/kanban : Colonne, Carte) : une relance est la carte de son
 * dossier — un clic ouvre /dossiers/<id> —, avec, dans son contenu, la
 * relance (son type, qui mène aux relances du dossier ; son objet ; sa date)
 * et, dans son pied, où elle en est et ses gestes. Les couleurs des colonnes
 * viennent de la définition commune (etapes.ts, ETATS_RELANCE).
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

export default function Kanban({
  relances,
  dossiers,
  aujourdhui,
  borneRattrapage,
}: {
  relances: Relance[];
  /** Les dossiers des relances, en cartes (les mêmes qu'au Parcours). */
  dossiers: Record<number, Carte>;
  aujourdhui: string;
  borneRattrapage: string;
}) {
  const { retour, setRetour, enCours, agir } = useGestes();
  const [deplie, setDeplie] = useState<Record<string, boolean>>({});
  const [panneau, setPanneau] = useState<{ cle: string; mode: "envoi" | "apercu" } | null>(null);
  const router = useRouter();
  const fermerPanneau = useCallback(() => setPanneau(null), []);

  const carte = (r: Relance, col: Relance["colonne"]) => {
    const def = defRelance(r.type)!;
    const ouverte = col === "avenir" || col === "aujourdhui" || col === "retard";
    const contenu = (
      <>
        {/* Le type mène aux relances du dossier, celle-ci en vue. */}
        <Link href={`${lienRelances("/relances", r.dossierId)}#${encodeURIComponent(r.cle)}`} className={s.typeLigne} style={{ ["--c" as string]: def.couleur }} data-geste="" draggable={false} title="Les relances de ce dossier">
          <i />
          <span className={s.typeNom}>{r.libelle}</span>
          <span className={s.rang} title="Rang dans la suite de relances">
            {r.rang}/{r.sur}
          </span>
          <span className={s.icCanaux} title={r.canaux.map(libelleCanal).join(", ") || "Aucun canal prêt"}>
            {r.canaux.map((c) => (
              <IconeCanal key={c} canal={c} taille={13} />
            ))}
          </span>
        </Link>
        <p className={s.objet}>{r.objet}</p>
        {r.motif && col !== "envoyee" && <Note>{r.motif}</Note>}
      </>
    );
    const signaux: Signal[] =
      col === "envoyee"
        ? [
            ...(r.envoyeeLe ? [{ texte: `Partie le ${jourFr(r.envoyeeLe.slice(0, 10))}`, teinte: "vert" as const, icone: "coche" as const }] : []),
            { texte: STATUT_ENVOI[r.envoiStatut ?? ""]?.libelle ?? r.envoiStatut ?? "—", teinte: r.envoiStatut === "envoye" ? "vert" : "ambre" },
          ]
        : [
            {
              texte: ouverte ? relatif(aujourdhui, r.prevue) : `${r.reportee ? "Repoussée au" : "Prévue le"} ${jourFr(r.prevue)}`,
              teinte: col === "retard" ? "rose" : col === "aujourdhui" ? "violet" : col === "avenir" ? "indigo" : "gris",
              icone: "horloge",
              titre: `${r.reportee ? "Repoussée au" : "Prévue le"} ${jourFr(r.prevue)}`,
            },
            ...(col === "retard" && r.prevue < borneRattrapage
              ? [{ texte: "À décider", teinte: "ambre" as const, titre: "En retard de plus de trois jours : la veille ne l'enverra pas d'elle-même. Envoyer, repousser ou annuler." }]
              : []),
          ];
    // L'aperçu du message, sans rien envoyer : pour regarder avant de décider.
    const apercu = (
      <Action seul disabled={enCours} onClick={() => setPanneau({ cle: r.cle, mode: "apercu" })} title="Aperçu du message" aria-label="Aperçu du message">
        <Icone nom="oeil" taille={14} />
      </Action>
    );
    const actions = ouverte ? (
      <>
        {/* « Envoyer » ouvre l'écran d'envoi : ce qu'on demande, à cocher, et le message dessous. */}
        <Action ton="principal" disabled={enCours} onClick={() => setPanneau({ cle: r.cle, mode: "envoi" })}>
          Envoyer
        </Action>
        {apercu}
        <Action disabled={enCours} onClick={() => agir(() => repousser(r.cle, 3))} title="Repousser de 3 jours">
          +3 j
        </Action>
        <Action disabled={enCours} onClick={() => agir(() => repousser(r.cle, 7))} title="Repousser de 7 jours">
          +7 j
        </Action>
        <Action
          ton="danger"
          seul
          disabled={enCours}
          onClick={() => agir(() => annuler(r.cle), `Annuler les relances « ${r.libelle} » de ${r.client || r.ref} ?`)}
          title="Annuler cette relance"
          aria-label="Annuler cette relance"
        >
          <Icone nom="sortie" taille={14} />
        </Action>
      </>
    ) : col === "desactivee" ? (
      <>
        {/* Désactivée pour la seule raison qu'une carte n'a pas de texte : elle part de l'écran d'envoi, texte proposé relu. */}
        {r.aRediger && (
          <Action ton="principal" disabled={enCours} onClick={() => setPanneau({ cle: r.cle, mode: "envoi" })} title="Envoyer avec le texte proposé, après l’avoir relu">
            Préparer l’envoi
          </Action>
        )}
        {r.motif === "Annulée par l'équipe." && (
          <Action disabled={enCours} onClick={() => agir(() => reactiver(r.cle))}>
            Réactiver
          </Action>
        )}
        {apercu}
      </>
    ) : undefined;
    const c = dossiers[r.dossierId];
    if (c) return <CarteDossier key={r.cle} carte={c} extra={{ id: r.cle, contenu, signaux, actions }} />;
    // Un dossier qui ne se relit pas : la carte, sans ce qu'il en dirait.
    return (
      <CarteKanban key={r.cle} id={r.cle} titre={r.client || r.ref} reference={r.ref} href={`/dossiers/${r.dossierId}`} contenu={contenu} responsable={null} signaux={signaux} actions={actions} />
    );
  };

  return (
    <div className={k.racine}>
      <Toast retour={retour} fermer={() => setRetour(null)} />
      {panneau && (
        <PanneauEnvoi
          key={`${panneau.cle}:${panneau.mode}`}
          cle={panneau.cle}
          mode={panneau.mode}
          fermer={fermerPanneau}
          envoye={(x) => {
            setRetour(x);
            router.refresh();
          }}
        />
      )}
      <div className={k.planche}>
        {ETATS_RELANCE.map((col) => {
          const toutes = relances.filter((r) => r.colonne === col.cle);
          const pliable = (col.cle === "desactivee" || col.cle === "envoyee") && toutes.length > REPLIEES && !deplie[col.cle];
          // Les cartes visées par une ancre (relances d'un dossier) ne sont jamais repliées : la page est alors filtrée sur lui.
          const liste = pliable ? toutes.slice(0, REPLIEES) : toutes;
          const parVeille = col.cle === "aujourdhui" || col.cle === "retard" ? liste.filter((r) => r.prevue >= borneRattrapage).length : 0;
          const decision = liste.length - parVeille;
          return (
            <section key={col.cle} id={`col-${col.cle}`} className={k.colonne} style={styleEtape(col.teinte)} aria-label={`${col.label}, ${toutes.length} relances`}>
              <TeteColonne
                label={col.label}
                nombre={toutes.length}
                sous={
                  <Sens>
                    {(col.cle === "aujourdhui" || col.cle === "retard") && liste.length > 0
                      ? `${parVeille} partira${parVeille > 1 ? "ont" : ""} avec la veille${decision ? ` · ${decision} attend${decision > 1 ? "ent" : ""} une décision` : ""}`
                      : col.aide}
                  </Sens>
                }
              />
              <div className={k.corps}>
                {liste.map((r) => carte(r, col.cle))}
                {liste.length === 0 && (
                  <div className={k.vide}>
                    <Icone nom="horloge" taille={20} />
                    <span>{col.vide}</span>
                  </div>
                )}
                {pliable && (
                  <button type="button" className={s.bouton} onClick={() => setDeplie({ ...deplie, [col.cle]: true })}>
                    Afficher les {toutes.length - liste.length} autres
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
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

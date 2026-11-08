"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { Icone } from "@/ui/icones";
import { Toast, type Message } from "@/crm/dispatch/composants/elements";
import { Picto } from "@/crm/dispatch/composants/Picto";
import { useGlisser } from "@/crm/dispatch/composants/useGlisser";
import CarteDemande from "@/crm/kanban/CarteDemande";
import { FenetreAccepter, FenetreRefuser, type DemandeADecider } from "@/crm/parcours/DecisionDemande";
import { updateStatus } from "@/lib/actions/requests";
import type { RequestStatus } from "@/lib/types";
import { ETAPES, etapeDe, NOM_ETAPE, verdict, type CleEtape, type DemandeVue } from "./etapes";
import { lireFiltresKanban } from "./FiltresKanban";
import k from "@/crm/kanban/kanban.module.css";
import s from "./demandes.module.css";

/*
 * Demandes › Kanban : un zoom sur le début du parcours (demande de David,
 * 08/11/2026). Une colonne par étape détaillée d'une demande (etapes.ts dit
 * comment chacune se déduit), et en dernier « Dossier » : les demandes
 * acceptées, chacune menant à son dossier. Perdues et archivées sont
 * cachées par défaut (filtre de la bande).
 *
 * Accepter et refuser se font sur la carte, comme dans le Tableau du
 * Parcours. Glisser une carte ne change que le statut enregistré, et
 * seulement vers une étape qui en dépend (nouvelle, en analyse, qualifiée,
 * perdue, archivée) et où la carte arrivera vraiment ; la colonne visée le
 * dit pendant le glisser, ou dit pourquoi elle refuse. On ne glisse jamais
 * vers « Dossier » : c'est « Accepter ».
 *
 * Une colonne vide se replie en ruban (elle reçoit quand même un dépôt).
 */

const MARQUE_RAPPEL: Record<string, string> = { a_rappeler: "Rappel : à rappeler", en_cours: "Rappel : en cours" };
const MARQUE_DEVIS: Record<string, string> = { refuse: "Devis du site refusé", expire: "Devis du site expiré" };
const normaliser = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function KanbanDemandes({ demandes }: { demandes: DemandeVue[] }) {
  const router = useRouter();
  const filtres = lireFiltresKanban(useSearchParams());
  const [message, setMessage] = useState<Message | null>(null);
  const fermerMessage = useCallback(() => setMessage(null), []);
  const [decision, setDecision] = useState<{ genre: "accepter" | "refuser"; demande: DemandeADecider } | null>(null);
  const [, demarrer] = useTransition();
  const [affichees, poserStatut] = useOptimistic(demandes, (etat: DemandeVue[], m: { id: string; statut: RequestStatus }) =>
    etat.map((d) => (d.id === m.id ? { ...d, statut: m.statut } : d)),
  );
  const planche = useRef<HTMLDivElement>(null);
  const saisie = useRef<number | null>(null);
  const [hauteur, setHauteur] = useState(150);

  const visibles = useMemo(() => {
    const t = normaliser(filtres.q.trim());
    const chiffres = filtres.q.replace(/[^0-9]/g, "");
    return affichees.filter(
      (d) =>
        (filtres.origine === "all" || d.source === filtres.origine) &&
        (!t ||
          normaliser([d.client, d.email, d.depart, d.arrivee, d.societe, d.dossier?.ref].filter(Boolean).join(" ")).includes(t) ||
          (chiffres.length >= 4 && (d.telephone ?? "").replace(/[^0-9]/g, "").includes(chiffres))),
    );
  }, [affichees, filtres.q, filtres.origine]);

  const colonnes = ETAPES.filter((e) => filtres.sorties || (e.cle !== "perdue" && e.cle !== "archivee"));
  const parColonne = useMemo(() => {
    const m = new Map<CleEtape, DemandeVue[]>(ETAPES.map((e) => [e.cle, []]));
    for (const d of visibles) m.get(etapeDe(d))?.push(d);
    for (const l of m.values()) l.sort((a, b) => b.recueLe.localeCompare(a.recueLe));
    return m;
  }, [visibles]);

  /* ── Le dépôt ── */
  const deposer = (rang: number, cible: string) => {
    const d = affichees[rang];
    if (!d) return;
    const v = verdict(d, cible as CleEtape);
    if (!v) return;
    if (!v.ok) return setMessage({ texte: v.raison, ton: "erreur" });
    // Perdue : la même confirmation que « Refuser ».
    if (v.statut === "lost") return setDecision({ genre: "refuser", demande: { id: d.id, client: d.client } });
    demarrer(async () => {
      poserStatut({ id: d.id, statut: v.statut });
      try {
        await updateStatus(d.id, v.statut);
        router.refresh();
        setMessage({ texte: `${d.client} : demande passée en « ${NOM_ETAPE[cible as CleEtape]} ».` });
      } catch {
        setMessage({ texte: "L'étape n'a pas pu changer : réessayez dans un instant.", ton: "erreur" });
      }
    });
  };
  const verdictSaisie = (cible: string) => (saisie.current != null && affichees[saisie.current] ? verdict(affichees[saisie.current], cible as CleEtape) : null);
  const { glisse, commencer, apresGlisser } = useGlisser(planche, {
    estVerrouillee: (cible) => verdictSaisie(cible)?.ok === false,
    onDepot: (rang, cible) => deposer(rang, cible),
    onRefus: (cible) => {
      const v = verdictSaisie(cible);
      if (v && !v.ok) setMessage({ texte: v.raison, ton: "erreur" });
    },
  });
  const tenue = glisse ? (affichees[glisse.ligneId] ?? null) : null;
  const rangDe = (d: DemandeVue) => affichees.indexOf(d);

  const carte = (d: DemandeVue, etape: CleEtape) => {
    const marque =
      etape !== "rappel" && d.rappel && MARQUE_RAPPEL[d.rappel]
        ? { libelle: MARQUE_RAPPEL[d.rappel], ton: "ambre" as const }
        : etape === "rappel" && d.rappel
          ? { libelle: MARQUE_RAPPEL[d.rappel] ?? "Rappel", ton: "ambre" as const }
          : d.devisSite && MARQUE_DEVIS[d.devisSite]
            ? { libelle: MARQUE_DEVIS[d.devisSite], ton: "rose" as const }
            : null;
    const glissable = etape !== "dossier";
    return (
      <CarteDemande
        key={d.id}
        demande={d}
        etapeDite
        marque={marque}
        decider={(genre) => setDecision({ genre, demande: { id: d.id, client: d.client } })}
        ligne={glissable ? rangDe(d) : undefined}
        fantome={glisse?.ligneId === rangDe(d)}
        saisir={
          glissable
            ? (e) => {
                saisie.current = rangDe(d);
                setHauteur(e.currentTarget.offsetHeight);
                commencer(e, rangDe(d));
              }
            : undefined
        }
        apresGlisser={apresGlisser}
      />
    );
  };

  const colonne = (e: (typeof ETAPES)[number]) => {
    const liste = parColonne.get(e.cle) ?? [];
    const v = tenue ? verdict(tenue, e.cle) : null;
    const etat = !tenue || !v ? undefined : v.ok ? "possible" : "interdit";
    const visee = glisse?.cible === e.cle;
    if (liste.length === 0 && !(visee && v?.ok)) {
      return (
        <section key={e.cle} className={k.repliee} data-colonne={e.cle} data-etape={e.cle} data-etat={etat} data-visee={visee || undefined} aria-label={`${e.label}, aucune demande`} title={e.aide}>
          <div className={k.deplier}>
            <span className={k.verticale}>
              {e.label} <b>0</b>
            </span>
          </div>
        </section>
      );
    }
    return (
      <section key={e.cle} className={k.colonne} data-colonne={e.cle} data-etape={e.cle} data-etat={etat} data-visee={visee || undefined} aria-label={`${e.label}, ${liste.length} demandes`}>
        <header className={k.tete}>
          <div className={k.teteHaut}>
            <i className={k.pastille} aria-hidden />
            <h2>{e.label}</h2>
            <span className={k.nombre}>{liste.length}</span>
          </div>
          <p className={s.aide}>{e.aide}</p>
        </header>
        <div className={k.corps}>
          {visee && v?.ok && (
            <div className={k.place} style={{ ["--h" as string]: `${hauteur}px` }} aria-hidden>
              <span>
                <Icone nom="fleche" taille={15} />
                Passer en « {e.label} »
              </span>
            </div>
          )}
          {liste.map((d) => carte(d, e.cle))}
        </div>
      </section>
    );
  };

  return (
    <div className={`${k.racine} ${s.kanban}`}>
      <div ref={planche} className={`${k.planche} ${glisse ? k.glissement : ""}`}>
        {colonnes.map(colonne)}
      </div>

      {glisse && tenue && (
        <>
          <CarteDemande demande={tenue} etapeDite flottante style={{ left: glisse.x - glisse.dx, top: glisse.y - glisse.dy, width: glisse.largeur }} />
          {(() => {
            const v = glisse.cible ? verdict(tenue, glisse.cible as CleEtape) : null;
            if (!v) return null;
            const haut = glisse.y - glisse.dy;
            const bas = haut + hauteur + 10;
            const dessus = bas + 80 > window.innerHeight;
            return (
              <p
                className={`${k.legende} ${v.ok ? "" : k.legendeRefus} ${dessus ? k.legendeDessus : ""}`}
                style={{ left: Math.max(8, glisse.x - glisse.dx), top: dessus ? haut - 10 : bas, maxWidth: Math.min(Math.max(glisse.largeur, 300), window.innerWidth - 16) }}
                role="status"
              >
                {v.ok ? <Icone nom="fleche" taille={14} /> : <Picto nom="alerte" taille={15} />}
                <span>{v.ok ? `Passer en « ${NOM_ETAPE[glisse.cible as CleEtape]} »` : v.raison}</span>
              </p>
            );
          })()}
        </>
      )}

      {decision?.genre === "accepter" && <FenetreAccepter demande={decision.demande} onFermer={() => setDecision(null)} />}
      {decision?.genre === "refuser" && <FenetreRefuser demande={decision.demande} onFermer={() => setDecision(null)} onRefusee={setMessage} />}
      <Toast message={message} onFermer={fermerMessage} />
    </div>
  );
}

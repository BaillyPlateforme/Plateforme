"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import Bandeau from "@/ui/Bandeau";
import b from "@/ui/bandeau.module.css";
import { deplacerColonne, deplacerLigne, supprimerColonne, verrouiller } from "../actions";
import { cleDestination, couleursDestinations, dateCourte, dateLongue, jauge, lignesDe, m3, nomsDestinations, somme } from "../outils";
import { GENRES, type Colonne, type ConteneurCrm, type DossierOption, type Genre, type Ligne, type Plan, type Resultat } from "../types";
import Bulle from "./Bulle";
import { Confirmation, Jauge, Menu, Toast, type Demande, type Message } from "./elements";
import Historique from "./Historique";
import ModaleColonne from "./ModaleColonne";
import PanneauProposition, { type EtatIa } from "./PanneauProposition";
import { Picto, PICTO_GENRE } from "./Picto";
import ReglagesPlan from "./ReglagesPlan";
import TiroirLigne from "./TiroirLigne";
import { useGlisser } from "./useGlisser";
import s from "./dispatch.module.css";

/*
 * Le planning d'un plan de dispatch : un Kanban dont chaque colonne est un
 * conteneur, une tournée, une date ou une zone, et chaque client une bulle
 * qu'on glisse d'une colonne à l'autre. Le déplacement s'affiche tout de
 * suite (état optimiste) puis est confirmé par le serveur, qui peut le
 * refuser (colonne verrouillée entre-temps) : la bulle revient alors à sa
 * place, avec la raison.
 *
 * Simplification du 08/11/2026 : deux vues, Planning et Historique, en
 * pilules dans la rangée basse du bandeau (plus de barre d'onglets dessous).
 * L'ancien écran « Récapitulatif » redisait le planning colonne par colonne :
 * il reste imprimable depuis « Exporter › Récapitulatif par conteneur ».
 */

type Vue = "planning" | "historique";
type Mouvement = { id: number; colonneId: number | null; rang: number };

const ATTENTE = "attente";

const quandFr = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(iso));

export default function Planche({
  plan,
  conteneurs,
  dossiers,
  ia,
  importe,
}: {
  plan: Plan;
  conteneurs: ConteneurCrm[];
  dossiers: DossierOption[];
  ia: EtatIa;
  importe: number | null;
}) {
  const router = useRouter();
  const chemin = usePathname();
  const [vue, setVue] = useState<Vue>("planning");
  const [lignes, deplacerOptimiste] = useOptimistic(plan.lignes, (etat: Ligne[], m: Mouvement) =>
    etat.map((l) => (l.id === m.id ? { ...l, colonneId: m.colonneId, rang: m.rang } : l)),
  );
  const [, demarrer] = useTransition();
  const [message, setMessage] = useState<Message | null>(() =>
    importe ? { texte: `${importe} client${importe > 1 ? "s" : ""} importé${importe > 1 ? "s" : ""} : ils attendent dans « À répartir ».` } : null,
  );
  const [fiche, setFiche] = useState<number | null>(null);
  const [edition, setEdition] = useState<Colonne | "nouvelle" | null>(null);
  const [proposition, setProposition] = useState(false);
  const [reglages, setReglages] = useState(false);
  const [demande, setDemande] = useState<Demande | null>(null);
  const planche = useRef<HTMLDivElement>(null);
  const fermerMessage = useCallback(() => setMessage(null), []);

  // Le message d'import est lu : l'adresse perd son paramètre, un rechargement ne le réaffiche pas.
  useEffect(() => {
    if (importe) router.replace(chemin, { scroll: false });
  }, [importe, router, chemin]);

  const couleurs = useMemo(() => couleursDestinations(plan.lignes), [plan.lignes]);
  const noms = useMemo(() => nomsDestinations(plan.lignes), [plan.lignes]);
  const parCle = useMemo(() => new Map(plan.colonnes.map((c) => [String(c.id), c])), [plan.colonnes]);
  const couleur = (l: Ligne) => couleurs.get(cleDestination(l)) ?? "#4b2fe0";

  const executer = (fn: () => Promise<Resultat<unknown>>, succes?: string) =>
    demarrer(async () => {
      const r = await fn();
      if (!r.ok) setMessage({ texte: r.erreur, ton: "erreur" });
      else if (succes) setMessage({ texte: succes });
    });

  /* ── Glisser-déposer ── */
  const deposer = (ligneId: number, cible: string, index: number) => {
    const colonneId = cible === ATTENTE ? null : Number(cible);
    const ligne = lignes.find((l) => l.id === ligneId);
    if (!ligne) return;
    const dans = lignesDe(lignes, colonneId);
    if (ligne.colonneId === colonneId && dans.findIndex((l) => l.id === ligneId) === index) return;
    const autres = dans.filter((l) => l.id !== ligneId);
    const avant = autres[index] ?? null;
    const prec = autres[index - 1] ?? null;
    const rang = avant == null ? (prec?.rang ?? 0) + 1 : prec == null ? avant.rang - 1 : (prec.rang + avant.rang) / 2;
    demarrer(async () => {
      deplacerOptimiste({ id: ligneId, colonneId, rang });
      const r = await deplacerLigne(plan.id, ligneId, colonneId, avant?.id ?? null);
      if (!r.ok) setMessage({ texte: r.erreur, ton: "erreur" });
    });
  };
  const { glisse, commencer, apresGlisser } = useGlisser(planche, {
    estVerrouillee: (cible) => cible !== ATTENTE && !!parCle.get(cible)?.verrouilleeLe,
    onDepot: deposer,
    onRefus: (cible) => setMessage({ texte: `« ${parCle.get(cible)?.libelle} » est verrouillée : déverrouillez-la pour y déposer un client.`, ton: "erreur" }),
  });
  const ligneGlissee = glisse ? lignes.find((l) => l.id === glisse.ligneId) : null;

  /* ── Verrouillage ── */
  const basculerVerrou = (c: Colonne) => {
    if (c.verrouilleeLe) {
      setDemande({
        titre: `Déverrouiller « ${c.libelle} » ?`,
        texte: "La colonne pourra de nouveau être modifiée et les propositions de regroupement pourront y placer des clients. Le déverrouillage est inscrit à l'historique.",
        libelle: "Déverrouiller",
        picto: "cadenasOuvert",
        action: () => executer(() => verrouiller(plan.id, c.id, false), `« ${c.libelle} » déverrouillée`),
      });
      return;
    }
    const ls = lignesDe(lignes, c.id);
    const v = somme(ls);
    const j = jauge(v, c.capacite);
    setDemande({
      titre: `Valider « ${c.libelle} » ?`,
      texte: (
        <>
          <p>
            {ls.length} client{ls.length > 1 ? "s" : ""}, {m3(v)}
            {c.capacite ? ` sur ${m3(c.capacite)}` : ""}. Une fois verrouillée, plus aucun client n&apos;y entre ni n&apos;en sort, ses fiches ne se modifient plus, et les propositions
            n&apos;y touchent plus. Vous pourrez la déverrouiller.
          </p>
          {j.etat === "depasse" && (
            <p className={s.note} style={{ marginTop: 12 }}>
              <Picto nom="alerte" taille={16} />
              <span>Attention : elle dépasse sa capacité de {m3(-(j.reste ?? 0))}.</span>
            </p>
          )}
          {ls.length === 0 && (
            <p className={s.note} style={{ marginTop: 12 }}>
              <Picto nom="alerte" taille={16} />
              <span>Elle est vide.</span>
            </p>
          )}
        </>
      ),
      libelle: j.etat === "depasse" ? "Valider malgré le dépassement" : "Valider et verrouiller",
      action: () => executer(() => verrouiller(plan.id, c.id, true), `« ${c.libelle} » validée et verrouillée`),
    });
  };

  const supprimer = (c: Colonne) => {
    const n = lignesDe(lignes, c.id).length;
    setDemande({
      titre: `Supprimer « ${c.libelle} » ?`,
      texte: n ? `Ses ${n} client${n > 1 ? "s" : ""} reviendront dans « À répartir ». La suppression est inscrite à l'historique.` : "La colonne est vide. La suppression est inscrite à l'historique.",
      libelle: "Supprimer la colonne",
      danger: true,
      action: () => executer(() => supprimerColonne(plan.id, c.id), `« ${c.libelle} » supprimée`),
    });
  };

  /* ── Chiffres ── */
  const total = somme(lignes);
  const destinations = [...new Set(lignes.map(cleDestination))].sort((a, z) => (noms.get(a) ?? a).localeCompare(noms.get(z) ?? z, "fr"));
  const genreParDefaut: Genre = plan.colonnes.length ? plan.colonnes[plan.colonnes.length - 1].genre : "conteneur";
  const ligneOuverte = fiche != null ? lignes.find((l) => l.id === fiche) ?? null : null;

  /* ── Une colonne ── */
  const colonne = (c: Colonne | null) => {
    const cle = c ? String(c.id) : ATTENTE;
    const ls = lignesDe(lignes, c?.id ?? null);
    const v = somme(ls);
    const figee = !!c?.verrouilleeLe;
    const visee = glisse?.cible === cle;
    const sansGlissee = ls.filter((l) => l.id !== glisse?.ligneId);
    const classes = [s.colonne, !c && s.attente, figee && s.verrouillee, visee && (glisse!.refuse ? s.refus : s.cible)].filter(Boolean).join(" ");
    const bulles: React.ReactNode[] = [];
    let k = 0;
    for (const l of ls) {
      if (visee && !glisse!.refuse && l.id !== glisse!.ligneId && k === glisse!.index) bulles.push(<div key="insertion" className={s.insertion} />);
      if (l.id !== glisse?.ligneId) k++;
      bulles.push(
        <Bulle
          key={l.id}
          ligne={l}
          couleur={couleur(l)}
          figee={figee}
          fantome={glisse?.ligneId === l.id}
          onPointerDown={figee ? undefined : (e) => commencer(e, l.id)}
          onOuvrir={() => setFiche(l.id)}
        />,
      );
    }
    if (visee && !glisse!.refuse && glisse!.index >= sansGlissee.length) bulles.push(<div key="insertion" className={s.insertion} />);

    return (
      <section key={cle} className={classes} data-colonne={cle} aria-label={c ? c.libelle : "Clients à répartir"}>
        <header className={s.tete}>
          <div className={s.teteHaut}>
            <span className={s.genre}>
              <Picto nom={c ? PICTO_GENRE[c.genre] : "deplacer"} taille={13} />
              {c ? `${GENRES[c.genre].nom}${c.taille ? ` · ${c.taille}'` : ""}` : "En attente"}
            </span>
            <span className={s.espace} />
            {c && (
              <>
                {figee ? (
                  <button type="button" className={s.valide} onClick={() => basculerVerrou(c)} title="Déverrouiller">
                    <Picto nom="cadenas" taille={14} /> Validée
                  </button>
                ) : (
                  <button type="button" className={s.rond} onClick={() => basculerVerrou(c)} title="Valider et verrouiller" aria-label={`Valider et verrouiller ${c.libelle}`}>
                    <Picto nom="cadenasOuvert" taille={17} />
                  </button>
                )}
                <Menu bouton={<Picto nom="points" taille={18} />} label={`Actions sur ${c.libelle}`}>
                  {(fermer) => (
                    <>
                      <button type="button" role="menuitem" disabled={figee} onClick={() => (fermer(), setEdition(c))}>
                        <Picto nom="crayon" taille={16} /> Régler la colonne
                      </button>
                      <a role="menuitem" href={`/imprimer/dispatch/${plan.id}?doc=feuilles&colonne=${c.id}`} target="_blank" rel="noopener" onClick={fermer}>
                        <Picto nom="imprimer" taille={16} /> {GENRES[c.genre].feuille} (PDF)
                      </a>
                      <hr />
                      <button type="button" role="menuitem" disabled={plan.colonnes[0]?.id === c.id} onClick={() => (fermer(), executer(() => deplacerColonne(plan.id, c.id, -1)))}>
                        <Picto nom="gauche" taille={16} /> Déplacer vers la gauche
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={plan.colonnes[plan.colonnes.length - 1]?.id === c.id}
                        onClick={() => (fermer(), executer(() => deplacerColonne(plan.id, c.id, 1)))}
                      >
                        <Picto nom="droite" taille={16} /> Déplacer vers la droite
                      </button>
                      <hr />
                      <button type="button" role="menuitem" className={s.danger} disabled={figee} onClick={() => (fermer(), supprimer(c))}>
                        <Picto nom="corbeille" taille={16} /> Supprimer la colonne
                      </button>
                    </>
                  )}
                </Menu>
              </>
            )}
          </div>
          <h2 className={s.titreColonne}>{c ? c.libelle : "À répartir"}</h2>
          <p className={s.sousTitre}>
            {c ? (
              <>
                {[c.zone, c.jour ? `${c.genre === "conteneur" ? "départ " : ""}${dateCourte(c.jour)}` : null].filter(Boolean).join(" · ") || GENRES[c.genre].nom}
                {c.conteneur && (
                  <>
                    {" · "}
                    <Link href={`/conteneurs/${c.conteneurId}`}>{c.conteneur.numero}</Link>
                  </>
                )}
                {" · "}
                {ls.length} client{ls.length > 1 ? "s" : ""}
              </>
            ) : (
              `${ls.length} client${ls.length > 1 ? "s" : ""} · ${m3(v)}`
            )}
          </p>
          {c && <Jauge volume={v} capacite={c.capacite} />}
          {figee && (
            <p className={s.verrouInfo}>
              <Picto nom="cadenas" taille={13} /> Validée le {quandFr(c!.verrouilleeLe!)}
              {c!.verrouilleePar ? ` par ${c!.verrouilleePar}` : ""}
            </p>
          )}
        </header>
        <div className={s.corps} data-corps="">
          {bulles}
          {ls.length === 0 && !visee && (
            <div className={s.vide}>
              {c ? (
                <>
                  <Picto nom={PICTO_GENRE[c.genre]} taille={22} />
                  Déposez un client ici
                </>
              ) : (
                <>
                  <Picto nom="coche" taille={22} />
                  Tous les clients sont placés
                </>
              )}
            </div>
          )}
        </div>
        {!c && (
          <div className={s.pied}>
            <Link href={`/conteneurs/dispatch/${plan.id}/importer`} className={`${s.bouton} ${s.petit}`} style={{ width: "100%" }}>
              <Picto nom="plus" taille={14} /> Ajouter ou importer des clients
            </Link>
          </div>
        )}
        {visee && glisse!.refuse && (
          <span className={s.refusMot}>
            <Picto nom="cadenas" taille={14} /> Colonne verrouillée
          </span>
        )}
      </section>
    );
  };

  return (
    <div className={s.racine}>
      <Bandeau
        surtitre={`Dispatch international · ${plan.sens === "export" ? "Export" : "Import"}${plan.port ? ` · ${plan.port}` : ""}`}
        titre={plan.nom}
        texte={
          <>
            {lignes.length} client{lignes.length > 1 ? "s" : ""} vers {destinations.length} destination{destinations.length > 1 ? "s" : ""} · {m3(total)}
            {plan.dateReference ? ` · départ le ${dateLongue(plan.dateReference)}` : ""}
            {plan.demo ? " · plan de démonstration, données fictives" : ""}
          </>
        }
        bas={
          <nav className={b.pilules} aria-label="Vues du plan">
            {(
              [
                ["planning", "Planning"],
                ["historique", "Historique"],
              ] as const
            ).map(([v, nom]) => (
              <button key={v} type="button" className={`${b.pilule} ${s.piluleBouton}`} aria-current={vue === v ? "page" : undefined} onClick={() => setVue(v)}>
                {nom}
                {v === "historique" && <i className={b.nombre}>{plan.historique.length}</i>}
              </button>
            ))}
          </nav>
        }
      >
        <button type="button" onClick={() => setProposition(true)} disabled={lignes.length === 0}>
          <Picto nom="etincelle" taille={18} />
          {plan.proposition ? "Voir la proposition en attente" : "Proposer un regroupement"}
        </button>
        <Link href={`/conteneurs/dispatch/${plan.id}/importer`} className={b.secondaire}>
          Importer des clients
        </Link>
        <Link href="/conteneurs/dispatch" className={b.secondaire}>
          Tous les plans
        </Link>
      </Bandeau>

      <div className={s.outils}>
        {vue === "planning" && destinations.length > 0 ? (
          <div className={s.legende} aria-label="Destinations">
            {destinations.map((d) => {
              const ls = lignes.filter((l) => cleDestination(l) === d);
              return (
                <span key={d} className={s.destination} style={{ ["--c" as string]: couleurs.get(d) }}>
                  <i />
                  <b>{noms.get(d)}</b> {ls.length} client{ls.length > 1 ? "s" : ""} · {m3(somme(ls))}
                </span>
              );
            })}
          </div>
        ) : (
          <span />
        )}
        <div className={s.actions}>
          <button type="button" className={s.bouton} onClick={() => setEdition("nouvelle")}>
            <Picto nom="plus" taille={16} /> Colonne
          </button>
          <Menu
            className={s.bouton}
            label="Exporter le planning"
            bouton={
              <>
                <Picto nom="exporter" taille={16} /> Exporter
              </>
            }
          >
            {(fermer) => (
              <>
                <small>PDF imprimable</small>
                <a role="menuitem" href={`/imprimer/dispatch/${plan.id}?doc=feuilles`} target="_blank" rel="noopener" onClick={fermer}>
                  <Picto nom="imprimer" taille={16} /> Une feuille par colonne
                </a>
                <a role="menuitem" href={`/imprimer/dispatch/${plan.id}?doc=recap`} target="_blank" rel="noopener" onClick={fermer}>
                  <Picto nom="conteneur" taille={16} /> Récapitulatif par conteneur
                </a>
                <small>Excel</small>
                <a role="menuitem" href={`/api/dispatch/${plan.id}/excel`} onClick={fermer}>
                  <Picto nom="tableur" taille={16} /> Planning : une feuille par colonne
                </a>
              </>
            )}
          </Menu>
          <button type="button" className={s.bouton} onClick={() => setReglages(true)} aria-label="Réglages du plan">
            <Picto nom="reglages" taille={16} /> Réglages
          </button>
        </div>
      </div>

      {vue === "planning" && (
        <div ref={planche} className={`${s.planche} ${glisse ? s.glissement : ""}`}>
          {colonne(null)}
          {plan.colonnes.map(colonne)}
          <button type="button" className={s.ajoutColonne} onClick={() => setEdition("nouvelle")}>
            <span>
              <Picto nom="plus" taille={20} />
            </span>
            Ajouter une colonne
            <small style={{ fontWeight: 500, color: "#77738f", maxWidth: 170, textAlign: "center" }}>Conteneur, tournée, date ou zone</small>
          </button>
        </div>
      )}
      {vue === "historique" && <Historique evenements={plan.historique} />}

      {glisse && ligneGlissee && glisse.cible !== undefined && (
        <Bulle ligne={ligneGlissee} couleur={couleur(ligneGlissee)} flottante style={{ left: glisse.x - glisse.dx, top: glisse.y - glisse.dy, width: glisse.largeur }} />
      )}

      {ligneOuverte && (
        <TiroirLigne
          key={ligneOuverte.id}
          planId={plan.id}
          ligne={ligneOuverte}
          colonnes={plan.colonnes}
          dossiers={dossiers}
          couleur={couleur(ligneOuverte)}
          historique={plan.historique.filter((h) => h.ligneId === ligneOuverte.id)}
          capaciteMax={Math.max(plan.capacite20, plan.capacite40)}
          onFermer={() => setFiche(null)}
          onMessage={setMessage}
        />
      )}
      {edition && (
        <ModaleColonne
          planId={plan.id}
          colonne={edition === "nouvelle" ? null : edition}
          plan={plan}
          conteneurs={conteneurs}
          destinations={destinations.map((d) => noms.get(d) ?? d)}
          genreParDefaut={genreParDefaut}
          onFermer={() => setEdition(null)}
          onMessage={setMessage}
        />
      )}
      {proposition && <PanneauProposition plan={plan} lignes={lignes} couleurs={couleurs} ia={ia} onFermer={() => setProposition(false)} onMessage={setMessage} />}
      {reglages && <ReglagesPlan plan={plan} onFermer={() => setReglages(false)} onMessage={setMessage} />}
      {demande && <Confirmation demande={demande} onFermer={() => setDemande(null)} />}
      <Toast message={message} onFermer={fermerMessage} />
      {/* Le clic qui suit un glisser n'ouvre pas la fiche : la bulle ne s'ouvre qu'au clic franc. */}
      <ClicBulle apresGlisser={apresGlisser} ouvrir={setFiche} />
    </div>
  );
}

/**
 * Ouvre la fiche d'un client au clic sur sa bulle. Écouté sur le document :
 * un seul écouteur pour toutes les bulles, et le clic qui termine un glisser
 * est ignoré.
 */
function ClicBulle({ apresGlisser, ouvrir }: { apresGlisser: () => boolean; ouvrir: (id: number) => void }) {
  useEffect(() => {
    const clic = (e: MouseEvent) => {
      const bulle = (e.target as HTMLElement).closest<HTMLElement>("[data-ligne]");
      if (!bulle || apresGlisser() || (e.target as HTMLElement).closest("a, button")) return;
      ouvrir(Number(bulle.dataset.ligne));
    };
    document.addEventListener("click", clic);
    return () => document.removeEventListener("click", clic);
  }, [apresGlisser, ouvrir]);
  return null;
}

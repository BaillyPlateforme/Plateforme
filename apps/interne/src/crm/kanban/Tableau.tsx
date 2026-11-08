"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { Icone } from "@/ui/icones";
import { Fenetre, Toast, type Message } from "@/crm/dispatch/composants/elements";
import { Picto } from "@/crm/dispatch/composants/Picto";
import { useGlisser } from "@/crm/dispatch/composants/useGlisser";
import { dateFr, eur, m3, TYPES } from "@/crm/lib/format";
import { libelleDemande, sousStatut, type CarteDemande } from "@/crm/parcours/demandes-commun";
import { FenetreAccepter, FenetreRefuser, type DemandeADecider } from "@/crm/parcours/DecisionDemande";
import { deplacerDossier, type Choix } from "./actions";
import type { Carte, Commercial } from "./donnees";
import { INTITULE, NOM, RELANCE_JOURS, verdict, ville, type Geste, type Statut } from "./regles";
import s from "./kanban.module.css";

/*
 * Les colonnes du Parcours : une colonne par étape, une carte par dossier ;
 * en tête, les demandes du site qui n'ont pas encore leur dossier au CRM.
 * Le bandeau et les filtres sont ceux de la page (src/crm/parcours/Hub.tsx) :
 * ce tableau reçoit les dossiers et la règle qui dit lesquels montrer.
 *
 * Le glisser-déposer est celui du dispatch (useGlisser) : souris et doigt,
 * sans bibliothèque. Pendant le glisser, chaque colonne dit si elle accepte
 * le dossier (regles.ts) ; celle qu'on survole ouvre la place où il
 * arrivera — en haut, puisque les colonnes suivent la dernière activité —,
 * ou dit pourquoi elle refuse. Le dépôt déclenche l'action du métier, après
 * une petite fenêtre quand il manque une information (quel devis ? quelle
 * date ?). La carte bouge tout de suite (état optimiste) ; si le serveur
 * refuse, elle revient, avec la raison.
 *
 * Les demandes du site (colonne « Demandes ») ne se glissent pas : chaque
 * carte porte la décision — « Accepter » crée le dossier et l'espace client,
 * « Refuser » la marque perdue (parcours/DecisionDemande) —, et s'ouvre d'un
 * clic sur sa page, où la même décision attend.
 */

type Depot = { carte: Carte; vers: Statut; geste: Geste };

const SIGNES: Statut[] = ["commande", "planifie", "termine"];

const teinte = (id: number | null) => (id == null ? 0 : id % 5);

export default function TableauKanban({
  cartes,
  commerciaux,
  garder,
  statuts,
  demandes,
  filtresActifs,
}: {
  cartes: Carte[];
  commerciaux: Commercial[];
  /** Les filtres de la page : quels dossiers montrer. */
  garder: (c: Carte) => boolean;
  /** Les colonnes à montrer, dans l'ordre (toutes, sauf filtre d'étape). */
  statuts: Statut[];
  /** Les demandes du site à montrer en tête, déjà filtrées ; null : pas de colonne. */
  demandes: CarteDemande[] | null;
  filtresActifs: boolean;
}) {
  const router = useRouter();
  const [perdus, setPerdus] = useState(false);
  const [depot, setDepot] = useState<Depot | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [arrivee, setArrivee] = useState<number | null>(null);
  const [decision, setDecision] = useState<{ genre: "accepter" | "refuser"; demande: DemandeADecider } | null>(null);
  const [, demarrer] = useTransition();
  const [affichees, deplacerOptimiste] = useOptimistic(cartes, (etat: Carte[], m: { id: number; statut: Statut }) =>
    etat.map((c) => (c.id === m.id ? { ...c, statut: m.statut, majLe: new Date().toISOString() } : c)),
  );
  const planche = useRef<HTMLDivElement>(null);
  // La carte saisie : lue par les rappels du glisser (référence) ; sa hauteur, par le rendu (état).
  const saisie = useRef<{ id: number } | null>(null);
  const [hauteur, setHauteur] = useState(120);
  const fermerMessage = useCallback(() => setMessage(null), []);
  // Une seule colonne choisie (filtre d'étape) : elle s'ouvre, même « Perdu ».
  const seule = statuts.length === 1;

  // L'animation d'arrivée ne joue qu'une fois.
  useEffect(() => {
    if (arrivee == null) return;
    const t = setTimeout(() => setArrivee(null), 1400);
    return () => clearTimeout(t);
  }, [arrivee]);

  const visibles = useMemo(() => affichees.filter(garder), [affichees, garder]);
  const parColonne = useMemo(() => {
    const m = new Map<Statut, Carte[]>(statuts.map((k) => [k, []]));
    for (const c of visibles) m.get(c.statut)?.push(c);
    for (const l of m.values()) l.sort((a, b) => b.majLe.localeCompare(a.majLe) || b.id - a.id);
    return m;
  }, [visibles, statuts]);

  /* ── Le dépôt ── */
  const executer = (carte: Carte, vers: Statut, choix: Choix = {}) =>
    demarrer(async () => {
      deplacerOptimiste({ id: carte.id, statut: vers });
      setArrivee(carte.id);
      const r = await deplacerDossier(carte.id, vers, choix);
      if (r.ok) setMessage({ texte: r.message });
      else {
        setArrivee(null);
        setMessage({ texte: r.erreur, ton: "erreur" });
      }
    });

  const deposer = (id: number, cible: string) => {
    const carte = affichees.find((c) => c.id === id);
    const vers = cible as Statut;
    if (!carte) return;
    const v = verdict(carte, vers);
    if (!v) return;
    if (!v.ok) return setMessage({ texte: v.raison, ton: "erreur" });
    if (v.geste.genre === "rouvrir") return executer(carte, vers);
    setDepot({ carte, vers, geste: v.geste });
  };

  const verdictSaisie = (cible: string) => {
    const c = saisie.current && affichees.find((x) => x.id === saisie.current!.id);
    return c ? verdict(c, cible as Statut) : null;
  };
  const { glisse, commencer, apresGlisser } = useGlisser(planche, {
    estVerrouillee: (cible) => verdictSaisie(cible)?.ok === false,
    onDepot: (id, cible) => deposer(id, cible),
    onRefus: (cible) => {
      const v = verdictSaisie(cible);
      if (v && !v.ok) setMessage({ texte: v.raison, ton: "erreur" });
    },
  });
  const carteGlissee = glisse ? affichees.find((c) => c.id === glisse.ligneId) ?? null : null;

  const saisir = (e: React.PointerEvent<HTMLElement>, c: Carte) => {
    saisie.current = { id: c.id };
    setHauteur(e.currentTarget.offsetHeight);
    commencer(e, c.id);
  };
  // Le parcours d'un dossier, c'est sa page.
  const ouvrir = (c: Carte) => {
    if (!apresGlisser()) router.push(`/dossiers/${c.id}`);
  };

  /* ── La colonne des demandes du site ── */
  const colonneDemandes = (liste: CarteDemande[]) => {
    const total = liste.reduce((a, d) => a + (d.estimation ?? 0), 0);
    return (
      <section
        key="demandes"
        className={`${s.colonne} ${s.colonneDemandes}`}
        data-statut="demandes"
        data-etat={carteGlissee ? "interdit" : undefined}
        aria-label={`Demandes, ${liste.length} demandes du site à accepter ou refuser`}
      >
        <header className={s.tete}>
          <div className={s.teteHaut}>
            <i className={s.pastille} aria-hidden />
            <h2>Demandes</h2>
            <span className={s.nombre}>{liste.length}</span>
          </div>
          <p className={s.somme}>
            {total > 0 ? (
              <>
                <b>{eur(total)}</b>
                <span>estimés en ligne</span>
              </>
            ) : (
              <span className={s.sansMontant}>Pas encore de montant</span>
            )}
          </p>
        </header>
        <div className={s.corps}>
          {liste.map((d) => (
            <CarteDeDemande key={d.id} demande={d} decider={(genre) => setDecision({ genre, demande: { id: d.id, client: d.client } })} />
          ))}
          {liste.length === 0 && (
            <div className={s.vide}>
              <Icone nom="globe" taille={20} />
              <span>Aucune demande{filtresActifs ? " pour ces filtres" : ""}</span>
            </div>
          )}
        </div>
      </section>
    );
  };

  /* ── Une colonne ── */
  const colonne = (statut: Statut) => {
    const liste = parColonne.get(statut) ?? [];
    const total = liste.reduce((a, c) => a + (c.montant ?? 0), 0);
    const visee = glisse?.cible === statut;
    const v = carteGlissee ? verdict(carteGlissee, statut) : null;
    const etat = !carteGlissee || !v ? undefined : v.ok ? "possible" : "interdit";
    // « Perdu » est repliée par défaut ; « Nouveau », vide, aussi : aucun dépôt n'y mène, les dossiers y naissent.
    const replie = !seule && ((statut === "perdu" && !perdus) || (statut === "prospect" && liste.length === 0));

    if (replie) {
      const pliable = statut === "perdu";
      return (
        <section key={statut} className={s.repliee} data-colonne={statut} data-etat={etat} data-visee={visee || undefined} data-statut={statut} aria-label={`${NOM[statut]}, ${liste.length} dossiers, colonne repliée`}>
          <button
            type="button"
            className={s.deplier}
            onClick={pliable ? () => setPerdus(true) : undefined}
            disabled={!pliable}
            aria-label={pliable ? "Déplier la colonne des dossiers perdus" : `${NOM[statut]} : aucun dossier`}
            title={pliable ? "Déplier" : "Les nouveaux dossiers arrivent ici"}
          >
            <span className={s.verticale}>
              {NOM[statut]} <b>{liste.length}</b>
            </span>
            {pliable && <Icone nom="chevron" taille={16} className={s.chevronDroite} />}
          </button>
        </section>
      );
    }

    return (
      <section key={statut} className={s.colonne} data-colonne={statut} data-statut={statut} data-etat={etat} data-visee={visee || undefined} aria-label={`${NOM[statut]}, ${liste.length} dossiers`}>
        <header className={s.tete}>
          <div className={s.teteHaut}>
            <i className={s.pastille} aria-hidden />
            <h2>{NOM[statut]}</h2>
            <span className={s.nombre}>{liste.length}</span>
            {statut === "perdu" && !seule && (
              <button type="button" className={s.replier} onClick={() => setPerdus(false)} aria-label="Replier la colonne des dossiers perdus" title="Replier">
                <Icone nom="chevron" taille={15} />
              </button>
            )}
          </div>
          <p className={s.somme}>
            {total > 0 ? (
              <>
                <b>{eur(total)}</b>
                <span>{SIGNES.includes(statut) ? "signés" : "en devis"}</span>
              </>
            ) : (
              <span className={s.sansMontant}>Pas encore de montant</span>
            )}
          </p>
        </header>
        <div className={s.corps} data-corps="">
          {visee && v?.ok && (
            <div className={s.place} style={{ ["--h" as string]: `${hauteur}px` }} aria-hidden>
              <span>
                <Icone nom="fleche" taille={15} />
                {INTITULE[v.geste.genre]}
              </span>
            </div>
          )}
          {liste.map((c) => (
            <CarteDossier
              key={c.id}
              carte={c}
              fantome={glisse?.ligneId === c.id}
              arrivee={arrivee === c.id}
              onPointerDown={(e) => saisir(e, c)}
              onOuvrir={() => ouvrir(c)}
            />
          ))}
          {liste.length === 0 && !(visee && v?.ok) && (
            <div className={s.vide}>
              <Icone nom="kanban" taille={20} />
              <span>Aucun dossier{filtresActifs ? " pour ces filtres" : ""}</span>
            </div>
          )}
        </div>
      </section>
    );
  };

  return (
    <div className={s.racine}>
      <div ref={planche} className={`${s.planche} ${glisse ? s.glissement : ""}`}>
        {demandes && colonneDemandes(demandes)}
        {statuts.map(colonne)}
      </div>

      {glisse && carteGlissee && (
        <>
          <CarteDossier carte={carteGlissee} flottante style={{ left: glisse.x - glisse.dx, top: glisse.y - glisse.dy, width: glisse.largeur }} />
          {/* Sous la carte qu'on tient : ce que fera le dépôt, ou pourquoi il est refusé. */}
          {(() => {
            const v = glisse.cible ? verdict(carteGlissee, glisse.cible as Statut) : null;
            if (!v) return null;
            const haut = glisse.y - glisse.dy;
            const bas = haut + hauteur + 10;
            // Trop près du bas de l'écran (au doigt, souvent) : la légende passe au-dessus de la carte.
            const dessus = bas + 80 > window.innerHeight;
            return (
              <p
                className={`${s.legende} ${v.ok ? "" : s.legendeRefus} ${dessus ? s.legendeDessus : ""}`}
                style={{ left: Math.max(8, glisse.x - glisse.dx), top: dessus ? haut - 10 : bas, maxWidth: Math.min(Math.max(glisse.largeur, 300), window.innerWidth - 16) }}
                role="status"
              >
                {v.ok ? <Icone nom="fleche" taille={14} /> : <Picto nom="alerte" taille={15} />}
                <span>{v.ok ? `${INTITULE[v.geste.genre]} · « ${NOM[glisse.cible as Statut]} »` : v.raison}</span>
              </p>
            );
          })()}
        </>
      )}

      {depot && (
        <FenetreDepot
          key={`${depot.carte.id}-${depot.vers}`}
          depot={depot}
          commerciaux={commerciaux}
          onFermer={() => setDepot(null)}
          onValider={(choix) => {
            const d = depot;
            setDepot(null);
            executer(d.carte, d.vers, choix);
          }}
        />
      )}
      {decision?.genre === "accepter" && <FenetreAccepter demande={decision.demande} onFermer={() => setDecision(null)} />}
      {decision?.genre === "refuser" && <FenetreRefuser demande={decision.demande} onFermer={() => setDecision(null)} onRefusee={setMessage} />}
      <Toast message={message} onFermer={fermerMessage} />
    </div>
  );
}

/* ───────── Une demande du site ───────── */

/**
 * Une demande du site : un clic l'ouvre (le nom du client est un lien qui
 * couvre la carte), et ses deux boutons décident sans l'ouvrir. Elle ne se
 * glisse pas.
 */
function CarteDeDemande({ demande: d, decider }: { demande: CarteDemande; decider: (genre: "accepter" | "refuser") => void }) {
  const date = d.dateSouhaitee ? dateFr(`${d.dateSouhaitee}T12:00:00Z`, { day: "numeric", month: "short", year: "numeric" }) : null;
  return (
    <article className={`${s.carte} ${s.carteDemande}`}>
      <div className={s.carteHaut}>
        <span className={s.source} title={d.source === "email" ? "Reçue par e-mail" : "Formulaire du site"}>
          <Icone nom={d.source === "email" ? "courrier" : "globe"} taille={14} />
        </span>
        <Link href={`/dashboard/${d.id}`} className={`${s.client} ${s.lienCarte}`} aria-label={`${d.client}, demande du site. Ouvrir la demande`}>
          {d.client}
        </Link>
        <span className={s.statutDemande} data-statut={sousStatut(d.statut)}>
          {libelleDemande(d.statut)}
        </span>
      </div>
      <div className={s.ligneRef}>
        <span className={s.ref}>Reçue le {dateFr(d.recueLe, { day: "numeric", month: "short" })}</span>
        <span className={s.segment} data-segment={d.parcours === "particulier" ? "particulier" : "compte"} title={d.parcoursLabel}>
          {d.parcoursLabel}
        </span>
      </div>
      <p className={s.trajet} title={[d.depart, d.arrivee].filter(Boolean).join(" → ")}>
        <i className={s.point} />
        <span>{d.depart ?? "Départ à préciser"}</span>
        <Icone nom="fleche" taille={13} className={s.flecheTrajet} />
        <span>{d.arrivee ?? "Arrivée à préciser"}</span>
      </p>
      <div className={s.pied}>
        <span className={s.volume}>{d.volume != null && d.volume > 0 ? m3(d.volume) : "Volume ?"}</span>
        <span className={s.date} title="Date souhaitée">
          <Icone nom="calendrier" taille={13} />
          {date ?? "Date à fixer"}
        </span>
        {d.estimation != null && (
          <span className={s.montant} title="Estimation donnée par le site">
            {eur(d.estimation)}
          </span>
        )}
      </div>
      <div className={s.decision}>
        {d.incomplete && (
          <span className={s.incomplete} title="Il manque le volume ou une adresse, ou le client n'a pas fini de compléter sa demande">
            Incomplète
          </span>
        )}
        <button type="button" className={s.refuser} onClick={() => decider("refuser")} title="Refuser : la demande passe en « Perdue »">
          Refuser
        </button>
        <button type="button" className={s.accepter} onClick={() => decider("accepter")} title="Accepter : créer le dossier et l'espace client">
          <Icone nom="coche" taille={14} />
          Accepter
        </button>
      </div>
    </article>
  );
}

/* ───────── Une carte ───────── */

function CarteDossier({
  carte: c,
  fantome,
  flottante,
  arrivee,
  style,
  onPointerDown,
  onOuvrir,
}: {
  carte: Carte;
  fantome?: boolean;
  flottante?: boolean;
  arrivee?: boolean;
  style?: React.CSSProperties;
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onOuvrir?: () => void;
}) {
  const de = ville(c.depart);
  const a = ville(c.arrivee);
  const date = c.dateChargement ? dateFr(c.dateChargement, { day: "numeric", month: "short", year: "numeric" }) : c.periode;
  const classes = [s.carte, fantome && s.fantome, flottante && s.flottante, arrivee && s.arrivee].filter(Boolean).join(" ");
  return (
    <div
      className={classes}
      style={style}
      data-ligne={flottante ? undefined : c.id}
      data-segment={c.segment}
      role={flottante ? undefined : "link"}
      tabIndex={flottante ? -1 : 0}
      aria-label={flottante ? undefined : `${c.client}, ${c.ref}. Ouvrir le parcours`}
      onPointerDown={onPointerDown}
      onClick={onOuvrir}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onOuvrir?.();
        }
      }}
    >
      <div className={s.carteHaut}>
        <span className={s.prise} data-prise="" title="Glisser pour déplacer" aria-hidden>
          <Picto nom="prise" taille={14} />
        </span>
        <span className={s.client}>{c.client}</span>
        <span className={s.avatar} data-teinte={teinte(c.commercialId)} title={c.commercial ? `Commercial : ${c.commercial}` : "Aucun commercial"}>
          {c.initiales ?? "—"}
        </span>
      </div>
      <div className={s.ligneRef}>
        <span className={s.ref}>{c.ref}</span>
        <span className={s.segment} data-segment={c.segment}>
          {TYPES[c.segment] ?? c.segment}
        </span>
        {c.site && (
          <span className={s.signe} title="Venu d'une demande du site">
            <Icone nom="globe" taille={13} />
          </span>
        )}
        {c.espace && (
          <span className={s.signe} title="Espace client ouvert">
            <Icone nom="equipe" taille={13} />
          </span>
        )}
      </div>
      <p className={s.trajet} title={[c.depart, c.arrivee].filter(Boolean).join(" → ")}>
        <i className={s.point} />
        <span>{de ?? "Départ à préciser"}</span>
        <Icone nom="fleche" taille={13} className={s.flecheTrajet} />
        <span>{a ?? "Arrivée à préciser"}</span>
      </p>
      <div className={s.pied}>
        <span className={s.volume}>{c.volume > 0 ? m3(c.volume) : "Volume ?"}</span>
        <span className={s.date} title={c.dateChargement ? "Date de chargement" : "Période souhaitée"}>
          <Icone nom="calendrier" taille={13} />
          {date ?? "Date à fixer"}
        </span>
        {c.montant != null && (
          <span className={s.montant} data-signe={c.signe || undefined} title={c.signe ? "Devis signé" : "Dernier devis envoyé"}>
            {eur(c.montant)}
          </span>
        )}
      </div>
      {c.attente != null && c.attente >= RELANCE_JOURS && (
        <p className={s.alerte}>
          <Icone nom="horloge" taille={13} />
          Devis sans réponse depuis {c.attente} jours
        </p>
      )}
    </div>
  );
}

/* ───────── La petite fenêtre du dépôt ───────── */

const FORMULE: Record<string, string> = { economique: "Économique", standard: "Standard", premium: "Premium", libre: "Devis libre" };
const STATUT_DEVIS: Record<string, string> = { brouillon: "Brouillon", envoye: "Envoyé", signe: "Signé", refuse: "Non retenu" };
const demain = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function FenetreDepot({ depot, commerciaux, onFermer, onValider }: { depot: Depot; commerciaux: Commercial[]; onFermer: () => void; onValider: (c: Choix) => void }) {
  const { carte, vers, geste } = depot;
  const devis = "devis" in geste ? geste.devis : [];
  const [devisId, setDevisId] = useState<number | null>(() => (devis.find((d) => d.formule === "standard") ?? devis[0])?.id ?? null);
  const [signature, setSignature] = useState(false);
  const [chargement, setChargement] = useState(carte.dateChargement?.slice(0, 10) ?? "");
  const [livraison, setLivraison] = useState("");
  const factures = geste.genre === "regler" ? geste.factures : [];
  const [factureId, setFactureId] = useState<number | null>(factures[0]?.id ?? null);
  const [jour, setJour] = useState(demain);
  const [heure, setHeure] = useState("09:00");
  const [mode, setMode] = useState<"phys" | "visio">("phys");
  const [commercialId, setCommercialId] = useState<number | null>(carte.commercialId ?? commerciaux[0]?.id ?? null);

  const sous = `${carte.client} · ${carte.ref} · vers « ${NOM[vers]} »`;
  const annuler = (
    <button type="button" className={s.boutonClair} onClick={onFermer}>
      Annuler
    </button>
  );
  const valider = (libelle: string, choix: Choix | null, danger?: boolean) => (
    <button type="button" className={danger ? s.boutonDanger : s.boutonPlein} disabled={!choix} autoFocus onClick={() => choix && onValider(choix)}>
      {libelle}
    </button>
  );

  const choixDevis = (
    <div className={s.choixListe} role="radiogroup" aria-label="Devis">
      {devis.map((d) => (
        <label key={d.id} className={s.choixDevis}>
          <input type="radio" name="devis" checked={devisId === d.id} onChange={() => setDevisId(d.id)} />
          <span className={s.choixTexte}>
            <b>{FORMULE[d.formule] ?? d.formule}</b>
            <small>
              {d.numero} · {STATUT_DEVIS[d.statut] ?? d.statut}
              {d.envoyeLe ? ` le ${dateFr(d.envoyeLe, { day: "numeric", month: "short" })}` : ""}
            </small>
          </span>
          <span className={s.choixMontant}>{eur(d.montant)}</span>
        </label>
      ))}
    </div>
  );

  switch (geste.genre) {
    case "signer":
      return (
        <Fenetre titre="Quel devis le client a-t-il signé ?" sousTitre={sous} picto="crayon" taille="etroite" onFermer={onFermer} pied={<>{annuler}{valider("Enregistrer la signature", devisId ? { devisId } : null)}</>}>
          <div className={s.fenetreCorps}>
            {choixDevis}
            <p className={s.aide}>Les autres formules passent en « Non retenu ». Le dossier passe en « Signé ».</p>
          </div>
        </Fenetre>
      );
    case "envoyer":
      return (
        <Fenetre titre="Quel devis envoyer ?" sousTitre={sous} picto="fleche" taille="etroite" onFermer={onFermer} pied={<>{annuler}{valider("Marquer comme envoyé", devisId ? { devisId, signature } : null)}</>}>
          <div className={s.fenetreCorps}>
            {choixDevis}
            <label className={s.case}>
              <input type="checkbox" checked={signature} onChange={(e) => setSignature(e.target.checked)} />
              <span>
                Avec un lien de signature électronique
                <small>Le lien se copie ensuite depuis la fiche du dossier.</small>
              </span>
            </label>
            <p className={s.aide}>Aucun message ne part d&apos;ici : le CRM enregistre l&apos;envoi.</p>
          </div>
        </Fenetre>
      );
    case "generer":
      return (
        <Fenetre titre="Établir les devis ?" sousTitre={sous} picto="etincelle" taille="etroite" onFermer={onFermer} pied={<>{annuler}{valider("Établir les 3 formules", {})}</>}>
          <div className={s.fenetreCorps}>
            <p className={s.texte}>
              Les formules Économique, Standard et Premium sont calculées sur le volume du dossier ({m3(carte.volume)}) et enregistrées en brouillon. Le dossier passe en « {NOM[vers]} ».
            </p>
          </div>
        </Fenetre>
      );
    case "sansDevis":
      return (
        <Fenetre titre="Passer en commande sans devis ?" sousTitre={sous} picto="coche" taille="etroite" onFermer={onFermer} pied={<>{annuler}{valider("Passer en commande", {})}</>}>
          <div className={s.fenetreCorps}>
            <p className={s.texte}>Dossier militaire : pas de devis, le client dépose ses documents et le dossier passe directement en commande.</p>
          </div>
        </Fenetre>
      );
    case "planifier": {
      const ok = /^\d{4}-\d{2}-\d{2}$/.test(chargement) && (!livraison || livraison >= chargement);
      return (
        <Fenetre
          titre="Planifier le déménagement"
          sousTitre={sous}
          picto="date"
          taille="etroite"
          onFermer={onFermer}
          pied={<>{annuler}{valider("Planifier", ok ? { dateChargement: chargement, dateLivraison: livraison || undefined } : null)}</>}
        >
          <div className={s.fenetreCorps}>
            <div className={s.deuxChamps}>
              <label className={s.champ}>
                <span>Chargement</span>
                <input type="date" value={chargement} required onChange={(e) => setChargement(e.target.value)} />
              </label>
              <label className={s.champ}>
                <span>Livraison</span>
                <input type="date" value={livraison} min={chargement || undefined} onChange={(e) => setLivraison(e.target.value)} />
                <small>Vide : le jour du chargement.</small>
              </label>
            </div>
          </div>
        </Fenetre>
      );
    }
    case "regler":
      return (
        <Fenetre titre="Quelle facture est réglée ?" sousTitre={sous} picto="coche" taille="etroite" onFermer={onFermer} pied={<>{annuler}{valider("Marquer réglée", factureId ? { factureId } : null)}</>}>
          <div className={s.fenetreCorps}>
            <div className={s.choixListe} role="radiogroup" aria-label="Factures à régler">
              {factures.map((f) => (
                <label key={f.id} className={s.choixDevis}>
                  <input type="radio" name="facture" checked={factureId === f.id} onChange={() => setFactureId(f.id)} />
                  <span className={s.choixTexte}>
                    <b>{f.numero}</b>
                    <small>
                      {f.objet} · émise le {dateFr(f.emiseLe, { day: "numeric", month: "short", year: "numeric" })}
                    </small>
                  </span>
                  <span className={s.choixMontant}>{eur(f.montant)}</span>
                </label>
              ))}
            </div>
            <p className={s.aide}>La facture est marquée payée aujourd&apos;hui. Le dossier passe en « Terminé ».</p>
          </div>
        </Fenetre>
      );
    case "perdre":
      return (
        <Fenetre titre="Marquer ce dossier perdu ?" sousTitre={sous} picto="alerte" ton="rose" taille="etroite" onFermer={onFermer} pied={<>{annuler}{valider("Marquer perdu", {}, true)}</>}>
          <div className={s.fenetreCorps}>
            <p className={s.texte}>Il reste consultable et peut être rouvert. Ses devis, paiements et factures restent tels quels.</p>
          </div>
        </Fenetre>
      );
    case "visite": {
      const debut = /^\d{4}-\d{2}-\d{2}$/.test(jour) && /^\d{2}:\d{2}$/.test(heure) ? new Date(`${jour}T${heure}`) : null;
      const ok = debut && !Number.isNaN(debut.getTime()) && commercialId;
      return (
        <Fenetre
          titre="Planifier la visite technique"
          sousTitre={sous}
          picto="date"
          taille="etroite"
          onFermer={onFermer}
          pied={<>{annuler}{valider("Planifier la visite", ok ? { visite: { debut: debut!.toISOString(), type: mode, commercialId: commercialId!, dureeMin: 60 } } : null)}</>}
        >
          <div className={s.fenetreCorps}>
            <div className={s.modes} role="radiogroup" aria-label="Type de visite">
              {(
                [
                  ["phys", "Sur place"],
                  ["visio", "En visio"],
                ] as const
              ).map(([k, l]) => (
                <label key={k}>
                  <input type="radio" name="mode" checked={mode === k} onChange={() => setMode(k)} />
                  {l}
                </label>
              ))}
            </div>
            <div className={s.deuxChamps}>
              <label className={s.champ}>
                <span>Date</span>
                <input type="date" value={jour} onChange={(e) => setJour(e.target.value)} />
              </label>
              <label className={s.champ}>
                <span>Heure</span>
                <input type="time" value={heure} step={900} onChange={(e) => setHeure(e.target.value)} />
              </label>
            </div>
            <label className={s.champ}>
              <span>Commercial</span>
              <select value={commercialId ?? ""} onChange={(e) => setCommercialId(Number(e.target.value) || null)}>
                {commerciaux.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
            </label>
            <p className={s.aide}>Une heure, au planning commercial du commercial choisi.</p>
          </div>
        </Fenetre>
      );
    }
    default:
      return null;
  }
}

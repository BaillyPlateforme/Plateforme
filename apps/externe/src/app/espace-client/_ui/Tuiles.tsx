import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { Espace } from "@/lib/espace-client/espace";
import { estRecent, eurosAffiches, heure, jourMois, pluriel } from "@/lib/espace-client/format";
import { arrhesPayees, devisRetenu, livraisonCourante } from "@/lib/espace-client/progression";
import { segmentDe } from "@/lib/espace-client/segments";
import { Icone } from "./Icone";

type Tuile = { cle: string; span: number; html: ReactNode; href: string; classe?: string; style?: CSSProperties };

/** Chaque rangée remplit ses douze colonnes, quelles que soient les rubriques visibles (micro démo). */
function repartir(tuiles: Tuile[]) {
  const out = tuiles.map((t) => ({ ...t }));
  let rangee: typeof out = [];
  let somme = 0;
  const vider = () => {
    if (somme < 12 && rangee.length) rangee.forEach((t) => (t.span = 12 / rangee.length));
    rangee = [];
    somme = 0;
  };
  for (const t of out) {
    if (somme + t.span > 12) vider();
    rangee.push(t);
    somme += t.span;
  }
  vider();
  return out;
}

const Va = () => (
  <span className="go">
    <Icone nom="arrow" />
  </span>
);

/** Les tuiles des rubriques, avec ce qui est fait et ce qui reste à faire. */
export function Tuiles({ e, services, tutos }: { e: Espace; services: number; tutos: number }) {
  const { dossier, vis } = e;
  const base = `/espace-client/${dossier.reference}`;
  const tuiles: Tuile[] = [];

  if (vis.devis) {
    const enAttente = e.devis.find((x) => x.statut === "envoye");
    const retenu = devisRetenu(e.devis);
    const montre = enAttente ?? retenu;
    const arrhesDues = !!retenu && segmentDe(e.client.type).paieEnLigne && !arrhesPayees(retenu, e.factures);
    tuiles.push({
      cle: "devis", span: 4, href: `${base}/devis`,
      html: (
        <>
          <span className="ti"><Icone nom="devis" /></span>
          <div>
            <h3>Mes devis</h3>
            {montre && <div className="big num" style={{ marginTop: 4 }}>{eurosAffiches(montre.montant_ttc)}</div>}
            <p>
              {enAttente
                ? `${enAttente.formule} · en attente de votre accord`
                : retenu
                  ? `Formule ${retenu.formule}${retenu.accepte_le ? ` acceptée le ${jourMois(retenu.accepte_le)}` : ""}`
                  : "Votre devis est en préparation."}
            </p>
          </div>
          <div className="foot">
            {enAttente ? <span className="badge todo">À valider</span> : arrhesDues ? <span className="badge todo">Arrhes à régler</span> : retenu ? <span className="badge ok">Accepté</span> : <span className="badge plain">En préparation</span>}
            <Va />
          </div>
        </>
      ),
    });
  }

  const equipe = e.documents.filter((x) => x.source === "equipe");
  const aFaire = vis.documentsAFaire;
  tuiles.push({
    cle: "documents", span: 8, href: `${base}/documents`, classe: "photo wide", style: { "--img": "url('/espace-client/interieur-3.jpg')" } as CSSProperties,
    html: (
      <>
        <span className="ti"><Icone nom="documents" /></span>
        <div>
          <h3>Mes documents</h3>
          <p>{aFaire ? `${pluriel(aFaire, "élément")} à compléter : conditions de livraison, déclaration de valeurs, pièces justificatives.` : "Tous vos documents sont complets."}</p>
          {equipe.length > 0 && (
            <div className="mini-list">
              {equipe.slice(0, 2).map((x) => (
                <div key={x.id}>
                  <span>
                    {x.libelle}
                    {estRecent(x.created_at) && <span className="new-tag">NOUVEAU</span>}
                  </span>
                  <span>{jourMois(x.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="foot">
          {aFaire ? <span className="badge todo">{aFaire} à faire</span> : <span className="badge ok">Complet</span>}
          <Va />
        </div>
      </>
    ),
  });

  if (vis.factures) {
    const aPayer = e.factures.filter((f) => f.statut !== "payee").sort((a, b) => a.echeance.localeCompare(b.echeance));
    const du = aPayer.reduce((n, f) => n + f.montant_ttc, 0);
    tuiles.push({
      cle: "factures", span: 4, href: vis.devis ? `${base}/devis#factures` : `${base}/devis`,
      html: (
        <>
          <span className="ti"><Icone nom="factures" /></span>
          <div>
            <h3>Mes factures</h3>
            {du ? (
              <>
                <div className="big num" style={{ marginTop: 4 }}>{eurosAffiches(du)}</div>
                <p>à régler avant le {jourMois(aPayer[0].echeance)}</p>
              </>
            ) : (
              <p>{e.factures.length ? "Toutes vos factures sont réglées." : "Aucune facture pour le moment."}</p>
            )}
          </div>
          <div className="foot">
            {du ? <span className="badge todo">À payer</span> : <span className="badge ok">À jour</span>}
            <Va />
          </div>
        </>
      ),
    });
  }

  const livraison = livraisonCourante(e.livraisons);
  tuiles.push({
    cle: "cartons", span: 4, href: `${base}/cartons`,
    html: (
      <>
        <span className="ti"><Icone nom="cartons" /></span>
        <div>
          <h3>Livraison de cartons</h3>
          <p>
            {livraison
              ? `${livraison.nb_cartons ? `${livraison.nb_cartons} cartons` : "Cartons"} · samedi ${jourMois(livraison.date_samedi)}${livraison.creneau_debut ? `, ${heure(livraison.creneau_debut)} – ${heure(livraison.creneau_fin!)}` : ""}`
              : dossier.cartons_non_necessaires
                ? "Vous avez indiqué ne pas avoir besoin de cartons."
                : "Choisissez un samedi : nous vous livrons les cartons vides."}
          </p>
        </div>
        <div className="foot">
          {livraison ? (
            <span className="badge ok">{livraison.statut === "livree" ? "Livrée" : "Planifiée"}</span>
          ) : dossier.cartons_non_necessaires || dossier.statut === "termine" ? (
            <span className="badge plain">Sans objet</span>
          ) : (
            <span className="badge todo">À planifier</span>
          )}
          <Va />
        </div>
      </>
    ),
  });

  if (vis.conteneur) {
    tuiles.push({
      cle: "conteneur", span: 8, href: `${base}/conteneur`, classe: "dark",
      html: (
        <>
          <span className="ti"><Icone nom="conteneur" /></span>
          <div>
            <h3>Suivi de mon conteneur</h3>
            <p>{dossier.compagnie ? `${dossier.compagnie}${dossier.eta ? ` · arrivée prévue le ${jourMois(dossier.eta)}` : ""}` : "Le numéro vous sera communiqué dès la réservation."}</p>
            {dossier.numero_conteneur && <div className="container-id">{dossier.numero_conteneur}</div>}
          </div>
          <div className="foot">
            <span className="badge plain" style={{ background: "rgba(255,255,255,.12)", color: "#fff" }}>
              {dossier.mode_transport === "aerien" ? "Aérien" : "Maritime"}
              {dossier.port_depart && dossier.port_arrivee ? ` · ${dossier.port_depart} → ${dossier.port_arrivee}` : ""}
            </span>
            <Va />
          </div>
        </>
      ),
    });
  }

  tuiles.push({
    cle: "services", span: 4, href: `${base}/services`,
    html: (
      <>
        <span className="ti"><Icone nom="services" /></span>
        <div>
          <h3>Services complémentaires</h3>
          <p>Garde-meubles, nettoyage, monte-meuble, transfert de véhicule…</p>
        </div>
        <div className="foot">
          <span className="badge plain">{pluriel(services, "service")}</span>
          <Va />
        </div>
      </>
    ),
  });

  tuiles.push({
    cle: "tutos", span: 4, href: `${base}/tutos`, classe: "photo", style: { "--img": "url('/espace-client/interieur-2.jpg')" } as CSSProperties,
    html: (
      <>
        <span className="ti"><Icone nom="tutos" /></span>
        <div>
          <h3>Mes tutos</h3>
          <p>Bien remplir un carton, protéger le fragile, préparer le jour J.</p>
        </div>
        <div className="foot">
          <span className="badge plain" style={{ background: "rgba(255,255,255,.16)", color: "#fff" }}>{pluriel(tutos, "tuto")}</span>
          <Va />
        </div>
      </>
    ),
  });

  const sav = e.sav[0];
  tuiles.push({
    cle: "sav", span: 4, href: `${base}/sav`, classe: vis.savActif ? "" : "locked",
    html: (
      <>
        <span className="ti"><Icone nom={vis.savActif ? "sav" : "lock"} /></span>
        <div>
          <h3>SAV</h3>
          <p>
            {vis.savActif
              ? sav
                ? `${pluriel(e.sav.length, "déclaration")} · ${sav.statut === "cloturee" ? "clôturée" : "en cours de traitement"}`
                : "Un dommage ? Déclarez-le en ligne."
              : "Accessible après votre livraison, en cas de dommage."}
          </p>
        </div>
        <div className="foot">
          <span className="badge plain">{vis.savActif ? "Ouvert" : `Après le ${jourMois(dossier.periode_fin)}`}</span>
          <Va />
        </div>
      </>
    ),
  });

  return (
    <div className="tiles">
      {repartir(tuiles).map((t, n) => (
        <Link key={t.cle} href={t.href} className={`tile apparait ${t.classe ?? ""}`} style={{ ...t.style, "--s": t.span, "--d": n % 3 } as CSSProperties}>
          {t.html}
        </Link>
      ))}
    </div>
  );
}

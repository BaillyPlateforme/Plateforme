import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { chargerEspace } from "@/lib/espace-client/espace";
import { dateCourte, jourMois, joursRestants, nomPays } from "@/lib/espace-client/format";
import { MODE_TRANSPORT } from "@/lib/espace-client/libelles";
import { PageHero } from "../../../_ui/PageHero";
import { FlecheTrajet, Icone } from "../../../_ui/Icone";

export const metadata: Metadata = { title: "Suivi de mon conteneur" };

/**
 * Le suivi du conteneur, pour l'international maritime ou aérien : le
 * numéro, la compagnie, et le lien de suivi de la compagnie elle-même — la
 * position en temps réel, c'est chez elle.
 */
export default async function Conteneur({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const e = await chargerEspace(ref);
  if (!e.vis.conteneur) notFound();
  const { dossier } = e;
  const aerien = dossier.mode_transport === "aerien";
  const etapes = [
    { t: "Chargement", d: `${dossier.ville_depart}, le ${jourMois(dossier.periode_debut)}`, fait: joursRestants(dossier.periode_debut) < 0 },
    { t: aerien ? "Décollage" : "Embarquement", d: dossier.port_depart ?? "Date fixée par la compagnie", fait: false },
    { t: aerien ? "Arrivée à l'aéroport" : "Arrivée au port", d: dossier.eta ? `Prévue le ${jourMois(dossier.eta)}` : nomPays(dossier.pays_destination), fait: !!dossier.eta && joursRestants(dossier.eta) < 0 },
    { t: "Livraison", d: `Vers le ${jourMois(dossier.periode_fin)}`, fait: dossier.statut === "termine" },
  ];

  return (
    <>
      <PageHero e={e} titre={aerien ? "Suivi de mon envoi" : "Suivi de mon conteneur"} sous={`${dossier.ville_depart} → ${dossier.ville_arrivee} · ${nomPays(dossier.pays_destination)}`} active="accueil" />
      <main className="section">
        <div className="wrap" style={{ maxWidth: 900 }}>
          {dossier.numero_conteneur ? (
            <>
              <div className="card conteneur-carte apparait">
                <p className="kicker">{aerien ? "N° de lettre de transport" : "N° de conteneur"}</p>
                <div className="numero">{dossier.numero_conteneur}</div>
                <div className="conteneur-trajet">
                  <div>
                    <small>Départ</small>
                    <div className="num">{dossier.port_depart ?? dossier.ville_depart}</div>
                  </div>
                  <div className="fl">
                    <FlecheTrajet />
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <small>Arrivée prévue</small>
                    <div className="num">{dossier.eta ? dateCourte(dossier.eta) : (dossier.port_arrivee ?? dossier.ville_arrivee)}</div>
                  </div>
                </div>
              </div>
              <dl className="kv apparait" style={{ margin: "22px 4px" }}>
                <dt>Compagnie</dt>
                <dd>{dossier.compagnie ?? "—"}</dd>
                {dossier.navire && (
                  <>
                    <dt>{aerien ? "Vol" : "Navire"}</dt>
                    <dd>{dossier.navire}</dd>
                  </>
                )}
                <dt>Transport</dt>
                <dd>{MODE_TRANSPORT[dossier.mode_transport]}</dd>
                {dossier.port_arrivee && (
                  <>
                    <dt>{aerien ? "Aéroport d'arrivée" : "Port d'arrivée"}</dt>
                    <dd>{dossier.port_arrivee}</dd>
                  </>
                )}
                <dt>Statut</dt>
                <dd>{dossier.statut_conteneur ?? "En attente d'embarquement"}</dd>
              </dl>
              {dossier.url_tracking && (
                <a className="btn btn-primary btn-block apparait" href={dossier.url_tracking} target="_blank" rel="noopener noreferrer">
                  Suivre sur le site de la compagnie <Icone nom="arrow" />
                </a>
              )}
              <ol className="etapes-transport">
                {etapes.map((x, i) => (
                  <li key={x.t} className={`apparait${x.fait ? " fait" : ""}`}>
                    <span className="n">{x.fait ? <Icone nom="check" style={{ width: 14, height: 14 }} /> : i + 1}</span>
                    <b>{x.t}</b>
                    <span>{x.d}</span>
                  </li>
                ))}
              </ol>
              <p className="note mt-m">Les étapes affichées ici sont indicatives ; la position en temps réel se lit sur le site de la compagnie.</p>
            </>
          ) : (
            <div className="empty-slot apparait">
              <Icone nom="conteneur" />
              <strong>Bientôt disponible</strong>
              Le numéro de conteneur vous sera communiqué dès la réservation auprès de la compagnie.
            </div>
          )}
        </div>
      </main>
    </>
  );
}

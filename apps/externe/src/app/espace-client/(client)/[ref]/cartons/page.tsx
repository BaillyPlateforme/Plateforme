import type { Metadata } from "next";
import { bornesCartons, estimationCartons, PLAGE_SAMEDI } from "@/lib/espace-client/cartons";
import { lireDonnees } from "@/lib/espace-client/depot";
import { chargerEspace } from "@/lib/espace-client/espace";
import { dateCourte, dateLongue, heure, joursRestants, jourMois } from "@/lib/espace-client/format";
import { livraisonCourante } from "@/lib/espace-client/progression";
import { texteSms } from "@/lib/espace-client/emails";
import { TEL_AGENCE } from "@/lib/messaging";
import { PageHero } from "../../../_ui/PageHero";
import { ApercuSms } from "./ApercuSms";
import { DessinCarton, ParcoursCartons } from "./ParcoursCartons";

export const metadata: Metadata = { title: "Livraison de cartons" };

/** La livraison de cartons — la page cartons.html de la micro démo. */
export default async function Cartons({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const e = await chargerEspace(ref);
  const { dossier, client } = e;
  const termine = dossier.statut === "termine";
  const livraison = livraisonCourante(e.livraisons);
  const passee = !!livraison && (livraison.statut === "livree" || joursRestants(livraison.date_samedi) < 0);
  const bornes = bornesCartons(dossier.periode_debut);

  // L'occupation des samedis : des nombres par date, jamais les autres clients.
  const occupation: Record<string, number> = {};
  for (const l of (await lireDonnees()).livraisons_cartons) {
    if (l.id === livraison?.id) continue;
    occupation[l.date_samedi] = (occupation[l.date_samedi] ?? 0) + 1;
  }

  const creneau = livraison?.creneau_debut ? `${heure(livraison.creneau_debut)} – ${heure(livraison.creneau_fin!)}` : null;
  const planifiee = livraison ? (
    <div className="card confirm apparait">
      <DessinCarton />
      <p className="kicker">{passee ? "Livraison effectuée" : "Livraison planifiée"}</p>
      <h2>Samedi {jourMois(livraison.date_samedi)}</h2>
      <p>
        {passee
          ? `${livraison.nb_cartons ?? ""} cartons livrés le ${dateLongue(livraison.date_samedi)}.`
          : `Vos ${livraison.nb_cartons ? `${livraison.nb_cartons} ` : ""}cartons seront livrés à l'adresse ci-dessous. La veille, vous recevrez votre créneau précis par SMS et par e-mail.`}
      </p>
      <div className="ticket">
        <div>
          <small>Date</small>
          <b>{dateCourte(livraison.date_samedi)}</b>
        </div>
        <div>
          <small>Créneau</small>
          <b>{creneau ?? "SMS la veille"}</b>
        </div>
        <div>
          <small>Cartons</small>
          <b>{livraison.nb_cartons ?? "À définir"}</b>
        </div>
      </div>
      <dl className="kv" style={{ maxWidth: 520, margin: "30px auto 0", textAlign: "left" }}>
        <dt>Adresse</dt>
        <dd>{livraison.adresse}</dd>
        {livraison.complement && (
          <>
            <dt>Complément</dt>
            <dd>{livraison.complement}</dd>
          </>
        )}
        {livraison.code_acces && (
          <>
            <dt>Code d&apos;accès</dt>
            <dd>{livraison.code_acces}</dd>
          </>
        )}
        <dt>Personne présente</dt>
        <dd>{livraison.contact_nom}</dd>
        <dt>Téléphone</dt>
        <dd>{livraison.contact_tel}</dd>
      </dl>
      {!passee && !termine && (
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 30 }}>
          <ApercuSms
            texte={texteSms("creneau_cartons", {
              prenom: client.prenom,
              nb: livraison.nb_cartons ?? "",
              debut: livraison.creneau_debut ? heure(livraison.creneau_debut) : "9 h 30",
              fin: livraison.creneau_fin ? heure(livraison.creneau_fin) : "10 h 30",
              adresse: livraison.adresse,
              contact: livraison.contact_nom,
              telephone: e.conseiller.telephone || TEL_AGENCE,
            })}
          />
        </div>
      )}
    </div>
  ) : termine ? (
    <div className="empty-slot apparait">
      <strong>Ce déménagement est terminé</strong>Aucune livraison de cartons n&apos;avait été demandée.
    </div>
  ) : null;

  return (
    <>
      <PageHero e={e} titre="Livraison de cartons" sous="Nous vous livrons vos cartons vides un samedi, chez vous, avant le déménagement." active="cartons" />
      <main className="section">
        <div className="wrap split">
          <div>
            <ParcoursCartons
              reference={ref}
              planifiee={planifiee}
              fiche={{
                adresse: livraison?.adresse ?? dossier.adresse_depart,
                complement: livraison?.complement ?? "",
                code_acces: livraison?.code_acces ?? "",
                contact_nom: livraison?.contact_nom ?? `${client.prenom} ${client.nom}`,
                contact_tel: livraison?.contact_tel ?? client.telephone,
              }}
              bornes={bornes}
              occupation={occupation}
              dejaChoisi={livraison && !passee ? livraison.date_samedi : null}
              modifiable={!!livraison && !passee && !termine && joursRestants(livraison.date_samedi) >= 2}
              sansCartons={dossier.cartons_non_necessaires}
            />
          </div>
          <aside className="aside-sticky apparait">
            <div className="card">
              <p className="kicker">Comment ça marche</p>
              <ol className="steps-v">
                <li>
                  <b>Vous remplissez la fiche</b>
                  <span>Adresse et personne présente à la livraison.</span>
                </li>
                <li>
                  <b>Vous choisissez un samedi</b>
                  <span>Livraisons le samedi, {PLAGE_SAMEDI}.</span>
                </li>
                <li>
                  <b>Nous préparons vos cartons</b>
                  <span>Quantité ajustée à votre volume par votre conseiller.</span>
                </li>
                <li>
                  <b>La veille, un SMS vous donne le créneau</b>
                  <span>Tournée optimisée : créneau d&apos;une heure.</span>
                </li>
              </ol>
            </div>
            <div className="card" style={{ background: "var(--ink)", color: "#fff", border: 0 }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <svg viewBox="0 0 64 64" width="56" height="56" fill="none" aria-hidden="true">
                  <path d="M8 22 32 12l24 10-24 10z" fill="#d9b98a" />
                  <path d="M8 22v22l24 10V32z" fill="#c49a62" />
                  <path d="M56 22v22L32 54V32z" fill="#b0854f" />
                  <path d="M20 17l24 10v8" stroke="#f5d033" strokeWidth="4" />
                </svg>
                <div>
                  <div className="num" style={{ fontSize: 40, fontWeight: 700, lineHeight: 0.9 }}>
                    {livraison?.nb_cartons ?? estimationCartons(dossier.volume_m3)}
                  </div>
                  <small style={{ opacity: 0.7 }}>{livraison?.nb_cartons ? "cartons prévus pour vous" : "cartons estimés pour votre volume"}</small>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}

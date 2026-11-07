import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { euros } from "@/lib/espace-client/format";
import { stripeConfigure } from "@/lib/espace-client/stripe-config";
import { exigerClient, lireDonneesClient } from "@/lib/espace-client/session";
import { issuePaiementSimule } from "@/lib/actions/espace-client";
import { Icone } from "../../../_ui/Icone";

export const metadata: Metadata = { title: "Paiement sécurisé" };

/**
 * La page du prestataire de paiement — ici simulée, et dite comme telle.
 * Volontairement sobre : ce n'est pas le site de Bailly. En production, le
 * client part chez le prestataire et revient après son webhook signé.
 */
export default async function PaiementSimule({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await exigerClient();
  const d = await lireDonneesClient();
  const session = d.sessions_paiement.find((s) => s.id === id);
  const dossier = session && d.dossiers.find((x) => x.id === session.dossier_id && x.client_id === client.id);
  if (!session || !dossier) notFound();
  // Stripe réglé : la simulation est fermée, le paiement se suit dans l'espace du client.
  if (stripeConfigure()) redirect(`/espace-client/${encodeURIComponent(dossier.reference)}/paiement/${session.id}`);
  const retour = `/espace-client/${dossier.reference}/devis?ok=paiement${session.cible === "facture" ? "#factures" : ""}`;

  return (
    <div className="pay-page">
      <div className="modal" role="main">
        {session.statut === "payee" ? (
          <div className="pay-done">
            <div className="ok-circle">
              <Icone nom="check" />
            </div>
            <h3>Paiement accepté</h3>
            <p>
              {euros(session.montant)} · réf. {session.reference}
              <br />
              Un reçu vous a été envoyé par e-mail.
            </p>
            <Link className="btn btn-primary" href={retour}>
              Continuer <Icone nom="arrow" />
            </Link>
          </div>
        ) : (
          <>
            <div className="pay-head">
              <span className="secure">
                <Icone nom="lock" /> Paiement sécurisé · prestataire
              </span>
              <span className="sim">SIMULATION</span>
            </div>
            <div className="pay-body">
              <div className="pay-marchand">
                Bénéficiaire : <b>Bailly Déménagement</b>
              </div>
              <div className="for">{session.libelle}</div>
              <div className="amt">{euros(session.montant)}</div>
              {session.statut === "ouverte" ? (
                <form action={issuePaiementSimule.bind(null, session.id)}>
                  <div className="field">
                    <label className="sr-only" htmlFor="cc">
                      Numéro de carte
                    </label>
                    <input id="cc" className="input" defaultValue="4242 4242 4242 4242" inputMode="numeric" readOnly />
                  </div>
                  <div className="row2">
                    <div className="field">
                      <input className="input" defaultValue="12 / 29" aria-label="Expiration" readOnly />
                    </div>
                    <div className="field">
                      <input className="input" defaultValue="123" aria-label="Cryptogramme" readOnly />
                    </div>
                  </div>
                  <button className="btn btn-dark" name="issue" value="payer">
                    <Icone nom="lock" /> Payer {euros(session.montant)}
                  </button>
                  <button className="pay-cancel" name="issue" value="annuler">
                    Annuler et revenir à mon espace
                  </button>
                  <p className="note" style={{ textAlign: "center", marginTop: 10 }}>
                    Simulation : aucune carte n&apos;est débitée. Aucune donnée bancaire n&apos;est conservée par Bailly ; en production, cette page est celle du prestataire, qui confirme le paiement par un webhook signé.
                  </p>
                </form>
              ) : (
                <>
                  <p className="note">Cette session de paiement est terminée.</p>
                  <Link className="btn btn-dark" href={`/espace-client/${dossier.reference}/devis`}>
                    Revenir à mon espace
                  </Link>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

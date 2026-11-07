import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { chargerEspace } from "@/lib/espace-client/espace";
import { euros } from "@/lib/espace-client/format";
import { lireDonneesClient } from "@/lib/espace-client/session";
import { PageHero } from "../../../../_ui/PageHero";
import { Icone } from "../../../../_ui/Icone";
import { Actualiser } from "./Actualiser";

export const metadata: Metadata = { title: "Paiement sécurisé" };

/**
 * Le retour d'un paiement en ligne (Stripe), dans l'espace du client : payé,
 * en cours de confirmation (le webhook n'est pas encore arrivé, ou un
 * paiement différé), ou annulé. La page ne lit que la session de paiement du
 * client, par sa session et la RLS ; elle ne décide de rien : c'est le
 * webhook signé (ou la relecture chez Stripe au retour) qui fait passer un
 * paiement.
 */
export default async function RetourPaiement({ params }: { params: Promise<{ ref: string; id: string }> }) {
  const { ref, id } = await params;
  const e = await chargerEspace(ref);
  const d = await lireDonneesClient();
  const session = d.sessions_paiement.find((s) => s.id === id && s.dossier_id === e.dossier.id);
  if (!session) notFound();
  const facture = session.cible === "facture";
  const versDevis = `/espace-client/${e.dossier.reference}/devis`;

  return (
    <>
      <PageHero e={e} titre="Paiement sécurisé" sous={session.libelle} active={facture ? "factures" : "devis"} />
      <main className="section">
        <div className="wrap">
          <div className="card apparait pay-done" style={{ maxWidth: 620, margin: "0 auto" }}>
            {session.statut === "payee" ? (
              <>
                <div className="ok-circle">
                  <Icone nom="check" />
                </div>
                <h3>Paiement accepté</h3>
                <p>
                  {euros(session.montant)} · réf. {session.reference}
                  <br />
                  Un reçu vous a été envoyé par e-mail.
                </p>
                <Link className="btn btn-primary" href={`${versDevis}?ok=paiement${facture ? "#factures" : ""}`}>
                  Continuer <Icone nom="arrow" />
                </Link>
              </>
            ) : session.statut === "ouverte" ? (
              <>
                <h3>Paiement en cours de confirmation</h3>
                <p>
                  {euros(session.montant)} · {session.libelle}
                  <br />
                  Notre prestataire de paiement nous confirme votre règlement : cette page se met à jour d&apos;elle-même. Un paiement par prélèvement peut demander quelques jours ; vous recevrez un e-mail dès sa confirmation.
                </p>
                <Actualiser />
                <Link className="btn btn-ghost" href={`${versDevis}${facture ? "#factures" : ""}`}>
                  Revenir à mon espace
                </Link>
              </>
            ) : (
              <>
                <h3>Paiement annulé</h3>
                <p>Paiement annulé : aucun montant n&apos;a été débité.</p>
                <Link className="btn btn-dark" href={`${versDevis}${facture ? "#factures" : ""}`}>
                  Revenir à mon espace
                </Link>
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

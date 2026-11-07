import type { Metadata } from "next";
import { lireDonnees } from "@/lib/espace-client/depot";
import { chargerEspace } from "@/lib/espace-client/espace";
import { demanderService } from "@/lib/actions/espace-client";
import { PageHero } from "../../../_ui/PageHero";
import { Icone } from "../../../_ui/Icone";

export const metadata: Metadata = { title: "Mes services complémentaires" };

/** Tout ce que Bailly peut prendre en charge en plus — le volet « Services » de la micro démo. */
export default async function Services({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const e = await chargerEspace(ref);
  const services = (await lireDonnees()).services.filter((s) => s.actif).sort((a, b) => a.ordre - b.ordre);

  return (
    <>
      <PageHero e={e} titre="Services complémentaires" sous="Tout ce que Bailly peut prendre en charge en plus de votre déménagement, sur simple demande." active="accueil" />
      <main className="section">
        <div className="wrap" style={{ maxWidth: 900 }}>
          <p className="lede apparait" style={{ marginTop: 0, marginBottom: 26 }}>
            Un service vous intéresse ? Un clic suffit pour prévenir {e.conseiller.prenom} {e.conseiller.nom}, qui suit votre dossier.
          </p>
          {services.map((s) => (
            <div key={s.id} className="svc apparait">
              <strong>{s.titre}</strong>
              <p>
                <b style={{ color: "var(--ink)", fontWeight: 600 }}>{s.accroche}</b> {s.contenu}
              </p>
              <div className="price">{s.prix_indicatif ?? "sur devis"}</div>
              <div className="svc-act">
                <span className="note">Prix indicatif</span>
                <form action={demanderService.bind(null, ref, s.id)}>
                  <button className="btn btn-dark btn-sm">
                    Je suis intéressé <Icone nom="arrow" />
                  </button>
                </form>
              </div>
            </div>
          ))}
          {services.length === 0 && <div className="empty-slot">Aucun service proposé pour le moment.</div>}
        </div>
      </main>
    </>
  );
}

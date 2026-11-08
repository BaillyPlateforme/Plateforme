import type { Metadata } from "next";
import { chargerEspace } from "@/lib/espace-client/espace";
import { aVille } from "@/lib/espace-client/format";
import { Hero } from "../../_ui/Hero";
import { Frise } from "../../_ui/Frise";
import { Tuiles } from "../../_ui/Tuiles";
import { ContactConseiller } from "../../_ui/ContactConseiller";

type Props = { params: Promise<{ ref: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ref } = await params;
  const { dossier } = await chargerEspace(ref);
  return { title: `Mon déménagement ${aVille(dossier.ville_arrivee)}` };
}

/** La page de garde : le héros du modèle, la frise, puis les rubriques. */
export default async function PageDeGarde({ params }: Props) {
  const { ref } = await params;
  const e = await chargerEspace(ref);
  const rubriques = [e.vis.devis && "Devis", "documents", e.vis.factures && "factures", "cartons"].filter(Boolean).join(", ");

  return (
    <>
      <Hero e={e} />
      <main>
        <Frise e={e} />
        <section className="section" style={{ paddingTop: 0 }} id="rubriques">
          <div className="wrap">
            <div className="section-head apparait">
              <div>
                <p className="kicker">Mon espace</p>
                <h2 className="h-section">
                  Tout votre dossier,
                  <br />
                  au même endroit
                </h2>
              </div>
              <p className="lede" style={{ maxWidth: "40ch", margin: 0 }}>
                {rubriques.charAt(0).toUpperCase() + rubriques.slice(1)}&nbsp;: chaque rubrique vous indique ce qui est fait et ce qu&apos;il reste à faire.
              </p>
            </div>
            <Tuiles e={e} services={e.services.length} tutos={e.tutos.length} />
            {/* Le conseiller et ses trois voies : chat, téléphone, e-mail. */}
            <ContactConseiller e={e} />
          </div>
        </section>
      </main>
    </>
  );
}

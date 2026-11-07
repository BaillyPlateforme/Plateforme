import type { Metadata } from "next";
import { chargerEspace } from "@/lib/espace-client/espace";
import { salutation } from "@/lib/espace-client/format";
import { TEL_AGENCE, TEL_AGENCE_LIEN } from "@/lib/messaging";
import { PageHero } from "../../../_ui/PageHero";
import { Icone } from "../../../_ui/Icone";
import { FormulaireMessage } from "./FormulaireMessage";

export const metadata: Metadata = { title: "Mon conseiller" };

/** Le conseiller du dossier : sa ligne, son adresse, et un message qui lui part directement. */
export default async function Conseiller({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const e = await chargerEspace(ref);
  const c = e.conseiller;

  return (
    <>
      <PageHero e={e} titre={`${c.prenom} ${c.nom}`} sous="Votre interlocuteur unique, du devis au jour J." active="accueil" />
      <main className="section">
        <div className="wrap split">
          <div>
            <p className="lede apparait" style={{ marginTop: 0 }}>
              {salutation(e.client)}, {c.prenom} suit votre dossier {e.dossier.reference} de A à Z. Écrivez-lui ici : votre message lui parvient avec la référence de votre dossier.
            </p>
            <FormulaireMessage reference={ref} prenom={c.prenom} />
          </div>
          <aside className="aside-sticky apparait">
            <div className="card">
              <ul className="info-list">
                <li>
                  <span className="ic"><Icone nom="phone" /></span>
                  <span>
                    <b><a href={`tel:${c.telephone.replace(/\s/g, "")}`}>{c.telephone}</a></b>Ligne directe
                  </span>
                </li>
                {c.email && (
                  <li>
                    <span className="ic"><Icone nom="mail" /></span>
                    <span>
                      <b style={{ wordBreak: "break-all" }}><a href={`mailto:${c.email}`}>{c.email}</a></b>Par e-mail
                    </span>
                  </li>
                )}
                <li>
                  <span className="ic"><Icone nom="home" /></span>
                  <span>
                    <b><a href={TEL_AGENCE_LIEN}>{TEL_AGENCE}</a></b>Standard de l&apos;agence
                  </span>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}

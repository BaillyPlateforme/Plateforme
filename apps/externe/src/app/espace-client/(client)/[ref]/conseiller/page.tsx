import type { Metadata } from "next";
import { lireFil, versVue } from "@/lib/espace-client/discussion";
import { initialesDe } from "@/lib/espace-client/discussion-vue";
import { chargerEspace } from "@/lib/espace-client/espace";
import { PORTE_FICHIERS_CLIENT } from "@/lib/espace-client/fichiers";
import { salutation } from "@/lib/espace-client/format";
import { apercuEquipe } from "@/lib/espace-client/session";
import { TEL_AGENCE, TEL_AGENCE_LIEN } from "@/lib/messaging";
import { Discussion } from "../../../_ui/Discussion";
import { Icone } from "../../../_ui/Icone";
import { PageHero } from "../../../_ui/PageHero";

export const metadata: Metadata = { title: "Mon conseiller" };

/**
 * Le conseiller du dossier, et la discussion avec lui en grand : le fil à
 * gauche (le même que celui de la bulle), sa carte à droite — sa ligne, son
 * adresse, le standard. Pendant un aperçu de l'équipe, le fil se lit et ne
 * s'écrit pas.
 */
export default async function Conseiller({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const e = await chargerEspace(ref);
  const c = e.conseiller;
  const apercu = await apercuEquipe();
  // Le fil, lu par la session du client (RLS) ; illisible, la discussion le relit d'elle-même.
  const fil = await lireFil(e.dossier.id, apercu ? "service" : "session")
    .then((l) => l.map((m) => versVue(m, PORTE_FICHIERS_CLIENT)))
    .catch(() => null);

  return (
    <>
      <PageHero e={e} titre={`${c.prenom} ${c.nom}`} sous="Votre interlocuteur unique, du devis au jour J." active="accueil" />
      <main className="section fil-section">
        <div className="wrap split">
          <div>
            <p className="lede apparait fil-lede">
              {salutation(e.client)}, {c.prenom} suit votre dossier {e.dossier.reference} de A à Z. Posez vos questions ici : {c.prenom} vous répond dans cette discussion, et vous en êtes prévenu par e-mail.
            </p>
            <div className="fil-carte apparait">
              <Discussion
                reference={e.dossier.reference}
                conseiller={{ prenom: c.prenom, nom: c.nom }}
                lectureSeule={!!apercu}
                initiaux={fil}
                actif
                variante="page"
              />
            </div>
          </div>
          <aside className="aside-sticky apparait">
            <div className="card fil-conseiller">
              <div className="fil-conseiller-tete">
                <span className="fil-av fil-av-grand">{initialesDe(`${c.prenom} ${c.nom}`)}</span>
                <div>
                  <p className="kicker">Votre conseiller</p>
                  <h2>
                    {c.prenom} {c.nom}
                  </h2>
                </div>
              </div>
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

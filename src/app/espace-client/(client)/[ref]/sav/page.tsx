import type { Metadata } from "next";
import { chargerEspace } from "@/lib/espace-client/espace";
import { lienFichier } from "@/lib/espace-client/fichiers";
import { dateCourte, dateLongue } from "@/lib/espace-client/format";
import { STATUT_SAV } from "@/lib/espace-client/libelles";
import { PARCOURS_SAV } from "@/lib/espace-client/textes";
import { PageHero } from "../../../_ui/PageHero";
import { TitreChapitre } from "../../../_ui/Cadre";
import { Icone } from "../../../_ui/Icone";
import { FormulaireAvarie } from "./FormulaireAvarie";

export const metadata: Metadata = { title: "SAV" };

/** Le SAV : la procédure, le bouton « Je souhaite déclarer une avarie », et le suivi des déclarations. */
export default async function Sav({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ref } = await params;
  const sp = await searchParams;
  const e = await chargerEspace(ref);
  const { dossier, vis, sav } = e;

  return (
    <>
      <PageHero e={e} titre="SAV" sous="Un objet abîmé ou manquant après votre déménagement ? Déclarez-le en ligne, photos à l'appui." active="accueil" />
      <main className="section">
        <div className="wrap stack" style={{ gap: "clamp(48px, 6vw, 72px)" }}>
          <div className="card sav-cta apparait">
            <h2 className="display" style={{ fontSize: "clamp(36px, 5vw, 56px)" }}>
              En cas de dommage
            </h2>
            <p>
              Tout se joue sur une question : avez-vous écrit des réserves sur la lettre de voiture le jour de la livraison ? Selon la réponse, la démarche n&apos;est pas la même. Déclarez le dommage dès que vous le découvrez.
            </p>
            {vis.savActif ? (
              <FormulaireAvarie reference={ref} ouvertParDefaut={sp.declarer === "1"} />
            ) : (
              <div className="empty-slot" style={{ marginTop: 22, color: "rgba(255,255,255,.8)", borderColor: "rgba(255,255,255,.25)", background: "transparent" }}>
                <Icone nom="lock" />
                <strong style={{ color: "#fff" }}>Disponible après la livraison</strong>
                Le bouton « Je souhaite déclarer une avarie » s&apos;activera après votre livraison du {dateLongue(dossier.periode_fin)}.
              </div>
            )}
          </div>

          <section>
            <TitreChapitre n="01">La procédure</TitreChapitre>
            <div className="grid-2">
              {[PARCOURS_SAV.avec, PARCOURS_SAV.sans].map((p) => (
                <div key={p.titre} className="card apparait">
                  <p className="kicker">{p === PARCOURS_SAV.avec ? "Réserves émises" : "Sans réserves"}</p>
                  <h3 className="display" style={{ fontSize: 30, marginBottom: 18 }}>
                    {p.titre}
                  </h3>
                  <ol className="steps-v">
                    {p.etapes.map(([t, d]) => (
                      <li key={t}>
                        <b>{t}</b>
                        <span>{d}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
            <p className="note mt-s">Procédure provisoire : le détail des deux parcours (délais, pièces demandées) sera fixé avec Bailly.</p>
          </section>

          {sav.length > 0 && (
            <section>
              <TitreChapitre n="02">Mes déclarations</TitreChapitre>
              {sav.map((s) => (
                <div key={s.id} className="svc apparait">
                  <strong>
                    {s.numero} · {s.objets}
                  </strong>
                  <p>
                    Constatée le {dateCourte(s.date_constat)} · déclarée le {dateCourte(s.created_at)} · {s.reserves_emises ? "réserves émises" : "sans réserves"}
                  </p>
                  <div className="price" style={{ fontSize: 16 }}>
                    <span className={`badge ${STATUT_SAV[s.statut].ton}`}>{STATUT_SAV[s.statut].label}</span>
                  </div>
                  <p style={{ gridColumn: "1 / -1", marginTop: 6 }}>{s.description}</p>
                  {s.photos.length > 0 && (
                    <div className="thumbs" style={{ gridColumn: "1 / -1" }}>
                      {s.photos.map((p) => (
                        <a key={p.id} className="f" href={lienFichier("photo", p.id)} target="_blank" rel="noopener" title={p.nom}>
                          {p.nom}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}
        </div>
      </main>
    </>
  );
}

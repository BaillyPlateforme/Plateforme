import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { joursAvantDepart, minutesSecondes, type TutoVue } from "@/lib/espace-client/tutos";
import { TEXTES_TUTO as T } from "@/lib/espace-client/tutos-contenu";
import type { Espace } from "@/lib/espace-client/espace";
import { PageHero } from "../../../../_ui/PageHero";
import { Icone } from "../../../../_ui/Icone";
import { chargerTutos } from "../charger";
import { Insecable } from "../Insecable";
import { Lecteur } from "./Lecteur";
import { MarquerVu } from "./MarquerVu";
import "../tutos.css";

type Props = { params: Promise<{ ref: string; slug: string }> };

const d = (n: number) => ({ "--d": n }) as CSSProperties;
const nn = (n: number) => String(n).padStart(2, "0");

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ref, slug } = await params;
  const { tutos } = await chargerTutos(ref);
  const t = tutos.find((x) => x.slug === slug);
  return { title: t ? t.titre : "Mes tutos" };
}

/**
 * Où en est le geste du bouton « Faire maintenant », d'après la frise du
 * dossier : la déclaration transmise, les cartons prévus… Rien : pas d'état
 * à montrer.
 */
function etatAction(t: TutoVue, e: Espace): { fait: boolean; detail: string } | null {
  const cible = t.contenu?.action.cible;
  if (cible === "documents#valeurs" || cible === "cartons") {
    const etape = e.frise.find((x) => x.cle === (cible === "cartons" ? "cartons" : "valeurs"));
    return etape ? { fait: etape.statut === "fait", detail: etape.detail } : null;
  }
  if (cible === "") {
    const j = joursAvantDepart(e.dossier);
    if (e.dossier.statut === "termine") return { fait: true, detail: "Déménagement réalisé" };
    if (j === null) return null;
    return { fait: false, detail: j > 1 ? `J−${j} avant le départ` : j === 1 ? "C'est demain" : j === 0 ? "C'est aujourd'hui" : "Date passée" };
  }
  return null;
}

/**
 * Un tutoriel : sa fiche (promesse, durée, niveau, matériel), la vidéo et
 * ses chapitres, les étapes illustrées, les erreurs à éviter, le conseil des
 * déménageurs, les questions fréquentes, le geste à faire ensuite, puis
 * « Marquer comme vu » et le tutoriel suivant. Un tutoriel ajouté par
 * l'équipe sans contenu (tutos-contenu.ts) n'a que sa vidéo et ses étapes.
 */
export default async function PageTuto({ params }: Props) {
  const { ref, slug } = await params;
  const { e, apercu, tutos } = await chargerTutos(ref);
  const index = tutos.findIndex((x) => x.slug === slug);
  if (index < 0) notFound();
  const t = tutos[index];
  const c = t.contenu;
  const suivant = tutos[index + 1] ?? null;
  const base = `/espace-client/${e.dossier.reference}`;
  const lectureSeule = !!apercu;
  const etat = etatAction(t, e);
  const vuLe = t.vu?.vu_le ?? null;

  return (
    <>
      <PageHero
        e={e}
        kicker={`Tuto ${nn(t.numero)}${t.categorie ? ` · ${t.categorie}` : ""}`}
        titre={<Insecable texte={t.titre} />}
        sous={c?.promesse ?? t.resume}
        active="tutos"
        retour={{ href: `${base}/tutos`, label: "Mes tutos" }}
        titreLong={t.titre.length > 24}
      />
      <main className="tx tx-page">
        {/* La fiche, puis le lecteur */}
        <section className="section tight">
          <div className="wrap">
            <div className="tx-fiche apparait">
              <dl className="tx-meta">
                <div>
                  <dt>Durée</dt>
                  <dd>{t.dureeMin} min</dd>
                </div>
                {t.dureeVideo !== null && (
                  <div>
                    <dt>Vidéo</dt>
                    <dd>{minutesSecondes(t.dureeVideo)}</dd>
                  </div>
                )}
                {c && (
                  <div>
                    <dt>Niveau</dt>
                    <dd>{c.niveau}</dd>
                  </div>
                )}
                <div>
                  <dt>Étapes</dt>
                  <dd>{t.etapes.length}</dd>
                </div>
              </dl>
              {c && c.materiel.length > 0 && (
                <div className="tx-materiel">
                  <h2>Ce qu&apos;il vous faut</h2>
                  <ul>
                    {c.materiel.map((m) => (
                      <li key={m}>
                        <Icone nom="check" />
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {t.video ? (
              <Lecteur reference={e.dossier.reference} tutoId={t.id} titre={t.titre} video={t.video} chapitres={t.chapitres} vuLe={vuLe} lectureSeule={lectureSeule} aide={t.video.type === "mp4" ? T.aideVu : null} />
            ) : (
              <div className="tx-lecteur-pied seul">
                <MarquerVu reference={e.dossier.reference} tutoId={t.id} vuLe={vuLe} lectureSeule={lectureSeule} />
              </div>
            )}
          </div>
        </section>

        {/* Étape par étape */}
        <section className="section tx-etapes-band" id="etapes">
          <div className="wrap">
            <div className="section-head apparait">
              <div>
                <p className="kicker">{T.etapesKicker}</p>
                <h2 className="h-section">{T.etapesTitre}</h2>
              </div>
              <p className="lede" style={{ maxWidth: "40ch", margin: 0 }}>
                {T.etapesIntro(t.etapes.length, t.chapitres.length > 0)}
              </p>
            </div>
            <ol className={`tx-etapes${c ? "" : " simples"}`}>
              {t.etapes.map((x, i) => (
                <li key={i} className="tx-etape apparait" id={`etape-${i + 1}`}>
                  {x.image && (
                    <figure className="tx-etape-img">
                      <Image src={x.image} alt={x.titre ?? x.consigne} width={1000} height={850} sizes="(max-width: 860px) 100vw, 480px" />
                    </figure>
                  )}
                  <div className="tx-etape-texte">
                    <span className="tx-etape-n num" aria-hidden>
                      {nn(i + 1)}
                    </span>
                    {x.titre && <h3>{x.titre}</h3>}
                    <p className="tx-consigne">{x.consigne}</p>
                    {x.detail && <p className="tx-detail">{x.detail}</p>}
                    {x.t !== null && (
                      <button type="button" className="tx-voir" data-seek={x.t}>
                        <span className="tx-voir-ico" aria-hidden>
                          <svg viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" fill="currentColor" />
                          </svg>
                        </span>
                        Voir dans la vidéo · {minutesSecondes(x.t)}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {c && (
          <>
            {/* Les erreurs à éviter, puis le conseil des déménageurs */}
            <section className="section tight" id="erreurs">
              <div className="wrap">
                <div className="tx-titre-bloc apparait">
                  <p className="kicker tx-k-rouge">{T.erreursKicker}</p>
                  <h2 className="h-section">{T.erreursTitre}</h2>
                </div>
                <ul className={`tx-erreurs n${c.erreurs.length}`}>
                  {c.erreurs.map((x, i) => (
                    <li key={x.titre} className="apparait" style={d(i)}>
                      <figure>
                        <Image src={`/espace-client/tutos/${c.slug}/erreur-${i + 1}.webp`} alt="" width={c.erreurs.length === 2 ? 810 : 527} height={300} sizes="(max-width: 860px) 100vw, 380px" />
                      </figure>
                      <div>
                        <h3>{x.titre}</h3>
                        <p>{x.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>

                <figure className="tx-conseil apparait">
                  <div className="tx-conseil-texte">
                    <p className="tx-conseil-k">
                      <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" />
                      </svg>
                      {T.conseilTitre}
                    </p>
                    <blockquote>{c.conseil}</blockquote>
                    <figcaption>{c.conseilDetail}</figcaption>
                  </div>
                  <div className="tx-conseil-img">
                    <Image src={`/espace-client/tutos/${c.slug}/astuce.webp`} alt="" width={600} height={600} sizes="(max-width: 860px) 70vw, 320px" />
                  </div>
                </figure>
              </div>
            </section>

            {/* Questions fréquentes et « Faire maintenant » */}
            <section className="section tight" id="questions">
              <div className="wrap tx-faq-band">
                <div className="tx-faq">
                  <div className="tx-titre-bloc apparait">
                    <p className="kicker">{T.faqKicker}</p>
                    <h2 className="h-section">{T.faqTitre}</h2>
                  </div>
                  {c.faq.map((f, i) => (
                    <details key={f.q} className="tx-q apparait" style={d(i)} open={i === 0}>
                      <summary>
                        <span>{f.q}</span>
                        <span className="plus" aria-hidden>
                          <Icone nom="plus" />
                        </span>
                      </summary>
                      <p>{f.r}</p>
                    </details>
                  ))}
                  <p className="tx-faq-pied apparait">
                    {T.faqAutre} <Link href={`${base}/conseiller`}>Écrivez à {e.conseiller.prenom}</Link>, votre conseiller.
                  </p>
                </div>

                <aside className={`tx-faire apparait${etat?.fait ? " fait" : ""}`}>
                  <p className="tx-faire-k">{T.faireKicker}</p>
                  <h2>{etat?.fait && c.action.cible === "documents#valeurs" ? T.declarationFaite : c.action.titre}</h2>
                  <p>{c.action.texte}</p>
                  {etat && (
                    <p className={`badge ${etat.fait ? "ok" : "todo"} tx-faire-etat`}>{etat.detail}</p>
                  )}
                  <Link className="btn btn-primary" href={`${base}${c.action.cible ? `/${c.action.cible}` : ""}`}>
                    {etat?.fait && c.action.cible === "documents#valeurs" ? T.declarationRevoir : c.action.bouton} <Icone nom="arrow" />
                  </Link>
                </aside>
              </div>
            </section>
          </>
        )}

        {/* La suite */}
        <section className="section tight tx-suite-band">
          <div className="wrap tx-suite">
            <div className="tx-suite-vu apparait">
              <p className="kicker">{T.suiteKicker}</p>
              <h2>{T.suiteTitre(!!t.vu)}</h2>
              <MarquerVu reference={e.dossier.reference} tutoId={t.id} vuLe={vuLe} lectureSeule={lectureSeule} variante="sombre" aide={t.video?.type === "mp4" ? T.aideVu : null} />
            </div>
            {suivant ? (
              <Link className="tx-suivant apparait" style={d(1)} href={`${base}/tutos/${suivant.slug}`}>
                <span className="tx-suivant-img">
                  <Image src={suivant.vignette} alt="" fill sizes="(max-width: 860px) 100vw, 360px" />
                </span>
                <span className="tx-suivant-corps">
                  <span className="tx-suivant-k">{T.suivantKicker} · Tuto {nn(suivant.numero)}</span>
                  <strong>{suivant.titre}</strong>
                  <span className="tx-suivant-meta">
                    {suivant.dureeMin} min · {suivant.etapes.length} étapes
                    {suivant.vu ? " · vu" : ""}
                  </span>
                </span>
                <span className="go" aria-hidden>
                  <Icone nom="arrow" />
                </span>
              </Link>
            ) : (
              <Link className="tx-suivant tx-suivant-fin apparait" style={d(1)} href={`${base}/tutos`}>
                <span className="tx-suivant-corps">
                  <span className="tx-suivant-k">{T.finKicker}</span>
                  <strong>{T.finTitre}</strong>
                  <span className="tx-suivant-meta">{T.finTexte}</span>
                </span>
                <span className="go" aria-hidden>
                  <Icone nom="arrow" />
                </span>
              </Link>
            )}
          </div>
        </section>
      </main>
    </>
  );
}

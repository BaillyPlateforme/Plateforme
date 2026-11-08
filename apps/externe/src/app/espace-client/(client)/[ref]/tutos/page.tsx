import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { categories, minutesSecondes, recommander } from "@/lib/espace-client/tutos";
import { TEXTES_HUB } from "@/lib/espace-client/tutos-contenu";
import { PageHero } from "../../../_ui/PageHero";
import { Icone } from "../../../_ui/Icone";
import { Bibliotheque, type CarteTuto } from "./Bibliotheque";
import { chargerTutos } from "./charger";
import { Insecable } from "./Insecable";
import "./tutos.css";

export const metadata: Metadata = { title: "Mes tutos" };

const d = (n: number) => ({ "--d": n }) as CSSProperties;

/** « Préparer son déménagement, pas à pas » : la coupure après la virgule, voulue, pas laissée au hasard. */
function enDeuxLignes(titre: string) {
  const [a, ...b] = titre.split(", ");
  return b.length ? (
    <>
      {a},<br />
      {b.join(", ")}
    </>
  ) : (
    titre
  );
}

/** « 2 tutoriels sur 5 vus » */
function compteVus(n: number, total: number) {
  if (n === 0) return `Aucun tutoriel vu sur ${total}`;
  return `${n} tutoriel${n > 1 ? "s" : ""} sur ${total} vu${n > 1 ? "s" : ""}`;
}

/**
 * « Mes tutos » : l'espace des tutoriels. En tête, la progression du client
 * et le tutoriel recommandé pour l'étape où en est son dossier ; puis la
 * bibliothèque, filtrable par catégorie ; enfin la check-list imprimable.
 */
export default async function Tutos({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const { e, tutos } = await chargerTutos(ref);
  const base = `/espace-client/${e.dossier.reference}`;
  const vus = tutos.filter((t) => t.vu).length;
  const reco = recommander(e, tutos);
  const prochain = tutos.find((t) => !t.vu);

  const cartes: CarteTuto[] = tutos.map((t) => ({
    id: t.id,
    slug: t.slug,
    numero: t.numero,
    titre: t.titre,
    resume: t.resume,
    categorie: t.categorie,
    vignette: t.vignette,
    video: t.video !== null,
    dureeVideo: t.dureeVideo === null ? null : minutesSecondes(t.dureeVideo),
    dureeMin: t.dureeMin,
    etapes: t.etapes.length,
    niveau: t.contenu?.niveau ?? null,
    vu: !!t.vu,
  }));

  return (
    <>
      <PageHero e={e} kicker="Mes tutos" titre={enDeuxLignes(TEXTES_HUB.titre)} sous={TEXTES_HUB.sous} active="tutos" titreLong />
      <main className="tx">
        {tutos.length > 0 && (
          <section className="section tight tx-tete-band">
            <div className="wrap tx-tete">
              <div className="tx-progression apparait">
                <p className="kicker">Votre progression</p>
                <p className="tx-compte">
                  <span className="num">{vus}</span>
                  <span className="sur">/ {tutos.length}</span>
                </p>
                <p className="tx-compte-l">{compteVus(vus, tutos.length)}</p>
                <ol className="tx-segments" aria-label="Tutoriels vus">
                  {tutos.map((t) => (
                    <li key={t.id} className={t.vu ? "vu" : ""}>
                      <Link href={`${base}/tutos/${t.slug}`} title={`${t.titre}${t.vu ? " · vu" : ""}`}>
                        <span className="sr-only">
                          {t.titre}
                          {t.vu ? " (vu)" : ""}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
                {/* Le parcours : chaque tutoriel, vu ou pas, et le prochain à voir. */}
                <ol className="tx-parcours">
                  {tutos.map((t) => (
                    <li key={t.id} className={t.vu ? "vu" : t === prochain ? "prochain" : ""}>
                      <Link href={`${base}/tutos/${t.slug}`}>
                        <span className="n num">{String(t.numero).padStart(2, "0")}</span>
                        <span className="t">{t.titre}</span>
                        <span className="e" aria-label={t.vu ? "vu" : t === prochain ? "à voir ensuite" : "pas encore vu"}>
                          {t.vu ? <Icone nom="check" /> : t === prochain ? <Icone nom="arrow" /> : null}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
                {!prochain && (
                  <p className="tx-tout-vu">
                    <Icone nom="check" /> {TEXTES_HUB.toutVu}
                  </p>
                )}
              </div>

              {reco ? (
                <article className="tx-reco apparait" style={d(1)}>
                  <Link className={`tx-reco-media${reco.tuto.couverture ? " couverture" : ""}`} href={`${base}/tutos/${reco.tuto.slug}`} aria-label={`Regarder : ${reco.tuto.titre}`}>
                    <Image src={reco.tuto.couverture ?? reco.tuto.vignette} alt="" fill sizes="(max-width: 860px) 100vw, 560px" />
                    {reco.tuto.video && (
                      <span className="tx-regarder" aria-hidden>
                        <span className="tx-play-rond">
                          <svg viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" fill="currentColor" />
                          </svg>
                        </span>
                        Regarder{reco.tuto.dureeVideo !== null && <b>{minutesSecondes(reco.tuto.dureeVideo)}</b>}
                      </span>
                    )}
                  </Link>
                  <div className="tx-reco-corps">
                    <p className="tx-reco-k">
                      <span className="tx-etoile" aria-hidden>
                        ★
                      </span>
                      Recommandé pour vous
                    </p>
                    <p className="tx-reco-raison">{reco.titre}</p>
                    <h2>
                      <Insecable texte={reco.tuto.titre} />
                    </h2>
                    <p className="tx-reco-texte">{reco.texte}</p>
                    <p className="tx-reco-meta">
                      <span>
                        <Icone nom="clock" /> {reco.tuto.dureeMin} min
                      </span>
                      <span>{reco.tuto.etapes.length} étapes</span>
                      {reco.tuto.vu && (
                        <span className="vu">
                          <Icone nom="check" /> Vu
                        </span>
                      )}
                    </p>
                    <div className="tx-reco-actions">
                      <Link className="btn btn-primary" href={`${base}/tutos/${reco.tuto.slug}`}>
                        {reco.tuto.vu ? "Revoir le tutoriel" : "Commencer le tutoriel"} <Icone nom="arrow" />
                      </Link>
                      {reco.tuto.contenu && (
                        <span className="tx-directement">
                          {TEXTES_HUB.ouDirectement}{" "}
                          <Link className="tx-lien-clair" href={`${base}${reco.tuto.contenu.action.cible ? `/${reco.tuto.contenu.action.cible}` : ""}`}>
                            {reco.tuto.contenu.action.bouton}
                          </Link>
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              ) : (
                <article className="tx-reco tx-reco-calme apparait" style={d(1)}>
                  <div className="tx-reco-corps">
                    <p className="tx-reco-k">Mes tutos</p>
                    <h2>{prochain ? TEXTES_HUB.calmeApresTitre : TEXTES_HUB.calmeToutVuTitre}</h2>
                    <p className="tx-reco-texte">{prochain ? TEXTES_HUB.calmeApresTexte : TEXTES_HUB.calmeToutVuTexte}</p>
                    <div className="tx-reco-actions">
                      <Link className="btn btn-primary" href={`${base}/tutos/check-list`}>
                        <Icone nom="documents" /> {TEXTES_HUB.checkListTitre}
                      </Link>
                    </div>
                  </div>
                </article>
              )}
            </div>
          </section>
        )}

        <section className="section tx-biblio" id="tutoriels">
          <div className="wrap">
            <div className="section-head apparait">
              <div>
                <p className="kicker">{TEXTES_HUB.bibliothequeKicker}</p>
                <h2 className="h-section">{TEXTES_HUB.bibliothequeTitre}</h2>
              </div>
              <p className="lede" style={{ maxWidth: "40ch", margin: 0 }}>
                {TEXTES_HUB.bibliothequeIntro}
              </p>
            </div>
            {tutos.length ? (
              <Bibliotheque cartes={cartes} categories={categories(tutos)} base={`${base}/tutos`} recommande={reco?.tuto.slug ?? null} />
            ) : (
              <div className="empty-slot">Les tutoriels arrivent bientôt.</div>
            )}
          </div>
        </section>

        <section className="section tight tx-cl-band">
          <div className="wrap">
            <div className="tx-cl apparait">
              <div className="tx-cl-texte">
                <p className="kicker">À imprimer</p>
                <h2>{TEXTES_HUB.checkListTitre}</h2>
                <p>{TEXTES_HUB.checkListTexte}</p>
                <div className="tx-cl-actions">
                  <Link className="btn btn-dark" href={`${base}/tutos/check-list`}>
                    <Icone nom="documents" /> Ouvrir la check-list
                  </Link>
                  <Link className="btn btn-ghost" href={`${base}/tutos/check-list?imprimer=1`}>
                    <Icone nom="download" /> Imprimer
                  </Link>
                </div>
              </div>
              <div className="tx-cl-feuille" aria-hidden>
                <span className="tx-cl-logo" />
                <b>Check-list du déménagement</b>
                {["Deux mois avant", "Un mois avant", "Le jour J"].map((s, k) => (
                  <span key={s} className="tx-cl-groupe">
                    <i>{s}</i>
                    {[0, 1, 2].map((n) => (
                      <span key={n} className={`tx-cl-ligne${k === 0 || (k === 1 && n === 0) ? " coche" : ""}`}>
                        <em />
                        <span className="tx-cl-barre" style={{ width: `${62 + ((n * 17 + k * 11) % 30)}%` }} />
                      </span>
                    ))}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

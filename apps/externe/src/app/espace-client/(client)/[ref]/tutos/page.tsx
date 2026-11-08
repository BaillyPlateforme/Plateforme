import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { chargerEspace } from "@/lib/espace-client/espace";
import { PageHero } from "../../../_ui/PageHero";
import { Icone } from "../../../_ui/Icone";

export const metadata: Metadata = { title: "Mes tutos" };

/** Les tutos : la liste illustrée de la micro démo, chaque ligne s'ouvre sur ses étapes. */
export default async function Tutos({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const e = await chargerEspace(ref);
  const tutos = e.tutos;

  return (
    <>
      <PageHero e={e} titre="Mes tutos" sous="Des guides courts pour les étapes qui posent le plus de questions." active="accueil" />
      <main className="section">
        <div className="wrap" style={{ maxWidth: 900 }}>
          {tutos.map((t, i) => (
            <details key={t.id} className="tuto-d apparait" open={i === 0}>
              <summary>
                <span className={`th${t.url_video ? " video" : ""}`} style={{ "--img": `url('${t.image}')` } as CSSProperties} />
                <span>
                  <strong>{t.titre}</strong>
                  <small>
                    {t.duree_min} min · {t.url_video ? "vidéo" : "pas à pas"} · {t.categorie}
                  </small>
                </span>
                <span className="plus">
                  <Icone nom="plus" />
                </span>
              </summary>
              <div className="corps">
                {t.url_video && (
                  <div className="video-cadre">
                    {t.url_video.endsWith(".mp4") ? (
                      // Une vidéo de Bailly, hébergée par la plateforme : son affiche et ses sous-titres portent le même nom.
                      <video controls playsInline preload="none" poster={t.url_video.replace(/\.mp4$/, "-affiche.jpg")} aria-label={t.titre}>
                        <source src={t.url_video} type="video/mp4" />
                        <track kind="subtitles" src={t.url_video.replace(/\.mp4$/, ".vtt")} srcLang="fr" label="Français" default />
                      </video>
                    ) : (
                      <iframe src={t.url_video} title={t.titre} allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
                    )}
                  </div>
                )}
                <p className="muted" style={{ marginBottom: 16 }}>
                  {t.resume}
                </p>
                <ol className="steps-v">
                  {t.etapes.map((x, j) => (
                    <li key={j}>
                      <span style={{ color: "var(--ink)", fontSize: 16 }}>{x}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </details>
          ))}
          {tutos.length === 0 && <div className="empty-slot">Les tutos arrivent bientôt.</div>}
        </div>
      </main>
    </>
  );
}

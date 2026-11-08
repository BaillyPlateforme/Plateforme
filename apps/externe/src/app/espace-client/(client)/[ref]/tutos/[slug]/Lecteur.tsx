"use client";

import { useEffect, useRef, useState } from "react";
import { Icone } from "../../../../_ui/Icone";
import { MarquerVu, signalerVu } from "./MarquerVu";

type Chapitre = { t: number; titre: string };

const mmss = (s: number) => {
  const n = Math.max(0, Math.floor(s));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
};

/** On démarre un chapitre un demi-temps avant sa réplique : la scène apparaît, puis la voix. */
const AVANCE = 0.5;

/**
 * Le lecteur d'un tutoriel : la vidéo de Bailly (sous-titres, affiche) et ses
 * chapitres, repris des sous-titres — un clic va au passage. Tout bouton de
 * la page marqué `data-seek="<secondes>"` (« Voir dans la vidéo », sous
 * chaque étape) fait de même, après avoir ramené le lecteur à l'écran.
 *
 * La vidéo regardée jusqu'au bout marque le tutoriel « vu » — sauf pendant un
 * aperçu de l'équipe, où rien ne s'écrit.
 */
export function Lecteur({
  reference,
  tutoId,
  titre,
  video,
  chapitres,
  vuLe,
  lectureSeule,
  aide,
}: {
  reference: string;
  tutoId: string;
  titre: string;
  video: { type: "mp4"; src: string; affiche: string; sousTitres: string } | { type: "integree"; src: string };
  chapitres: Chapitre[];
  vuLe: string | null;
  lectureSeule: boolean;
  aide: string | null;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const cadre = useRef<HTMLDivElement>(null);
  const liste = useRef<HTMLOListElement>(null);
  const [actif, setActif] = useState(-1);
  const finSignalee = useRef(false);

  // Le chapitre en cours reste visible dans sa liste — en la faisant défiler elle seule, jamais la page.
  useEffect(() => {
    const ol = liste.current;
    const b = actif >= 0 ? ol?.querySelectorAll<HTMLElement>("button")[actif] : null;
    if (!ol || !b) return;
    // La liste est positionnée (tutos.css) : les décalages des boutons se lisent depuis elle.
    if (ol.scrollWidth > ol.clientWidth) ol.scrollTo({ left: b.offsetLeft - 16, behavior: "smooth" });
    else if (ol.scrollHeight > ol.clientHeight) ol.scrollTo({ top: b.offsetTop - ol.clientHeight / 3, behavior: "smooth" });
  }, [actif]);

  // Aller à un instant : tout de suite si la vidéo connaît sa durée, sinon dès qu'elle la connaît.
  const aller = (t: number, ramener = false) => {
    const v = ref.current;
    if (!v) return;
    const cible = Math.max(0, t - AVANCE);
    const jouer = () => {
      v.currentTime = cible;
      v.play().catch(() => undefined);
    };
    if (v.readyState >= 1) jouer();
    else {
      v.addEventListener("loadedmetadata", jouer, { once: true });
      v.load();
    }
    if (ramener) cadre.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };

  // Les boutons « Voir dans la vidéo » de la page.
  useEffect(() => {
    const surClic = (e: MouseEvent) => {
      const b = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-seek]") : null;
      if (!b) return;
      const t = Number(b.dataset.seek);
      if (!Number.isFinite(t)) return;
      e.preventDefault();
      aller(t, true);
    };
    document.addEventListener("click", surClic);
    return () => document.removeEventListener("click", surClic);
  });

  const surTemps = () => {
    const v = ref.current;
    if (!v || !chapitres.length) return;
    let k = -1;
    chapitres.forEach((c, i) => {
      if (v.currentTime + AVANCE + 0.1 >= c.t) k = i;
    });
    if (k !== actif) setActif(k);
  };

  const surFin = () => {
    if (lectureSeule || vuLe || finSignalee.current) return;
    finSignalee.current = true;
    signalerVu(reference, tutoId, "video").catch(() => {
      finSignalee.current = false;
    });
  };

  return (
    <div className="tx-lecteur" id="lecteur" ref={cadre}>
      <div className={`tx-ecran${chapitres.length ? "" : " seul"}`}>
        <div className="tx-video">
          {video.type === "mp4" ? (
            <video ref={ref} controls playsInline preload="metadata" poster={video.affiche} aria-label={titre} onTimeUpdate={surTemps} onEnded={surFin}>
              <source src={video.src} type="video/mp4" />
              <track kind="subtitles" src={video.sousTitres} srcLang="fr" label="Français" default />
            </video>
          ) : (
            <iframe src={video.src} title={titre} allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
          )}
        </div>
        {chapitres.length > 0 && (
          <nav className="tx-chapitres" aria-label="Chapitres de la vidéo">
            <div className="tx-chapitres-in">
              <p className="tx-chapitres-t">
                <Icone nom="tutos" /> Chapitres <span>{chapitres.length}</span>
              </p>
              <ol ref={liste}>
                {chapitres.map((c, i) => (
                  <li key={c.t}>
                    <button type="button" className={i === actif ? "actif" : ""} aria-current={i === actif ? "true" : undefined} onClick={() => aller(c.t)}>
                      <span className="tc">{mmss(c.t)}</span>
                      <span className="tt">{c.titre}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </nav>
        )}
      </div>
      <div className="tx-lecteur-pied">
        <MarquerVu reference={reference} tutoId={tutoId} vuLe={vuLe} lectureSeule={lectureSeule} aide={aide} />
        {video.type === "mp4" && (
          <p className="note">
            <Icone nom="tutos" /> Vidéo sous-titrée en français.
          </p>
        )}
      </div>
    </div>
  );
}

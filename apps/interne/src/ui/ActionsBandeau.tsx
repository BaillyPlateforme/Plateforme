"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icone, type NomIcone } from "./icones";
import s from "./actions-bandeau.module.css";

/*
 * Les gestes d'une page, dans la bande indigo : UN geste principal en blanc
 * (un bouton partagé quand il a des variantes, ▾), au plus une ou deux
 * icônes de verre, et le reste derrière « ⋯ ». Une seule rangée, une seule
 * hauteur (40 px) : plus de mur de pilules (David, 08/11/2026).
 *
 *   <ActionsBandeau
 *     principale={{ label: "Ouvrir l'espace", href: "/…", nouvelOnglet: true, icone: "oeil" }}
 *     variantes={[{ label: "Modifier son espace", aide: "En édition, au nom du client", href: "/…?mode=edition", nouvelOnglet: true, icone: "crayon" }]}
 *     icones={[{ label: "Tout télécharger (ZIP)", href: "/…", telecharger: true, icone: "telecharger" }]}
 *     plus={[{ label: "Envoyer le lien d'accès", onClick: …, icone: "envoyer" }, "-", { label: "Couper les sessions", onClick: …, danger: true }]}
 *   />
 *
 * Un geste est un lien (`href`) ou un bouton (`onClick`). Un lien qui ouvre
 * un nouvel onglet est un simple <a target="_blank"> : jamais de
 * préchargement (un aperçu d'espace client note chaque ouverture) ; un lien
 * interne est un <Link prefetch={false}>. `telecharger` pose l'attribut
 * download. « - » dans `plus` trace un séparateur.
 */

type Commun = {
  label: string;
  icone?: NomIcone;
  /** Une ligne sous le libellé, dans les menus : ce que fait le geste. */
  aide?: string;
  /** L'info-bulle (sinon le libellé, pour une icône). */
  titre?: string;
  danger?: boolean;
  disabled?: boolean;
};
export type GesteLien = Commun & { href: string; nouvelOnglet?: boolean; telecharger?: boolean; onClick?: never };
export type GesteBouton = Commun & { onClick: () => void; href?: never };
export type Geste = GesteLien | GesteBouton;

export default function ActionsBandeau({
  principale,
  variantes,
  icones,
  plus,
  labelPlus = "Plus d’actions",
}: {
  principale?: Geste;
  /** Le menu ▾ du geste principal ; vide ou absent : un bouton simple. */
  variantes?: (Geste | false | null | undefined)[];
  /** Une ou deux icônes de verre, entre le geste principal et « ⋯ ». */
  icones?: (Geste | false | null | undefined)[];
  /** Le menu « ⋯ » ; « - » pour un séparateur. */
  plus?: (Geste | "-" | false | null | undefined)[];
  labelPlus?: string;
}) {
  const vars = (variantes ?? []).filter((g): g is Geste => !!g);
  const ics = (icones ?? []).filter((g): g is Geste => !!g);
  const autres = (plus ?? []).filter((g): g is Geste | "-" => !!g);
  return (
    <div className={s.ab}>
      {principale && (
        <div className={`${s.principale} ${vars.length ? s.partage : ""}`}>
          <Element geste={principale} className={s.corps}>
            {principale.icone && <Icone nom={principale.icone} taille={17} />}
            <span>{principale.label}</span>
          </Element>
          {vars.length > 0 && (
            <Deroulant label={`Autres façons : ${principale.label}`} className={s.fleche} contenu={<Liste gestes={vars} />}>
              <Icone nom="chevron" taille={16} />
            </Deroulant>
          )}
        </div>
      )}
      {ics.map((g) => (
        <Element key={g.label} geste={g} className={s.icone} titre={g.titre ?? g.label} aria={g.label}>
          <Icone nom={g.icone ?? "fleche"} taille={18} />
        </Element>
      ))}
      {autres.length > 0 && (
        <Deroulant label={labelPlus} className={s.icone} contenu={<Liste gestes={autres} />}>
          <Icone nom="points" taille={20} />
        </Deroulant>
      )}
    </div>
  );
}

/** Un geste : un lien (nouvel onglet, téléchargement ou page de l'app) ou un bouton. */
function Element({ geste, className, children, titre, aria }: { geste: Geste; className: string; children: React.ReactNode; titre?: string; aria?: string }) {
  const commun = { className, title: titre ?? geste.titre, "aria-label": aria, "data-danger": geste.danger ? "" : undefined };
  if (geste.href !== undefined) {
    if (geste.disabled) return <span {...commun} aria-disabled="true">{children}</span>;
    if (geste.nouvelOnglet || geste.telecharger)
      return (
        <a {...commun} href={geste.href} target={geste.nouvelOnglet ? "_blank" : undefined} rel={geste.nouvelOnglet ? "noopener" : undefined} download={geste.telecharger ? "" : undefined}>
          {children}
        </a>
      );
    return (
      <Link {...commun} href={geste.href} prefetch={false}>
        {children}
      </Link>
    );
  }
  return (
    <button {...commun} type="button" disabled={geste.disabled} onClick={geste.onClick}>
      {children}
    </button>
  );
}

function Liste({ gestes }: { gestes: (Geste | "-")[] }) {
  return (
    <>
      {gestes.map((g, i) =>
        g === "-" ? (
          <hr key={`sep${i}`} className={s.separateur} />
        ) : (
          <Element key={g.label} geste={g} className={s.item}>
            <i className={s.itemIcone}>{g.icone && <Icone nom={g.icone} taille={17} />}</i>
            <span className={s.itemTexte}>
              <b>{g.label}</b>
              {g.aide && <small>{g.aide}</small>}
            </span>
            {g.href !== undefined && g.nouvelOnglet && <Icone nom="externe" taille={14} className={s.itemSuffixe} />}
          </Element>
        ),
      )}
    </>
  );
}

/**
 * Un bouton qui ouvre un panneau par-dessus la page (portail), aligné à sa
 * droite : fermé au clic à côté, à Échap, au défilement, ou après un choix.
 */
function Deroulant({ label, className, contenu, children }: { label: string; className: string; contenu: React.ReactNode; children: React.ReactNode }) {
  const [ouvert, setOuvert] = useState<{ x: number; y: number } | null>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const panneau = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panneau.current?.contains(t) && !bouton.current?.contains(t)) setOuvert(null);
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOuvert(null);
      bouton.current?.focus();
    };
    const fermer = () => setOuvert(null);
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", echap);
    window.addEventListener("scroll", fermer, true);
    window.addEventListener("resize", fermer);
    // Le premier choix prend le focus : le menu se parcourt au clavier.
    panneau.current?.querySelector<HTMLElement>("a, button")?.focus();
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", echap);
      window.removeEventListener("scroll", fermer, true);
      window.removeEventListener("resize", fermer);
    };
  }, [ouvert]);

  return (
    <>
      <button
        ref={bouton}
        type="button"
        className={className}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={!!ouvert}
        onClick={() => {
          if (ouvert) return setOuvert(null);
          const r = bouton.current!.getBoundingClientRect();
          setOuvert({ x: Math.min(r.right, window.innerWidth - 12), y: r.bottom + 8 });
        }}
      >
        {children}
      </button>
      {ouvert &&
        createPortal(
          <div
            ref={panneau}
            className={s.panneau}
            style={{ top: ouvert.y, right: window.innerWidth - ouvert.x }}
            role="menu"
            onKeyDown={(e) => {
              if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
              e.preventDefault();
              const items = [...(panneau.current?.querySelectorAll<HTMLElement>("a, button:not(:disabled)") ?? [])];
              const i = items.indexOf(document.activeElement as HTMLElement);
              items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
            }}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("button, a")) setTimeout(() => setOuvert(null), 0);
            }}
          >
            {contenu}
          </div>,
          document.body,
        )}
    </>
  );
}

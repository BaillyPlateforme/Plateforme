"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { MOTIF_CLE, SOURCES, texteEnCours, type Entite } from "@/crm/copilote/types";
import { Icone } from "@/ui/icones";
import { Groupe, libelleEntite, lienEntite, teinteEntite, texteEntite } from "./Entites";
import { blocs, enLigne, type Morceau } from "./markdown";
import type { MessageCopilote } from "./stockage";
import s from "./copilote.module.css";

/*
 * Une réponse du Copilote : le texte mis en forme (Markdown), les éléments du
 * CRM qu'il montre (cartes), ce qu'il a consulté, « Copier », et trois
 * questions pour aller plus loin. Pendant qu'elle s'écrit : les outils
 * consultés, un à un, puis le texte au fil de l'eau.
 */

export default function Reponse({ m, dernier, poser, reessayer }: { m: MessageCopilote; dernier: boolean; poser: (q: string) => void; reessayer: () => void }) {
  const enCours = m.etat === "attente" || m.etat === "flux";
  const texte = enCours ? texteEnCours(m.texte) : m.texte;
  return (
    <article className={s.reponse} data-etat={m.etat} aria-busy={enCours}>
      <span className={s.avatar} data-anime={enCours || undefined} aria-hidden>
        <Icone nom="copilote" taille={16} />
      </span>
      <div className={s.corps}>
        {enCours && <Consultations m={m} />}
        {m.etat === "erreur" ? (
          <div className={s.erreur} role="alert">
            <Icone nom="alerte" taille={17} />
            <span>{m.texte}</span>
            {dernier && (
              <button type="button" onClick={reessayer}>
                Réessayer
              </button>
            )}
          </div>
        ) : (
          texte && <Rendu texte={texte} entites={m.entites} curseur={m.etat === "flux"} />
        )}
        {m.etat === "arrete" && (
          <p className={s.arrete}>
            Réponse interrompue.
            {dernier && (
              <button type="button" onClick={reessayer}>
                Reposer la question
              </button>
            )}
          </p>
        )}
        {(m.etat === "fini" || m.etat === "arrete") && <Pied m={m} />}
        {m.etat === "fini" && dernier && m.suites.length > 0 && (
          <div className={s.suites}>
            <small>Pour aller plus loin</small>
            {m.suites.map((q) => (
              <button key={q} type="button" onClick={() => poser(q)}>
                <Icone nom="fleche" taille={14} />
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

/** Ce que le Copilote consulte, pendant qu'il le consulte. */
function Consultations({ m }: { m: MessageCopilote }) {
  const liste = m.consultations;
  if (m.etat === "flux") return null;
  return (
    <div className={s.consultations} aria-live="polite">
      {liste.length === 0 ? (
        <p className={s.reflexion}>Le Copilote lit votre question…</p>
      ) : (
        <>
          {liste.map((c) => (
            <div key={c.id} className={s.consultation} data-fini={c.fini || undefined}>
              <span className={s.etat}>{c.fini ? <Icone nom="coche" taille={13} /> : <i />}</span>
              <Icone nom={SOURCES[c.outil]?.icone ?? "recherche"} taille={15} />
              <span>{c.libelle}</span>
              {c.fini && <small>{c.erreur ? "lecture impossible" : c.n ? `${c.n} trouvé${c.n > 1 ? "s" : ""}` : "rien trouvé"}</small>}
            </div>
          ))}
          {liste.every((c) => c.fini) && <p className={s.reflexion}>Le Copilote rédige sa réponse…</p>}
        </>
      )}
    </div>
  );
}

/** Le pied d'une réponse : copier, et les sources consultées (qu'on déplie pour voir ce qui a été lu). */
function Pied({ m }: { m: MessageCopilote }) {
  const [copie, setCopie] = useState(false);
  const [ouverte, setOuverte] = useState<string | null>(null);
  // Une source par outil : deux recherches de dossiers font une seule pastille.
  const sources: { id: string; outil: string; libelle: string; n: number; cles: string[] }[] = [];
  for (const c of m.consultations.filter((x) => x.fini)) {
    const deja = sources.find((x) => x.outil === c.outil);
    if (deja) {
      deja.libelle += ` · ${c.libelle}`;
      deja.n += c.n ?? 0;
      deja.cles.push(...(c.cles ?? []).filter((k) => !deja.cles.includes(k)));
    } else sources.push({ id: c.outil, outil: c.outil, libelle: c.libelle, n: c.n ?? 0, cles: [...(c.cles ?? [])] });
  }
  for (const x of sources) x.n = x.cles.length || x.n;
  const deplie = sources.find((c) => c.id === ouverte);
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(enClair(m.texte, m.entites));
      setCopie(true);
      setTimeout(() => setCopie(false), 1600);
    } catch {
      /* presse-papiers refusé */
    }
  };
  return (
    <>
      <div className={s.pied}>
        {m.texte && (
          <button type="button" className={s.copier} onClick={copier} data-fait={copie || undefined}>
            <Icone nom={copie ? "coche" : "fichier"} taille={14} />
            {copie ? "Copié" : "Copier"}
          </button>
        )}
        {sources.length > 0 && <span className={s.separateur} aria-hidden />}
        {sources.map((c) => (
          <button
            key={c.id}
            type="button"
            className={s.source}
            aria-expanded={ouverte === c.id}
            onClick={() => setOuverte(ouverte === c.id ? null : c.id)}
            title={`Consulté : ${c.libelle}`}
          >
            <Icone nom={SOURCES[c.outil]?.icone ?? "recherche"} taille={13} />
            {SOURCES[c.outil]?.libelle ?? c.outil}
            {c.n ? <i>{c.n}</i> : null}
          </button>
        ))}
        {m.duree && m.etat === "fini" ? <small className={s.duree}>{(m.duree / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s</small> : null}
      </div>
      {deplie && (
        <div className={s.consulte}>
          <p>
            <b>{deplie.libelle}</b> · {deplie.n ? `${deplie.n} élément${deplie.n > 1 ? "s" : ""} lu${deplie.n > 1 ? "s" : ""}` : "rien trouvé"}
          </p>
          {(deplie.cles ?? []).map((k) => {
            const e = m.entites[k];
            if (!e) return null;
            const href = lienEntite(e);
            const contenu = (
              <>
                <i style={{ background: teinteEntite(e) }} />
                {texteEntite(e)}
              </>
            );
            return href ? (
              <Link key={k} href={href}>
                {contenu}
              </Link>
            ) : (
              <span key={k}>{contenu}</span>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ───────── Le Markdown, et les clés en cartes ───────── */

function Rendu({ texte, entites, curseur }: { texte: string; entites: Record<string, Entite>; curseur: boolean }) {
  const liste = blocs(texte);
  return (
    <div className={s.texte} data-curseur={curseur || undefined}>
      {liste.map((b, i) => {
        switch (b.k) {
          case "titre":
            return b.niveau === 3 ? <h3 key={i}>{morceaux(enLigne(b.texte), entites)}</h3> : <h4 key={i}>{morceaux(enLigne(b.texte), entites)}</h4>;
          case "para":
            return (
              <p key={i}>
                {b.lignes.map((l, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    {morceaux(enLigne(l), entites)}
                  </Fragment>
                ))}
              </p>
            );
          case "liste": {
            const Liste = b.ordonnee ? "ol" : "ul";
            return (
              <Liste key={i}>
                {b.items.map((x, j) => (
                  <li key={j}>{morceaux(enLigne(x), entites)}</li>
                ))}
              </Liste>
            );
          }
          case "table":
            return (
              <div key={i} className={s.tableau}>
                <table>
                  <thead>
                    <tr>
                      {b.entetes.map((h, j) => (
                        <th key={j}>{morceaux(enLigne(h), entites)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.lignes.map((l, j) => (
                      <tr key={j}>
                        {l.map((c, k) => (
                          <td key={k} data-nombre={/^[\s+−-]*[\d\s.,]+\s*(€|%|m³)?$/.test(c) || undefined}>
                            {morceaux(enLigne(c), entites)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "citation":
            return <blockquote key={i}>{morceaux(enLigne(b.texte), entites)}</blockquote>;
          case "regle":
            return <hr key={i} />;
          case "cles":
            return <Cles key={i} cles={b.cles} entites={entites} />;
        }
      })}
    </div>
  );
}

/** Des clés à la suite : groupées par genre, dans l'ordre où le Copilote les a écrites. */
function Cles({ cles, entites }: { cles: string[]; entites: Record<string, Entite> }) {
  const groupes: Entite[][] = [];
  const vues = new Set<string>();
  for (const k of cles) {
    const e = entites[k];
    if (!e || vues.has(k)) continue;
    vues.add(k);
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier[0].genre === e.genre) dernier.push(e);
    else groupes.push([e]);
  }
  if (!groupes.length) return null;
  return (
    <div className={s.elements}>
      {groupes.map((g) => (
        <Groupe key={g[0].cle} entites={g} />
      ))}
    </div>
  );
}

function morceaux(liste: Morceau[], entites: Record<string, Entite>): React.ReactNode {
  return liste.map((m, i) => {
    switch (m.k) {
      case "texte":
        return <Fragment key={i}>{m.t}</Fragment>;
      case "gras":
        return <b key={i}>{morceaux(m.enfants, entites)}</b>;
      case "italique":
        return <em key={i}>{morceaux(m.enfants, entites)}</em>;
      case "code":
        return <code key={i}>{m.t}</code>;
      case "lien":
        return (
          <Link key={i} href={m.href} className={s.lien}>
            {m.t}
          </Link>
        );
      case "cle": {
        const e = entites[m.cle];
        if (!e) return null;
        const href = lienEntite(e);
        const contenu = (
          <>
            <i style={{ background: teinteEntite(e) }} />
            {libelleEntite(e)}
          </>
        );
        return href ? (
          <Link key={i} href={href} className={s.puceLien}>
            {contenu}
          </Link>
        ) : (
          <span key={i} className={s.puceLien}>
            {contenu}
          </span>
        );
      }
    }
  });
}

/** La réponse en texte simple, pour « Copier » : les cartes en lignes, sans balises. */
function enClair(texte: string, entites: Record<string, Entite>): string {
  return texte
    .split("\n")
    .map((l) => {
      const seules = l.replace(MOTIF_CLE, "").replace(/^[\s\-*•,;]+$/, "");
      const cles = [...l.matchAll(MOTIF_CLE)].map((x) => entites[`${x[1]}:${x[2]}`]).filter(Boolean);
      if (cles.length && !seules.trim()) return cles.map((e) => `• ${texteEntite(e)}`).join("\n");
      return l.replace(MOTIF_CLE, (_, g, id) => (entites[`${g}:${id}`] ? libelleEntite(entites[`${g}:${id}`]) : ""));
    })
    .join("\n")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

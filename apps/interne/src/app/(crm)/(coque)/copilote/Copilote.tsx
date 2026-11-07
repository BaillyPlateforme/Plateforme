"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { Icone, type NomIcone } from "@/ui/icones";
import s from "./copilote.module.css";

type Message = { role: "utilisateur" | "copilote"; texte: string; outils?: string[]; erreur?: boolean };

const SUGGESTIONS: { icone: NomIcone; texte: string }[] = [
  { icone: "devis", texte: "Quels devis dois-je relancer ?" },
  { icone: "calendrier", texte: "Mon agenda des 7 prochains jours" },
  { icone: "camion", texte: "Les déménagements de la semaine" },
  { icone: "euro", texte: "Le chiffre d’affaires du mois, comparé au mois dernier" },
  { icone: "questionnaires", texte: "Les nouvelles demandes du site" },
  { icone: "clients", texte: "Où en est le dossier de Quentin Dupuis ?" },
];

const SOURCES: Record<string, string> = {
  chercher_dossiers: "recherche de dossiers",
  dossier: "fiche dossier",
  agenda: "agenda",
  demenagements_a_venir: "déménagements à venir",
  devis_a_relancer: "devis à relancer",
  chiffres: "chiffres de l’agence",
  demandes_du_site: "demandes du site",
};

export default function Copilote({ prenom }: { prenom: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [saisie, setSaisie] = useState("");
  const [enCours, setEnCours] = useState(false);
  const fil = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fil.current?.scrollTo({ top: fil.current.scrollHeight, behavior: "smooth" });
  }, [messages, enCours]);

  async function envoyer(question: string) {
    const q = question.trim();
    if (!q || enCours) return;
    const suite: Message[] = [...messages, { role: "utilisateur", texte: q }];
    setMessages(suite);
    setSaisie("");
    setEnCours(true);
    try {
      const r = await fetch("/api/copilote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: suite.filter((m) => !m.erreur).map(({ role, texte }) => ({ role, texte })) }),
      });
      const d = (await r.json().catch(() => ({}))) as { texte?: string; outils?: string[]; erreur?: string };
      setMessages((m) => [...m, d.texte ? { role: "copilote", texte: d.texte, outils: d.outils } : { role: "copilote", texte: d.erreur ?? "Le Copilote n’a pas pu répondre.", erreur: true }]);
    } catch {
      setMessages((m) => [...m, { role: "copilote", texte: "Connexion perdue. Réessayez.", erreur: true }]);
    } finally {
      setEnCours(false);
      champ.current?.focus();
    }
  }

  const vide = messages.length === 0;

  return (
    <section className={`${s.carte} chevauche`}>
      <div className={s.fil} ref={fil} aria-live="polite">
        {vide ? (
          <div className={s.accueil}>
            <span className={s.orbe}>
              <Icone nom="copilote" taille={28} />
            </span>
            <h2>Bonjour {prenom}, que voulez-vous savoir ?</h2>
            <p>Le Copilote lit les dossiers, l’agenda, les devis, les factures et les demandes du site. Il ne modifie rien.</p>
            <div className={s.suggestions}>
              {SUGGESTIONS.map((x) => (
                <button key={x.texte} type="button" onClick={() => envoyer(x.texte)}>
                  <i>
                    <Icone nom={x.icone} taille={17} />
                  </i>
                  {x.texte}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={m.role === "utilisateur" ? s.question : `${s.reponse} ${m.erreur ? s.erreur : ""}`}>
              {m.role === "copilote" && (
                <span className={s.avatar}>
                  <Icone nom="copilote" taille={16} />
                </span>
              )}
              <div className={s.bulle}>
                {m.role === "copilote" ? <Rendu texte={m.texte} /> : m.texte}
                {m.outils && m.outils.length > 0 && (
                  <small className={s.sources}>Consulté : {[...new Set(m.outils)].map((o) => SOURCES[o] ?? o).join(", ")}</small>
                )}
              </div>
            </div>
          ))
        )}
        {enCours && (
          <div className={s.reponse}>
            <span className={s.avatar}>
              <Icone nom="copilote" taille={16} />
            </span>
            <div className={`${s.bulle} ${s.attente}`}>
              <span className={s.points}>
                <i />
                <i />
                <i />
              </span>
              Le Copilote consulte le CRM…
            </div>
          </div>
        )}
      </div>

      <form
        className={s.saisie}
        onSubmit={(e) => {
          e.preventDefault();
          envoyer(saisie);
        }}
      >
        {!vide && (
          <button type="button" className={s.nouvelle} onClick={() => setMessages([])} disabled={enCours} title="Nouvelle conversation">
            <Icone nom="plus" taille={18} />
          </button>
        )}
        <textarea
          ref={champ}
          value={saisie}
          rows={1}
          placeholder="Posez votre question : un client, un dossier, l’agenda, les devis…"
          aria-label="Votre question"
          onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              envoyer(saisie);
            }
          }}
        />
        <button type="submit" className={s.envoyer} disabled={!saisie.trim() || enCours} aria-label="Envoyer">
          <Icone nom="fleche" taille={18} />
        </button>
      </form>
    </section>
  );
}

/**
 * Un Markdown réduit : paragraphes, listes à puces, **gras** et liens. Les
 * liens ne mènent qu'à des pages du CRM (adresses qui commencent par « / ») ;
 * tout le reste est rendu en texte. Pas de HTML injecté.
 */
function Rendu({ texte }: { texte: string }) {
  const blocs: React.ReactNode[] = [];
  let liste: string[] = [];
  const vider = () => {
    if (liste.length) blocs.push(<ul key={`l${blocs.length}`}>{liste.map((l, i) => <li key={i}>{enLigne(l)}</li>)}</ul>);
    liste = [];
  };
  for (const ligne of texte.split("\n")) {
    const puce = ligne.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (puce) {
      liste.push(puce[1]);
      continue;
    }
    vider();
    if (ligne.trim()) blocs.push(<p key={`p${blocs.length}`}>{enLigne(ligne.replace(/^#+\s*/, ""))}</p>);
  }
  vider();
  return <>{blocs}</>;
}

function enLigne(t: string): React.ReactNode {
  // Le gras d'abord (il peut contenir un lien), puis les liens.
  const morceaux = t.split(/(\*\*.+?\*\*|\[[^\]]+\]\([^)]+\))/g);
  return morceaux.map((m, i) => {
    const gras = m.match(/^\*\*(.+?)\*\*$/);
    if (gras) return <b key={i}>{enLigne(gras[1])}</b>;
    const lien = m.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (lien) {
      const href = lien[2].trim();
      return /^\/(?!\/)/.test(href) ? (
        <Link key={i} href={href}>
          {lien[1]}
        </Link>
      ) : (
        <Fragment key={i}>{lien[1]}</Fragment>
      );
    }
    return <Fragment key={i}>{m}</Fragment>;
  });
}

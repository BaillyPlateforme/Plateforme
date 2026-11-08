"use client";

import { Fragment, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Puce } from "@/crm/copilote/apercu";
import { Icone, type NomIcone } from "@/ui/icones";
import Reponse from "./Reponse";
import { useCopilote, type Conversation, type Message } from "./stockage";
import s from "./copilote.module.css";

/*
 * Le Copilote : une conversation dans un panneau qui occupe l'écran sous la
 * bande. Les messages défilent dans le panneau, la saisie reste en bas, la
 * page elle-même ne bouge jamais : on ne fait défiler que la liste.
 *
 * Une question posée remonte en haut de la liste, et la réponse s'écrit
 * dessous, sans que la liste saute à chaque mot.
 */

const rien = () => () => {};

/* Où l'on en était dans chaque conversation : en mémoire, et pour l'onglet (sessionStorage) au rechargement. */
const POSITIONS = "bailly.copilote.positions";
const positions = new Map<string, number>();
function positionGardee(conv: string): number | undefined {
  if (!positions.size) {
    try {
      for (const [k, v] of Object.entries(JSON.parse(sessionStorage.getItem(POSITIONS) ?? "{}") as Record<string, number>)) positions.set(k, v);
    } catch {
      /* rien de gardé */
    }
  }
  return positions.get(conv);
}
function ecrirePositions() {
  try {
    sessionStorage.setItem(POSITIONS, JSON.stringify(Object.fromEntries([...positions].slice(-20))));
  } catch {
    /* stockage plein ou refusé */
  }
}

/** Une suggestion : son titre court sur la carte, la question posée, une ligne d'aide. */
type Theme = { titre: string; ton: string; icone: NomIcone; questions: { texte: string; question: string; aide: string; icone: NomIcone }[] };

function themes(clientRecent: string | null): Theme[] {
  return [
    {
      titre: "Commercial",
      ton: "indigo",
      icone: "clients",
      questions: [
        { texte: "Les devis à relancer", question: "Quels devis dois-je relancer ?", aide: "En attente de réponse", icone: "devis" },
        clientRecent
          ? { texte: `Où en est ${clientRecent} ?`, question: `Où en est le dossier de ${clientRecent} ?`, aide: "Étape et prochaine action", icone: "dossierClient" }
          : { texte: "Les signés sans date", question: "Les dossiers signés qui n'ont pas encore de date de déménagement", aide: "À planifier avec le client", icone: "dossierClient" },
      ],
    },
    {
      titre: "Planning",
      ton: "ciel",
      icone: "calendrier",
      questions: [
        { texte: "Mon agenda des 7 jours", question: "Mon agenda des 7 prochains jours", aide: "Visites, visios et tâches", icone: "calendrier" },
        { texte: "Les déménagements de la semaine", question: "Les déménagements des 7 prochains jours", aide: "Dates, volumes et trajets", icone: "camion" },
      ],
    },
    {
      titre: "Finances",
      ton: "vert",
      icone: "euro",
      questions: [
        { texte: "Le CA du mois, face au mois dernier", question: "Le chiffre d'affaires du mois, comparé au mois dernier", aide: "CA signé et écart en %", icone: "euro" },
        { texte: "Les devis signés sur 60 jours", question: "Combien de devis avons-nous signés ces 60 derniers jours ?", aide: "Envoyés, signés, taux", icone: "tendance" },
      ],
    },
    {
      titre: "Demandes du site",
      ton: "ambre",
      icone: "globe",
      questions: [
        { texte: "Les nouvelles demandes", question: "Les nouvelles demandes du site", aide: "Reçues, pas encore ouvertes", icone: "questionnaires" },
        { texte: "Les plus prometteuses", question: "Les demandes du site les plus prometteuses", aide: "Classées par potentiel", icone: "etoile" },
      ],
    },
  ];
}

export default function Copilote({ cle, prenom, clientRecent }: { cle: string; prenom: string; clientRecent: string | null }) {
  const c = useCopilote(cle);
  const { conversation, occupe } = c;
  // Les conversations sont dans le navigateur : rien à montrer avant d'y avoir lu (pas d'accueil qui clignote avant la conversation gardée).
  const monte = useSyncExternalStore(rien, () => true, () => false);
  const [saisie, setSaisie] = useState("");
  const [loin, setLoin] = useState(false);
  const panneau = useRef<HTMLElement>(null);
  const fil = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLTextAreaElement>(null);

  // Le panneau remplit l'écran sous la bande, quelle que soit la hauteur de la barre du haut.
  useLayoutEffect(() => {
    const el = panneau.current;
    if (!el) return;
    const placer = () => {
      const haut = el.getBoundingClientRect().top + window.scrollY;
      el.style.setProperty("--haut", `${Math.round(haut)}px`);
      const f = fil.current;
      if (!f) return;
      // Une liste montrée par la fin le reste quand sa hauteur change.
      const auBout = f.scrollTop > 0 && f.scrollHeight - f.scrollTop - f.clientHeight < 8;
      f.style.setProperty("--hauteur-fil", `${f.clientHeight}px`);
      if (auBout) f.scrollTop = f.scrollHeight;
    };
    placer();
    const ro = new ResizeObserver(placer);
    const entete = document.querySelector("header");
    if (entete) ro.observe(entete);
    if (fil.current) ro.observe(fil.current);
    window.addEventListener("resize", placer);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", placer);
    };
  }, []);

  const messages = conversation?.messages ?? [];
  const echanges = paires(messages);

  /*
   * Le défilement, dans la liste seulement : une conversation qu'on retrouve
   * (au retour sur la page, depuis l'historique) revient là où on l'avait
   * laissée, ou par la fin ; une question qu'on vient de poser (ici, ou depuis
   * la bande) remonte en haut de la liste, et sa réponse s'écrit dessous.
   */
  const convId = conversation?.id ?? null;
  const vu = useRef<{ conv: string | null; n: number } | null>(null);
  useLayoutEffect(() => {
    const f = fil.current;
    if (!f) return;
    const avant = vu.current;
    vu.current = { conv: convId, n: echanges.length };
    if (!convId) {
      f.scrollTop = 0;
      return;
    }
    const derniere = echanges[echanges.length - 1]?.[0];
    const nouvelleQuestion =
      avant !== null && (avant.conv === convId || avant.conv === null) && echanges.length === avant.n + 1 && !!derniere && Date.now() - derniere.le < 5000;
    if (!nouvelleQuestion) {
      if (avant?.conv === convId && avant.n === echanges.length) return;
      const garde = positionGardee(convId);
      f.scrollTop = garde ?? f.scrollHeight;
      return;
    }
    const questions = f.querySelectorAll<HTMLElement>("[data-question]");
    const el = questions[questions.length - 1];
    if (el) f.scrollTo({ top: el.offsetTop - 24, behavior: avant.n === 0 ? "auto" : "smooth" });
  }, [convId, echanges]);

  // La position de lecture, gardée pour le retour (navigation ou rechargement).
  useLayoutEffect(() => {
    const garder = () => ecrirePositions();
    window.addEventListener("pagehide", garder);
    return () => {
      garder();
      window.removeEventListener("pagehide", garder);
    };
  }, []);

  function poser(question: string) {
    const q = question.trim();
    if (!q || occupe) return;
    setSaisie("");
    void c.envoyer(q);
    champ.current?.focus({ preventScroll: true });
  }

  return (
    <section ref={panneau} className={`${s.panneau} chevauche`} aria-label="Conversation avec le Copilote">
      <div
        ref={fil}
        className={s.fil}
        onScroll={(e) => {
          // Loin : le bas de la dernière réponse est hors de vue (le dernier échange a une hauteur minimale, vide en partie).
          const f = e.currentTarget;
          if (convId) positions.set(convId, f.scrollTop);
          const fin = f.querySelector<HTMLElement>("[data-dernier] > article") ?? f.querySelector<HTMLElement>("[data-dernier]");
          setLoin(!!fin && fin.offsetTop + fin.offsetHeight - (f.scrollTop + f.clientHeight) > 200);
        }}
      >
        {!monte ? null : echanges.length === 0 ? (
          <Accueil prenom={prenom} themes={themes(clientRecent)} poser={poser} />
        ) : (
          <div className={s.conversation}>
            {echanges.map(([q, r], i) => (
              <div key={q.id} className={s.echange} data-dernier={i === echanges.length - 1 || undefined}>
                <div className={s.question} data-question>
                  <div className={s.bulle}>{q.texte}</div>
                </div>
                {r && r.role === "copilote" && <Reponse m={r} dernier={i === echanges.length - 1} poser={poser} reessayer={() => void c.reessayer()} />}
              </div>
            ))}
          </div>
        )}
      </div>

      {loin && echanges.length > 0 && (
        <button
          type="button"
          className={s.enBas}
          onClick={() => fil.current?.scrollTo({ top: fil.current.scrollHeight, behavior: "smooth" })}
          aria-label="Revenir à la dernière réponse"
        >
          <Icone nom="chevron" taille={18} />
        </button>
      )}

      <form
        className={s.saisie}
        onSubmit={(e) => {
          e.preventDefault();
          poser(saisie);
        }}
      >
        <div className={s.champ}>
          <textarea
            ref={champ}
            value={saisie}
            rows={1}
            placeholder={echanges.length ? "Une autre question…" : "Posez votre question : un client, un dossier, l'agenda, les devis, le chiffre d'affaires…"}
            aria-label="Votre question"
            onChange={(e) => setSaisie(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                poser(saisie);
              }
            }}
          />
          {occupe ? (
            <button type="button" className={s.arreter} onClick={c.arreter} aria-label="Arrêter la réponse" title="Arrêter">
              <i />
            </button>
          ) : (
            <button type="submit" className={s.envoyer} disabled={!saisie.trim()} aria-label="Envoyer" title="Envoyer (Entrée)">
              <Icone nom="fleche" taille={18} />
            </button>
          )}
        </div>
        <p className={s.aide}>
          <span>
            <kbd>Entrée</kbd> pour envoyer · <kbd>Maj</kbd> + <kbd>Entrée</kbd> pour aller à la ligne
          </span>
          <span>
            <Icone nom="oeil" taille={13} />
            Lecture seule : le Copilote lit le CRM, il ne modifie rien
          </span>
        </p>
      </form>

      {c.etat.historique && (
        <Historique
          conversations={c.etat.conversations.filter((x) => x.messages.length > 0)}
          courante={c.etat.courante}
          ouvrir={c.ouvrir}
          supprimer={c.supprimer}
          toutEffacer={c.toutEffacer}
          fermer={() => c.historique(false)}
        />
      )}
    </section>
  );
}

/** Les messages, deux par deux : une question et sa réponse. */
function paires(messages: Message[]): [Message, Message | undefined][] {
  const out: [Message, Message | undefined][] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role !== "utilisateur") continue;
    const suivant = messages[i + 1];
    out.push([messages[i], suivant?.role === "copilote" ? suivant : undefined]);
  }
  return out;
}

/* ───────── L'accueil d'une conversation vide ───────── */

function Accueil({ prenom, themes, poser }: { prenom: string; themes: Theme[]; poser: (q: string) => void }) {
  return (
    <div className={s.accueil}>
      <div className={s.salut}>
        <span className={s.orbe} aria-hidden>
          <Icone nom="copilote" taille={26} />
        </span>
        <div>
          <h2>
            Bonjour {prenom}, <span>que voulez-vous savoir ?</span>
          </h2>
          <p>Le Copilote lit les dossiers, l&apos;agenda, les devis, les chiffres et les demandes du site, puis vous répond avec les fiches à ouvrir.</p>
        </div>
      </div>

      <div className={s.themes}>
        {themes.map((t, i) => (
          <section key={t.titre} className={s.theme} data-ton={t.ton} style={{ "--i": i } as React.CSSProperties}>
            <h3>
              <i aria-hidden>
                <Icone nom={t.icone} taille={14} />
              </i>
              {t.titre}
            </h3>
            {t.questions.map((q) => (
              <button key={q.question} type="button" className={s.suggestion} onClick={() => poser(q.question)} title={q.question}>
                <span className={s.suggestionIcone} aria-hidden>
                  <Icone nom={q.icone} taille={17} />
                </span>
                <span className={s.suggestionTexte}>
                  <b>{q.texte}</b>
                  <small>{q.aide}</small>
                </span>
                <Icone nom="fleche" taille={15} className={s.suggestionFleche} />
              </button>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

/* ───────── L'historique, dans le panneau ───────── */

function Historique({
  conversations,
  courante,
  ouvrir,
  supprimer,
  toutEffacer,
  fermer,
}: {
  conversations: Conversation[];
  courante: string | null;
  ouvrir: (id: string) => void;
  supprimer: (id: string) => void;
  toutEffacer: () => void;
  fermer: () => void;
}) {
  const maintenant = new Date();
  const debutJour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate()).getTime();
  const groupes: { titre: string; liste: Conversation[] }[] = [
    { titre: "Aujourd'hui", liste: [] },
    { titre: "Hier", liste: [] },
    { titre: "Cette semaine", liste: [] },
    { titre: "Plus ancien", liste: [] },
  ];
  for (const conv of [...conversations].sort((a, b) => b.maj - a.maj)) {
    const g = conv.maj >= debutJour ? 0 : conv.maj >= debutJour - 86_400_000 ? 1 : conv.maj >= debutJour - 6 * 86_400_000 ? 2 : 3;
    groupes[g].liste.push(conv);
  }
  const heure = (t: number) => new Intl.DateTimeFormat("fr-FR", t >= debutJour - 86_400_000 ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" }).format(t);
  return (
    <>
      <div className={s.voile} onClick={fermer} aria-hidden />
      <aside className={s.historique} aria-label="Conversations précédentes" onKeyDown={(e) => e.key === "Escape" && fermer()}>
        <header>
          <span>
            <b>Historique</b>
            <small>Gardé sur cet ordinateur, pour vous seul</small>
          </span>
          <button type="button" onClick={fermer} aria-label="Fermer l'historique" autoFocus>
            <Icone nom="fermer" taille={16} />
          </button>
        </header>
        <div className={s.historiqueListe}>
          {conversations.length === 0 && <p className={s.vide}>Aucune conversation pour l&apos;instant.</p>}
          {groupes
            .filter((g) => g.liste.length)
            .map((g) => (
              <Fragment key={g.titre}>
                <h4>{g.titre}</h4>
                {g.liste.map((conv) => {
                  const n = conv.messages.filter((m) => m.role === "utilisateur").length;
                  return (
                    <div key={conv.id} className={s.passee} aria-current={conv.id === courante || undefined}>
                      <button type="button" onClick={() => ouvrir(conv.id)}>
                        <b>{conv.titre}</b>
                        <small>
                          {n} question{n > 1 ? "s" : ""} · {heure(conv.maj)}
                        </small>
                      </button>
                      <button type="button" className={s.supprimer} onClick={() => supprimer(conv.id)} aria-label={`Supprimer « ${conv.titre} »`} title="Supprimer">
                        <Icone nom="corbeille" taille={15} />
                      </button>
                    </div>
                  );
                })}
              </Fragment>
            ))}
        </div>
        {conversations.length > 0 && (
          <footer>
            <button type="button" onClick={toutEffacer}>
              Tout effacer
            </button>
          </footer>
        )}
      </aside>
    </>
  );
}

/** Les boutons de la bande : l'historique, et une nouvelle conversation (quand il y en a une en cours). */
export function ActionsCopilote({ cle }: { cle: string }) {
  const c = useCopilote(cle);
  const n = c.etat.conversations.filter((x) => x.messages.length > 0).length;
  return (
    <>
      <button type="button" data-ton="contour" className={s.boutonBande} onClick={() => c.historique()} aria-expanded={c.etat.historique}>
        <Icone nom="horloge" taille={16} />
        Historique{n ? ` · ${n}` : ""}
      </button>
      {c.conversation && (
        <button type="button" className={s.boutonBande} onClick={c.nouvelle}>
          <Icone nom="plus" taille={16} />
          Nouvelle conversation
        </button>
      )}
    </>
  );
}

/**
 * « En ce moment », dans la rangée du bas de la bande : quelques nombres lus
 * dans le CRM à l'ouverture de la page ; un clic pose la question qui les
 * détaille, dans la conversation en cours.
 */
export function PucesCopilote({ cle, puces }: { cle: string; puces: Puce[] }) {
  const c = useCopilote(cle);
  if (!puces.length) return null;
  return (
    <div className={s.pucesBande} role="group" aria-label="En ce moment">
      <span className={s.direct}>
        <i aria-hidden />
        En ce moment
      </span>
      {puces.map((p) => (
        <button key={p.cle} type="button" className={s.puce} data-ton={p.ton} onClick={() => void c.envoyer(p.question)} disabled={c.occupe} title={p.question}>
          <b>{p.nombre}</b>
          {p.libelle}
        </button>
      ))}
    </div>
  );
}

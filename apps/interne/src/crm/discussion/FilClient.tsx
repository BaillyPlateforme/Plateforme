"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icone } from "@/ui/icones";
import { enBlocs, fusionner, heureDe, initialesDe, LONGUEUR_MAX, tailleLisible, type FilVue, type MessageVue } from "@/lib/espace-client/discussion-vue";
import { repondreAuClient } from "./actions";
import s from "./discussion.module.css";

/*
 * Le fil d'un client, vu de l'équipe : ses messages, les réponses de
 * l'équipe, et la saisie d'une réponse — en son nom. Un composant, trois
 * places : la page du dossier et le suivi de son espace (en encart
 * repliable), la boîte de réception (en panneau, à droite de la liste).
 *
 * - Le fil se relit toutes les quinze secondes tant qu'il est ouvert (une
 *   fois par minute replié), par /api/data/discussion/<dossier>.
 * - Ouvert ET à l'écran, il marque lus les messages du client : un encart
 *   replié, ou ouvert plus bas dans la page, ne compte pas comme lu.
 * - Une réponse s'affiche aussitôt (« Envoi… ») puis prend sa place ; le
 *   client est prévenu par e-mail (regroupé sur dix minutes).
 * - Entrée envoie, Maj + Entrée passe à la ligne.
 */

const RELECTURE_MS = 15_000;
const RELECTURE_REPLIE_MS = 60_000;

export default function FilClient({
  dossierId,
  client,
  reference,
  liens = [],
  variante = "encart",
  onLu,
  onRepondu,
}: {
  /** Le dossier de l'espace client (ec_dossiers.id). */
  dossierId: string;
  /** Le nom du client, pour l'en-tête ; sans lui, « Discussion avec le client ». */
  client?: string;
  reference?: string;
  /** Des liens dans l'en-tête : le dossier, son espace… */
  liens?: { href: string; libelle: string }[];
  variante?: "encart" | "panneau";
  onLu?: (dossierId: string) => void;
  onRepondu?: (dossierId: string, m: MessageVue) => void;
}) {
  const [messages, setMessages] = useState<MessageVue[]>([]);
  const [charge, setCharge] = useState(false);
  const [erreurLecture, setErreurLecture] = useState(false);
  const [ouvert, setOuvert] = useState(variante === "panneau");
  const [visible, setVisible] = useState(false);
  const [texte, setTexte] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  // Le premier message du client pas encore lu à l'ouverture : le filet « Nouveaux » se pose avant lui.
  const [premierNouveau, setPremierNouveau] = useState<string | null>(null);
  const racine = useRef<HTMLElement>(null);
  const corps = useRef<HTMLDivElement>(null);
  const saisie = useRef<HTMLTextAreaElement>(null);
  const enBas = useRef(true);
  const premiereLecture = useRef(true);
  const url = `/api/data/discussion/${dossierId}`;

  const lire = useCallback(async () => {
    try {
      const r = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error(String(r.status));
      const fil = (await r.json()) as FilVue;
      setMessages((local) => fusionner(fil.messages, local));
      if (premiereLecture.current) {
        premiereLecture.current = false;
        const nouveau = fil.messages.find((m) => m.auteur === "client" && !m.luParEquipe);
        setPremierNouveau(nouveau?.id ?? null);
        // Des messages attendent : l'encart s'ouvre de lui-même (lus seulement une fois à l'écran).
        if (nouveau) setOuvert(true);
      }
      setErreurLecture(false);
    } catch {
      setErreurLecture(true);
    } finally {
      setCharge(true);
    }
  }, [url]);

  useEffect(() => {
    const premiere = window.setTimeout(lire, 0);
    const minuteur = window.setInterval(() => document.visibilityState === "visible" && lire(), ouvert ? RELECTURE_MS : RELECTURE_REPLIE_MS);
    return () => {
      window.clearTimeout(premiere);
      window.clearInterval(minuteur);
    };
  }, [lire, ouvert]);

  // À l'écran : la moitié du fil au moins dans la fenêtre.
  useEffect(() => {
    const el = racine.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const nonLus = useMemo(() => messages.filter((m) => m.auteur === "client" && !m.luParEquipe).length, [messages]);
  useEffect(() => {
    if (!ouvert || !visible || nonLus === 0 || document.visibilityState !== "visible") return;
    const t = window.setTimeout(async () => {
      const r = await fetch(url, { method: "POST" }).catch(() => null);
      if (!r?.ok) return;
      const le = new Date().toISOString();
      setMessages((ms) => ms.map((m) => (m.auteur === "client" && !m.luParEquipe ? { ...m, luParEquipe: le } : m)));
      onLu?.(dossierId);
    }, 1200);
    return () => window.clearTimeout(t);
  }, [ouvert, visible, nonLus, url, dossierId, onLu]);

  useLayoutEffect(() => {
    const el = corps.current;
    if (el && enBas.current) el.scrollTop = el.scrollHeight;
  }, [messages, ouvert, charge]);
  // Une photo arrivée après coup agrandit le fil : on reste en bas si l'on y était.
  const recaler = useCallback(() => {
    const el = corps.current;
    if (el && enBas.current) el.scrollTop = el.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    const t = saisie.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 180)}px`;
  }, [texte]);

  const expedier = async (temp: MessageVue) => {
    try {
      const r = await repondreAuClient(dossierId, temp.corps);
      if (r.ok) {
        setMessages((ms) => [...ms.filter((m) => m.id !== temp.id && m.id !== r.message.id), r.message].sort((a, b) => (a.etat ? 1 : 0) - (b.etat ? 1 : 0) || a.le.localeCompare(b.le)));
        onRepondu?.(dossierId, r.message);
      } else {
        setMessages((ms) => ms.map((m) => (m.id === temp.id ? { ...m, etat: "echec" } : m)));
        setErreur(r.erreur);
      }
    } catch {
      setMessages((ms) => ms.map((m) => (m.id === temp.id ? { ...m, etat: "echec" } : m)));
      setErreur("La réponse n'est pas partie : réessayez.");
    }
  };

  const envoyer = () => {
    const t = texte.trim();
    if (!t) return;
    if (t.length > LONGUEUR_MAX) return setErreur(`${LONGUEUR_MAX} caractères au plus.`);
    const temp: MessageVue = { id: `envoi-${Date.now()}`, auteur: "equipe", nom: "Vous", corps: t, piece: null, le: new Date().toISOString(), luParClient: null, luParEquipe: null, etat: "envoi" };
    enBas.current = true;
    setErreur(null);
    setTexte("");
    setMessages((ms) => [...ms, temp]);
    void expedier(temp);
  };

  const reessayer = (m: MessageVue) => {
    setErreur(null);
    setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, etat: "envoi" } : x)));
    void expedier(m);
  };

  const blocs = useMemo(() => enBlocs(messages), [messages]);
  const dernierEquipe = [...messages].reverse().find((m) => m.auteur === "equipe" && !m.etat);
  const dernier = messages[messages.length - 1];
  const sansReponse = dernier?.auteur === "client";
  const titre = client ? client : "Discussion avec le client";

  return (
    <section ref={racine} className={s.fil} data-variante={variante} data-ouvert={ouvert || undefined} aria-label={`Discussion avec ${client ?? "le client"}`}>
      <header className={s.tete}>
        <span className={s.avatarClient} aria-hidden>
          {client ? initialesDe(client) : <Icone nom="courrier" taille={18} />}
        </span>
        <div className={s.teteTexte}>
          <p className={s.surtitre}>{variante === "encart" ? "Discussion · espace client" : reference ? `Dossier ${reference}` : "Espace client"}</p>
          <h2 className={s.titre}>{variante === "encart" ? (client ? `Discussion avec ${client}` : "Discussion avec le client") : titre}</h2>
        </div>
        <div className={s.teteDroite}>
          {nonLus > 0 ? (
            <span className={s.etat} data-ton="ambre">
              {nonLus} non lu{nonLus > 1 ? "s" : ""}
            </span>
          ) : sansReponse ? (
            <span className={s.etat} data-ton="ambre">
              Sans réponse
            </span>
          ) : messages.length > 0 ? (
            <span className={s.etat} data-ton="vert">
              À jour
            </span>
          ) : null}
          {liens.map((l) => (
            <Link key={l.href} href={l.href} className={s.lienTete}>
              {l.libelle}
            </Link>
          ))}
          {variante === "encart" && (
            <button type="button" className={s.replier} onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert}>
              {ouvert ? "Replier" : messages.length ? `Ouvrir (${messages.length})` : "Écrire au client"}
              <Icone nom="chevron" taille={15} />
            </button>
          )}
        </div>
      </header>

      {variante === "encart" && !ouvert && dernier && (
        <button type="button" className={s.apercu} onClick={() => setOuvert(true)}>
          <b>{dernier.auteur === "client" ? dernier.nom : `Vous (${dernier.nom})`}</b>
          <span>{dernier.corps || (dernier.piece ? `Pièce jointe : ${dernier.piece.nom}` : "")}</span>
          <time>{heureDe(dernier.le)}</time>
        </button>
      )}

      {ouvert && (
        <>
          <div
            className={s.corps}
            ref={corps}
            role="log"
            aria-live="polite"
            onScroll={() => {
              const el = corps.current;
              if (el) enBas.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
          >
            {!charge ? (
              <p className={s.vide}>Chargement de la discussion…</p>
            ) : messages.length === 0 ? (
              <div className={s.vide}>
                <Icone nom="courrier" taille={22} />
                <b>Aucun message pour l&apos;instant</b>
                <span>Le client écrit depuis son espace (bulle « Une question ? », page « Mon conseiller »). Vous pouvez aussi lui écrire le premier : il le lira dans son espace et en sera prévenu par e-mail.</span>
              </div>
            ) : (
              blocs.map((b) =>
                b.type === "jour" ? (
                  <p key={b.cle} className={s.jour}>
                    <span>{b.libelle}</span>
                  </p>
                ) : (
                  <Fragment key={b.cle}>
                    {b.messages[0].id === premierNouveau && (
                      <p className={s.nouveaux}>
                        <span>Nouveaux messages</span>
                      </p>
                    )}
                    <div className={s.groupe} data-auteur={b.auteur}>
                      {b.auteur === "client" && <span className={s.avatar}>{initialesDe(b.nom)}</span>}
                      <div className={s.pile}>
                        <p className={s.qui}>
                          <b>{b.nom}</b>
                          <time dateTime={b.messages[0].le}>{heureDe(b.messages[0].le)}</time>
                        </p>
                        {b.messages.map((m) => (
                          <div key={m.id} className={s.bulle} data-etat={m.etat} data-non-lu={(m.auteur === "client" && !m.luParEquipe) || undefined}>
                            {m.piece &&
                              (m.piece.image ? (
                                <Photo lien={m.piece.lien} nom={m.piece.nom} onLoad={recaler} />
                              ) : (
                                <a className={s.fichier} href={m.piece.lien} target="_blank" rel="noopener noreferrer">
                                  <Icone nom="trombone" taille={16} />
                                  <span>
                                    <b>{m.piece.nom}</b>
                                    {tailleLisible(m.piece.taille)}
                                  </span>
                                </a>
                              ))}
                            {m.corps && <p>{m.corps}</p>}
                            {m.etat === "echec" && (
                              <button type="button" className={s.reessayer} onClick={() => reessayer(m)}>
                                Réessayer
                              </button>
                            )}
                          </div>
                        ))}
                        {b.auteur === "equipe" && b.messages.some((m) => m.etat === "envoi") && <p className={s.statut}>Envoi…</p>}
                        {dernierEquipe && b.messages[b.messages.length - 1] === dernierEquipe && (
                          <p className={s.statut} data-lu={dernierEquipe.luParClient ? "" : undefined}>
                            {dernierEquipe.luParClient ? (
                              <>
                                <Icone nom="coche" taille={13} /> Lu par le client · {heureDe(dernierEquipe.luParClient)}
                              </>
                            ) : (
                              "Pas encore lu par le client"
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  </Fragment>
                ),
              )
            )}
            {erreurLecture && charge && <p className={s.alerte}>La discussion ne se met plus à jour : vérifiez la connexion.</p>}
          </div>

          <form
            className={s.saisie}
            onSubmit={(e) => {
              e.preventDefault();
              envoyer();
            }}
          >
            {erreur && (
              <p className={s.erreur} role="alert">
                {erreur}
              </p>
            )}
            <div className={s.ligne}>
              <textarea
                ref={saisie}
                rows={1}
                value={texte}
                maxLength={LONGUEUR_MAX}
                placeholder={client ? `Répondre à ${client}…` : "Répondre au client…"}
                aria-label="Votre réponse"
                onChange={(e) => {
                  setTexte(e.target.value);
                  if (erreur) setErreur(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    envoyer();
                  }
                }}
              />
              <button type="submit" className={s.envoyer} disabled={!texte.trim()}>
                Envoyer
                <Icone nom="fleche" taille={16} />
              </button>
            </div>
            <p className={s.aide}>Entrée : envoyer · Maj + Entrée : à la ligne · le client est prévenu par e-mail (un au plus par 10 min)</p>
          </form>
        </>
      )}
    </section>
  );
}

/** Une photo jointe : la vignette garde sa première adresse (le fil se relit toutes les quinze secondes, elle ne se recharge pas), le clic prend la dernière. */
function Photo({ lien, nom, onLoad }: { lien: string; nom: string; onLoad: () => void }) {
  const [src] = useState(lien);
  return (
    <a className={s.photo} href={lien} target="_blank" rel="noopener noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element -- une pièce privée, servie par un lien signé de cinq minutes */}
      <img src={src} alt={nom} onLoad={onLoad} />
    </a>
  );
}

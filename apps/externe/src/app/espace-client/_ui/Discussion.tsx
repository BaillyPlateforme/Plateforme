"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { envoyerAuConseiller } from "@/lib/actions/discussion";
import { enBlocs, fusionner, heureDe, IMAGES_AFFICHABLES, initialesDe, LONGUEUR_MAX, prenomDe, tailleLisible, type FilVue, type MessageVue } from "@/lib/espace-client/discussion-vue";
import { TYPES_DOCUMENTS, verifierFichier } from "@/lib/espace-client/schemas";
import { Icone } from "./Icone";

/*
 * La discussion du client avec son conseiller : le fil et la saisie. Une
 * seule pièce pour la bulle « Une question ? » (BulleDiscussion) et pour la
 * page « Mon conseiller ».
 *
 * - Le fil se relit toutes les douze secondes tant qu'il est à l'écran
 *   (bulle ouverte, page visible), par la route /espace-client/discussion :
 *   pas de temps réel, une lecture légère.
 * - Vu à l'écran, il marque lus les messages de l'équipe (sauf pendant un
 *   aperçu de l'équipe, en lecture seule).
 * - Un envoi s'affiche aussitôt (« Envoi… »), puis prend sa place définitive ;
 *   refusé, il reste avec « Réessayer ».
 * - Entrée envoie, Maj + Entrée passe à la ligne. Une pièce jointe au plus :
 *   une photo ou un PDF de 10 Mo.
 */

const RELECTURE_MS = 12_000;

export interface ConseillerVue {
  prenom: string;
  nom: string;
}

export function Discussion({
  reference,
  conseiller,
  lectureSeule,
  initiaux = null,
  actif,
  variante,
  onNonLus,
}: {
  reference: string;
  conseiller: ConseillerVue;
  lectureSeule: boolean;
  /** Le fil lu par la page (rendu serveur) ; sans lui, la première lecture se fait ici. */
  initiaux?: MessageVue[] | null;
  /** À l'écran : on relit, on marque lu. */
  actif: boolean;
  variante: "panneau" | "page";
  /** Le nombre de messages de l'équipe pas encore lus, pour la pastille de la bulle. */
  onNonLus?: (n: number) => void;
}) {
  const [messages, setMessages] = useState<MessageVue[]>(initiaux ?? []);
  const [charge, setCharge] = useState(initiaux !== null);
  const [erreurLecture, setErreurLecture] = useState(false);
  const [texte, setTexte] = useState("");
  const [fichier, setFichier] = useState<File | null>(null);
  const [vignette, setVignette] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const corps = useRef<HTMLDivElement>(null);
  const saisie = useRef<HTMLTextAreaElement>(null);
  const choix = useRef<HTMLInputElement>(null);
  const enAttente = useRef(new Map<string, FormData>());
  const enBas = useRef(true);
  const url = `/espace-client/discussion/${encodeURIComponent(reference)}`;

  // --- Lire ---------------------------------------------------------------------------------------
  const lire = useCallback(async () => {
    try {
      const r = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
      if (!r.ok || !r.headers.get("content-type")?.includes("json")) throw new Error(String(r.status));
      const fil = (await r.json()) as FilVue;
      setMessages((local) => fusionner(fil.messages, local));
      setErreurLecture(false);
    } catch {
      setErreurLecture(true);
    } finally {
      setCharge(true);
    }
  }, [url]);

  useEffect(() => {
    if (!actif) return;
    // La bulle ouverte, ou une page dont le fil n'a pas été lu par le serveur : une lecture tout de suite.
    const premiere = window.setTimeout(lire, initiaux && variante === "page" ? RELECTURE_MS : 0);
    const minuteur = window.setInterval(() => {
      if (document.visibilityState === "visible") lire();
    }, RELECTURE_MS);
    const revenir = () => document.visibilityState === "visible" && lire();
    document.addEventListener("visibilitychange", revenir);
    return () => {
      window.clearTimeout(premiere);
      window.clearInterval(minuteur);
      document.removeEventListener("visibilitychange", revenir);
    };
  }, [actif, lire, initiaux, variante]);

  // --- Lu par le client -----------------------------------------------------------------------------
  const nonLus = useMemo(() => messages.filter((m) => m.auteur === "equipe" && !m.luParClient).length, [messages]);
  useEffect(() => {
    // Tant que le fil n'est pas lu, la pastille garde le compte donné par la page.
    if (charge) onNonLus?.(nonLus);
    if (!actif || lectureSeule || nonLus === 0 || document.visibilityState !== "visible") return;
    const t = window.setTimeout(async () => {
      const r = await fetch(url, { method: "POST" }).catch(() => null);
      if (!r?.ok) return;
      const le = new Date().toISOString();
      setMessages((ms) => ms.map((m) => (m.auteur === "equipe" && !m.luParClient ? { ...m, luParClient: le } : m)));
    }, 900);
    return () => window.clearTimeout(t);
  }, [actif, lectureSeule, nonLus, url, onNonLus, charge]);

  // --- Le défilement : en bas au départ, et à chaque nouveau message si l'on y était déjà ----------------
  useLayoutEffect(() => {
    const el = corps.current;
    if (el && enBas.current) el.scrollTop = el.scrollHeight;
  }, [messages, charge, actif]);
  const suivreDefilement = () => {
    const el = corps.current;
    if (el) enBas.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  // Une photo arrivée après coup agrandit le fil : on reste en bas si l'on y était.
  const recaler = useCallback(() => {
    const el = corps.current;
    if (el && enBas.current) el.scrollTop = el.scrollHeight;
  }, []);

  // --- La saisie --------------------------------------------------------------------------------------
  useEffect(() => {
    if (actif && variante === "panneau" && !lectureSeule) saisie.current?.focus({ preventScroll: true });
  }, [actif, variante, lectureSeule]);

  useLayoutEffect(() => {
    const t = saisie.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 168)}px`;
  }, [texte]);

  // La vignette d'une photo choisie : une adresse locale, rendue au navigateur quand elle ne sert plus.
  const choisirFichier = (f: File | null, { garderVignette = false } = {}) => {
    setErreur(null);
    if (vignette && !garderVignette) URL.revokeObjectURL(vignette);
    setVignette(null);
    if (choix.current && !f) choix.current.value = "";
    if (!f) return setFichier(null);
    const e = verifierFichier(f, TYPES_DOCUMENTS);
    if (e) {
      setErreur(e);
      setFichier(null);
      if (choix.current) choix.current.value = "";
      return;
    }
    setFichier(f);
    if (IMAGES_AFFICHABLES.includes(f.type)) setVignette(URL.createObjectURL(f));
  };

  const expedier = async (temp: MessageVue, fd: FormData) => {
    enAttente.current.set(temp.id, fd);
    try {
      const r = await envoyerAuConseiller(reference, fd);
      if (r.ok) {
        enAttente.current.delete(temp.id);
        if (temp.piece?.lien.startsWith("blob:")) window.setTimeout(() => URL.revokeObjectURL(temp.piece!.lien), 30_000);
        setMessages((ms) => {
          const sans = ms.filter((m) => m.id !== temp.id && m.id !== r.message.id);
          return [...sans, r.message].sort((a, b) => (a.etat ? 1 : 0) - (b.etat ? 1 : 0) || a.le.localeCompare(b.le));
        });
      } else {
        setMessages((ms) => ms.map((m) => (m.id === temp.id ? { ...m, etat: "echec" } : m)));
        setErreur(r.erreur);
      }
    } catch {
      setMessages((ms) => ms.map((m) => (m.id === temp.id ? { ...m, etat: "echec" } : m)));
      setErreur("Le message n'est pas parti : vérifiez votre connexion, puis réessayez.");
    }
  };

  const envoyer = () => {
    if (lectureSeule) return;
    const t = texte.trim();
    if (!t && !fichier) return;
    if (t.length > LONGUEUR_MAX) return setErreur(`${LONGUEUR_MAX} caractères au plus : coupez votre message en deux.`);
    const fd = new FormData();
    fd.set("message", t);
    if (fichier) fd.set("piece", fichier);
    const temp: MessageVue = {
      id: `envoi-${Date.now()}`,
      auteur: "client",
      nom: "Vous",
      corps: t,
      piece: fichier ? { nom: fichier.name, mime: fichier.type, taille: fichier.size, lien: vignette ?? "", image: !!vignette } : null,
      le: new Date().toISOString(),
      luParClient: null,
      luParEquipe: null,
      etat: "envoi",
    };
    enBas.current = true;
    setMessages((ms) => [...ms, temp]);
    setTexte("");
    // La vignette locale devient celle du message en cours d'envoi : elle n'est rendue qu'une fois le message enregistré.
    choisirFichier(null, { garderVignette: true });
    void expedier(temp, fd);
    saisie.current?.focus();
  };

  const reessayer = (m: MessageVue) => {
    const fd = enAttente.current.get(m.id);
    if (!fd) return;
    setErreur(null);
    setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, etat: "envoi" } : x)));
    void expedier(m, fd);
  };

  const clavier = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      envoyer();
    }
  };

  // --- L'affichage ------------------------------------------------------------------------------------
  const blocs = useMemo(() => enBlocs(messages), [messages]);
  // « Lu » : sous le dernier message du client, quand l'équipe l'a vu.
  const dernierClient = [...messages].reverse().find((m) => m.auteur === "client");
  const initialesConseiller = initialesDe(`${conseiller.prenom} ${conseiller.nom}`);

  return (
    <div className={`fil fil-${variante}`} data-lecture-seule={lectureSeule || undefined}>
      <div className="fil-corps" ref={corps} onScroll={suivreDefilement} role="log" aria-live="polite" aria-label={`Discussion avec ${conseiller.prenom}`}>
        {!charge ? (
          <div className="fil-chargement" aria-hidden>
            <span />
            <span />
            <span />
          </div>
        ) : messages.length === 0 ? (
          <div className="fil-vide">
            <span className="fil-av fil-av-grand">{initialesConseiller}</span>
            <h3>Écrivez à {conseiller.prenom}</h3>
            <p>Une question sur votre dossier, une précision à donner, un document à montrer : votre message arrive directement chez votre conseiller, avec la référence de votre dossier.</p>
            <ul>
              <li>Joignez une photo ou un PDF si besoin.</li>
              <li>Sa réponse s&apos;affiche ici, et vous êtes prévenu par e-mail.</li>
            </ul>
          </div>
        ) : (
          blocs.map((b) =>
            b.type === "jour" ? (
              <p key={b.cle} className="fil-jour">
                <span>{b.libelle}</span>
              </p>
            ) : (
              <div key={b.cle} className="fil-groupe" data-auteur={b.auteur}>
                {b.auteur === "equipe" && <span className="fil-av" title={b.nom}>{initialesDe(b.nom)}</span>}
                <div className="fil-pile">
                  <p className="fil-qui">
                    <b>{b.auteur === "client" ? "Vous" : prenomDe(b.nom)}</b>
                    <time dateTime={b.messages[0].le}>{heureDe(b.messages[0].le)}</time>
                  </p>
                  {b.messages.map((m) => (
                    <Bulle key={m.id} m={m} reessayer={reessayer} onImage={recaler} />
                  ))}
                  {dernierClient && b.messages.includes(dernierClient) && b.messages[b.messages.length - 1] === dernierClient && (
                    <p className="fil-etat" data-etat={dernierClient.etat ?? (dernierClient.luParEquipe ? "lu" : "envoye")}>
                      {dernierClient.etat === "envoi" ? (
                        "Envoi…"
                      ) : dernierClient.etat === "echec" ? (
                        "Non envoyé"
                      ) : dernierClient.luParEquipe ? (
                        <>
                          <Icone nom="vu" /> Lu
                        </>
                      ) : (
                        <>
                          <Icone nom="check" /> Envoyé
                        </>
                      )}
                    </p>
                  )}
                </div>
              </div>
            ),
          )
        )}
        {erreurLecture && charge && <p className="fil-alerte">La discussion ne se met plus à jour : vérifiez votre connexion.</p>}
      </div>

      <form
        className="fil-saisie"
        onSubmit={(e) => {
          e.preventDefault();
          envoyer();
        }}
      >
        {lectureSeule && <p className="fil-note">Aperçu de l&apos;équipe : la discussion se lit, on n&apos;y écrit pas au nom du client.</p>}
        {erreur && (
          <p className="fil-erreur" role="alert">
            {erreur}
          </p>
        )}
        {fichier && (
          <div className="fil-joint">
            {vignette ? (
              // eslint-disable-next-line @next/next/no-img-element -- la photo choisie, encore sur l'appareil (adresse locale blob:)
              <img src={vignette} alt="" />
            ) : (
              <span className="fil-joint-ic">{fichier.type === "application/pdf" ? "PDF" : "IMG"}</span>
            )}
            <span className="fil-joint-nom">
              <b>{fichier.name}</b>
              {tailleLisible(fichier.size)}
            </span>
            <button type="button" aria-label="Retirer la pièce jointe" onClick={() => choisirFichier(null)}>
              <Icone nom="close" />
            </button>
          </div>
        )}
        <div className="fil-ligne">
          <label className="fil-outil" title="Joindre une photo ou un PDF" aria-disabled={lectureSeule || undefined}>
            <Icone nom="trombone" />
            <span className="sr-only">Joindre une photo ou un PDF</span>
            <input
              ref={choix}
              type="file"
              accept="image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf"
              disabled={lectureSeule}
              onChange={(e) => choisirFichier(e.target.files?.[0] ?? null)}
            />
          </label>
          <textarea
            ref={saisie}
            rows={1}
            value={texte}
            maxLength={LONGUEUR_MAX}
            disabled={lectureSeule}
            placeholder={lectureSeule ? "Lecture seule" : `Écrire à ${conseiller.prenom}…`}
            aria-label={`Votre message à ${conseiller.prenom}`}
            onChange={(e) => {
              setTexte(e.target.value);
              if (erreur) setErreur(null);
            }}
            onKeyDown={clavier}
          />
          <button className="fil-envoyer" type="submit" disabled={lectureSeule || (!texte.trim() && !fichier)} aria-label="Envoyer">
            <Icone nom="envoi" />
          </button>
        </div>
        {!lectureSeule && (
          <p className="fil-aide">
            <span className="fil-aide-clavier">Entrée : envoyer · Maj + Entrée : à la ligne · </span>photo ou PDF, 10 Mo
          </p>
        )}
      </form>
    </div>
  );
}

/** Un message : le texte, la pièce jointe (vignette pour une photo), et « Réessayer » s'il n'est pas parti. */
function Bulle({ m, reessayer, onImage }: { m: MessageVue; reessayer: (m: MessageVue) => void; onImage: () => void }) {
  // La vignette garde sa première adresse : relue toutes les douze secondes, elle ne se rechargerait pas pour rien.
  const [src] = useState(m.piece?.lien ?? "");
  return (
    <div className="fil-bulle" data-etat={m.etat}>
      {m.piece &&
        (m.piece.image && src ? (
          <a className="fil-photo" href={m.piece.lien || undefined} target="_blank" rel="noopener noreferrer" aria-label={`Ouvrir ${m.piece.nom}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- une pièce privée, servie par un lien signé de cinq minutes */}
            <img src={src} alt={m.piece.nom} onLoad={onImage} />
          </a>
        ) : (
          <a className="fil-fichier" href={m.piece.lien || undefined} target="_blank" rel="noopener noreferrer">
            <span className="fil-joint-ic">{m.piece.mime === "application/pdf" ? "PDF" : "IMG"}</span>
            <span>
              <b>{m.piece.nom}</b>
              {tailleLisible(m.piece.taille)}
            </span>
          </a>
        ))}
      {m.corps && <p>{m.corps}</p>}
      {m.etat === "echec" && (
        <button type="button" className="fil-reessayer" onClick={() => reessayer(m)}>
          Réessayer
        </button>
      )}
    </div>
  );
}

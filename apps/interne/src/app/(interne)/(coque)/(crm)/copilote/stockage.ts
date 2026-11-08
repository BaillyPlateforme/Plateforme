import { useCallback, useSyncExternalStore } from "react";
import { texteEnCours, type Consultation, type Entite, type Evenement } from "@/crm/copilote/types";

/*
 * Les conversations du Copilote, gardées dans le navigateur (localStorage,
 * une clé par membre de l'équipe) : la conversation en cours survit à la
 * navigation et au rechargement, et les précédentes restent dans
 * l'historique (les 20 dernières). Rien n'est écrit sur le serveur.
 *
 * L'état vit dans ce module, pas dans un composant : une réponse qui
 * s'écrit continue de s'écrire si l'on change de page, et elle est là
 * au retour.
 */

export type MessageUtilisateur = { id: string; role: "utilisateur"; texte: string; le: number };
export type MessageCopilote = {
  id: string;
  role: "copilote";
  texte: string;
  etat: "attente" | "flux" | "fini" | "erreur" | "arrete";
  consultations: Consultation[];
  entites: Record<string, Entite>;
  suites: string[];
  le: number;
  duree?: number;
};
export type Message = MessageUtilisateur | MessageCopilote;
export type Conversation = { id: string; titre: string; cree: number; maj: number; messages: Message[] };
/** `actives` : les conversations dont une réponse s'écrit (pas enregistré). */
export type Etat = { courante: string | null; conversations: Conversation[]; historique: boolean; actives: string[] };

const VIDE: Etat = { courante: null, conversations: [], historique: false, actives: [] };
const GARDER = 20;
const etats = new Map<string, Etat>();
const abonnes = new Set<() => void>();
const enCours = new Map<string, AbortController>();
const sauvegardes = new Map<string, ReturnType<typeof setTimeout>>();

const nouvelId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

function lire(cle: string): Etat {
  const deja = etats.get(cle);
  if (deja) return deja;
  let e: Etat = VIDE;
  try {
    const brut = JSON.parse(localStorage.getItem(cle) ?? "null") as Partial<Etat> | null;
    if (brut && Array.isArray(brut.conversations)) {
      e = {
        courante: typeof brut.courante === "string" ? brut.courante : null,
        historique: false,
        actives: [],
        // Une réponse coupée par un rechargement ne reprendra pas : on le dit.
        conversations: brut.conversations.map((c) => ({
          ...c,
          messages: c.messages.map((m) => (m.role === "copilote" && (m.etat === "attente" || m.etat === "flux") ? { ...m, etat: "arrete" as const } : m)),
        })),
      };
    }
  } catch {
    /* stockage absent ou illisible : on repart de zéro */
  }
  etats.set(cle, e);
  return e;
}

function ecrire(cle: string) {
  const e = etats.get(cle);
  if (!e) return;
  const garder = (conversations: Conversation[]) => JSON.stringify({ courante: e.courante, conversations });
  let liste = e.conversations.filter((c) => c.messages.length > 0).slice(0, GARDER);
  // Plein : on retire les plus anciennes jusqu'à ce que ça tienne.
  while (liste.length) {
    try {
      localStorage.setItem(cle, garder(liste));
      return;
    } catch {
      liste = liste.slice(0, -1);
    }
  }
  try {
    localStorage.removeItem(cle);
  } catch {
    /* rien à faire */
  }
}

/** Enregistre bientôt (pendant un flux, pas à chaque mot), ou tout de suite. */
function sauver(cle: string, tout_de_suite = false) {
  const t = sauvegardes.get(cle);
  if (t) clearTimeout(t);
  if (tout_de_suite) {
    sauvegardes.delete(cle);
    ecrire(cle);
  } else sauvegardes.set(cle, setTimeout(() => (sauvegardes.delete(cle), ecrire(cle)), 600));
}

function modifier(cle: string, f: (e: Etat) => Etat, tout_de_suite = false) {
  etats.set(cle, f(lire(cle)));
  abonnes.forEach((x) => x());
  sauver(cle, tout_de_suite);
}

function changerMessage(cle: string, conv: string, id: string, f: (m: MessageCopilote) => MessageCopilote, tout_de_suite = false) {
  modifier(
    cle,
    (e) => ({
      ...e,
      conversations: e.conversations.map((c) =>
        c.id !== conv ? c : { ...c, maj: Date.now(), messages: c.messages.map((m) => (m.id === id && m.role === "copilote" ? f(m) : m)) },
      ),
    }),
    tout_de_suite,
  );
}

const abonner = (f: () => void) => {
  abonnes.add(f);
  return () => abonnes.delete(f);
};

/** L'état des conversations de ce membre, et ce qu'on peut en faire. */
export function useCopilote(cle: string) {
  const instantane = useCallback(() => lire(cle), [cle]);
  const etat = useSyncExternalStore(abonner, instantane, () => VIDE);
  const conversation = etat.conversations.find((c) => c.id === etat.courante) ?? null;
  return {
    etat,
    conversation,
    occupe: !!conversation && etat.actives.includes(conversation.id),
    envoyer: (question: string) => envoyer(cle, question),
    reessayer: () => reessayer(cle),
    arreter: () => conversation && enCours.get(conversation.id)?.abort(),
    nouvelle: () => modifier(cle, (e) => ({ ...e, courante: null, historique: false }), true),
    ouvrir: (id: string) => modifier(cle, (e) => ({ ...e, courante: id, historique: false }), true),
    supprimer: (id: string) =>
      modifier(cle, (e) => ({ ...e, courante: e.courante === id ? null : e.courante, conversations: e.conversations.filter((c) => c.id !== id) }), true),
    toutEffacer: () => modifier(cle, (e) => ({ ...e, courante: e.courante && enCours.has(e.courante) ? e.courante : null, conversations: e.conversations.filter((c) => enCours.has(c.id)) }), true),
    historique: (ouvert?: boolean) => modifier(cle, (e) => ({ ...e, historique: ouvert ?? !e.historique })),
  };
}

/** Pose une question dans la conversation en cours (ou en ouvre une), et lit la réponse en flux. */
async function envoyer(cle: string, question: string) {
  const q = question.trim();
  if (!q) return;
  let e = lire(cle);
  let conv = e.conversations.find((c) => c.id === e.courante);
  if (conv && enCours.has(conv.id)) return;
  const maintenant = Date.now();
  if (!conv) {
    conv = { id: nouvelId(), titre: q.length > 80 ? `${q.slice(0, 78)}…` : q, cree: maintenant, maj: maintenant, messages: [] };
    const nouvelle = conv;
    modifier(cle, (x) => ({ ...x, courante: nouvelle.id, historique: false, conversations: [nouvelle, ...x.conversations] }));
    e = lire(cle);
  }
  const convId = conv.id;
  const reponse: MessageCopilote = { id: nouvelId(), role: "copilote", texte: "", etat: "attente", consultations: [], entites: {}, suites: [], le: maintenant };
  modifier(cle, (x) => ({
    ...x,
    // La conversation remonte en tête de l'historique.
    conversations: [
      ...x.conversations.filter((c) => c.id === convId).map((c) => ({ ...c, maj: maintenant, messages: [...c.messages, { id: nouvelId(), role: "utilisateur" as const, texte: q, le: maintenant }, reponse] })),
      ...x.conversations.filter((c) => c.id !== convId),
    ],
  }));
  await lancer(cle, convId, reponse.id);
}

/** Repose la dernière question, quand la réponse a échoué ou a été arrêtée. */
async function reessayer(cle: string) {
  const e = lire(cle);
  const conv = e.conversations.find((c) => c.id === e.courante);
  const dernier = conv?.messages[conv.messages.length - 1];
  if (!conv || !dernier || dernier.role !== "copilote" || enCours.has(conv.id)) return;
  changerMessage(cle, conv.id, dernier.id, (m) => ({ ...m, texte: "", etat: "attente", consultations: [], entites: {}, suites: [], le: Date.now(), duree: undefined }));
  await lancer(cle, conv.id, dernier.id);
}

async function lancer(cle: string, convId: string, reponseId: string) {
  const conv = lire(cle).conversations.find((c) => c.id === convId);
  if (!conv) return;
  // Ce que le modèle relit : les questions, et les réponses abouties.
  const historique = conv.messages
    .filter((m) => m.id !== reponseId && (m.role === "utilisateur" || (m.etat === "fini" && m.texte)))
    .map((m) => ({ role: m.role, texte: m.texte }));
  const debut = Date.now();
  const arret = new AbortController();
  enCours.set(convId, arret);
  modifier(cle, (e) => ({ ...e, actives: [...e.actives, convId] }));
  const maj = (f: (m: MessageCopilote) => MessageCopilote, tout_de_suite = false) => changerMessage(cle, convId, reponseId, f, tout_de_suite);

  try {
    const r = await fetch("/api/copilote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: historique }),
      signal: arret.signal,
    });
    if (!r.ok || !r.body) {
      const d = (await r.json().catch(() => ({}))) as { erreur?: string };
      maj((m) => ({ ...m, etat: "erreur", texte: d.erreur ?? "Le Copilote n'a pas pu répondre." }), true);
      return;
    }
    const lecteur = r.body.getReader();
    const decodeur = new TextDecoder();
    let reste = "";
    let fini = false;
    for (;;) {
      const { value, done } = await lecteur.read();
      if (done) break;
      reste += decodeur.decode(value, { stream: true });
      const lignes = reste.split("\n");
      reste = lignes.pop() ?? "";
      for (const ligne of lignes) {
        if (!ligne.trim()) continue;
        let ev: Evenement;
        try {
          ev = JSON.parse(ligne) as Evenement;
        } catch {
          continue;
        }
        if (ev.t === "fin" || ev.t === "erreur") fini = true;
        appliquer(ev, maj, debut);
      }
    }
    if (!fini) maj((m) => ({ ...m, etat: m.texte ? "arrete" : "erreur", texte: m.texte || "La réponse a été interrompue." }), true);
  } catch {
    if (arret.signal.aborted) maj((m) => ({ ...m, etat: "arrete", texte: texteEnCours(m.texte).trim(), duree: Date.now() - debut }), true);
    else maj((m) => ({ ...m, etat: "erreur", texte: "Connexion perdue. Réessayez." }), true);
  } finally {
    enCours.delete(convId);
    modifier(cle, (e) => ({ ...e, actives: e.actives.filter((x) => x !== convId) }), true);
  }
}

function appliquer(ev: Evenement, maj: (f: (m: MessageCopilote) => MessageCopilote, tout_de_suite?: boolean) => void, debut: number) {
  switch (ev.t) {
    case "outil":
      maj((m) => ({ ...m, consultations: [...m.consultations, { id: ev.id, outil: ev.outil, libelle: ev.libelle, fini: false }] }));
      break;
    case "resultat":
      maj((m) => ({
        ...m,
        entites: { ...m.entites, ...Object.fromEntries(ev.entites.map((x) => [x.cle, x])) },
        consultations: m.consultations.map((c) => (c.id === ev.id ? { ...c, fini: true, n: ev.n, cles: ev.entites.map((x) => x.cle), erreur: ev.erreur } : c)),
      }));
      break;
    case "texte":
      maj((m) => ({ ...m, etat: "flux", texte: m.texte + ev.d }));
      break;
    case "efface":
      maj((m) => ({ ...m, etat: "attente", texte: "" }));
      break;
    case "fin":
      maj((m) => ({ ...m, etat: "fini", texte: ev.texte, suites: ev.suites, duree: Date.now() - debut }), true);
      break;
    case "erreur":
      maj((m) => ({ ...m, etat: "erreur", texte: ev.message, duree: Date.now() - debut }), true);
      break;
  }
}

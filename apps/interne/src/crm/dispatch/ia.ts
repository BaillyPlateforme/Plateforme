import "server-only";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { env } from "@/lib/env";
import { finaliser } from "./proposition";
import type { Contexte } from "./regroupement";
import type { ContenuProposition } from "./types";

/*
 * La proposition de regroupement par l'IA (Gemini, comme l'analyse de volume
 * des photos : même clé GEMINI_API_KEY, même modèle GEMINI_MODEL — seuls les
 * modèles 3.x répondent sur le compte de Bailly).
 *
 * L'IA reçoit les clients, les colonnes qu'elle peut remplir et les consignes
 * du dispatcheur ; elle rend un JSON imposé. Sa réponse passe ensuite par
 * finaliser() : identifiants vérifiés, doublons écartés, dépassements
 * recalculés. Toute panne (pas de clé, délai dépassé, réponse illisible) est
 * levée avec une raison lisible : l'appelant bascule alors sur les règles
 * simples et le dit à l'écran.
 *
 * DISPATCH_IA=off coupe l'IA du dispatch sans toucher au reste (essais,
 * démonstration sans réseau).
 */

/** Le temps laissé à l'IA avant de basculer sur les règles simples. */
export const DELAI_IA_MS = 90_000;

export function etatIa(): { disponible: boolean; modele: string; raison: string | null } {
  const modele = env.geminiModel();
  if (process.env.DISPATCH_IA === "off") return { disponible: false, modele, raison: "elle est désactivée sur ce serveur (DISPATCH_IA=off)" };
  if (!process.env.GEMINI_API_KEY) return { disponible: false, modele, raison: "la clé GEMINI_API_KEY est absente" };
  return { disponible: true, modele, raison: null };
}

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    resume: { type: Type.STRING, description: "Deux ou trois phrases pour le dispatcheur : la logique retenue et ce qu'il doit vérifier." },
    colonnes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          ref: { type: Type.STRING, description: "« c<id> » pour une colonne existante, « n1 », « n2 »… pour une colonne à créer." },
          libelle: { type: Type.STRING, description: "Nom court d'une colonne à créer, ex. « Martinique 2 · 40 pieds »." },
          genre: { type: Type.STRING, format: "enum", enum: ["conteneur", "tournee"] },
          taille: { type: Type.STRING, format: "enum", enum: ["20", "40", "aucune"], description: "Taille d'un conteneur à créer ; « aucune » pour une tournée." },
          zone: { type: Type.STRING, description: "La destination servie (pays ou territoire)." },
          lignes: { type: Type.ARRAY, items: { type: Type.INTEGER }, description: "Identifiants des clients, dans l'ordre de livraison." },
          raison: { type: Type.STRING, description: "Une phrase qui justifie ce regroupement." },
        },
        required: ["ref", "lignes", "raison"],
      },
    },
    non_affectees: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { ligne: { type: Type.INTEGER }, raison: { type: Type.STRING } },
        required: ["ligne", "raison"],
      },
    },
    alertes: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Points d'attention : contrainte impossible, remarque à vérifier, capacité tendue." },
  },
  required: ["resume", "colonnes", "non_affectees", "alertes"],
};

function consigne(ctx: Contexte) {
  const p = ctx.parametres;
  const quoi = p.mode === "conteneur" ? "conteneurs maritimes" : "tournées de livraison";
  return `Tu es dispatcheur chez Bailly Déménagement, déménageur français qui expédie les biens de ses clients par conteneurs maritimes, en groupage : plusieurs clients partagent un conteneur, puis sont livrés en tournées à destination.

Ta tâche : proposer un regroupement des clients en ${quoi}. Le dispatcheur relira ta proposition et la modifiera : tu proposes, il décide.

Règles impératives :
1. Une colonne ne sert qu'une seule destination : un même pays ou territoire, desservi par le même port d'arrivée. Ne mélange jamais deux territoires différents (par exemple Martinique et Guadeloupe) dans une même colonne.
2. Ne dépasse jamais la capacité d'une colonne : le volume déjà chargé plus la somme des volumes que tu y places doit rester inférieur ou égal à sa capacité. Une colonne sans capacité n'a pas de limite.
3. Chaque client apparaît au plus une fois, dans une colonne ou dans non_affectees. N'utilise que les identifiants fournis.
4. ${p.garderColonnes ? "Utilise d'abord les colonnes existantes (référence « c<id> ») quand leur zone et leur taille conviennent ; une colonne existante sans zone peut servir n'importe quelle destination." : "N'utilise pas les colonnes existantes."}
5. ${
    p.nouvellesColonnes
      ? `Tu peux créer des colonnes (références « n1 », « n2 »…) quand c'est nécessaire${p.mode === "conteneur" ? `, de la plus petite taille qui convient : 20 pieds = ${p.capacite20} m³, 40 pieds = ${p.capacite40} m³` : p.capaciteTournee ? `, de ${p.capaciteTournee} m³ au plus chacune` : ""}.`
      : "Tu ne peux pas créer de colonne : un client qui ne tient nulle part va dans non_affectees, avec la raison."
  }
6. Cherche le moins de ${p.mode === "conteneur" ? "conteneurs" : "tournées"} possible, bien remplis, et garde ensemble les clients d'une même ville ou de villes voisines.
7. Lis les remarques des clients et les contraintes du dispatcheur. Respecte-les quand c'est possible ; signale dans « alertes » celles que tu ne peux pas tenir ou qui demandent une vérification humaine. N'invente aucune information.
8. Dans chaque colonne, range les clients dans un ordre de livraison logique (par ville, villes voisines à la suite).

Réponds en français, au format JSON demandé. Les identifiants ne servent que dans « lignes » et « ligne » : dans les textes (resume, raison, alertes), désigne toujours un client par son nom, jamais par son numéro, et une colonne existante par son libellé, jamais par sa référence.`;
}

function donnees(ctx: Contexte) {
  const p = ctx.parametres;
  const charge = new Map<number, number>();
  for (const l of ctx.restantes) if (l.colonneId != null) charge.set(l.colonneId, (charge.get(l.colonneId) ?? 0) + l.volume);
  return JSON.stringify(
    {
      regroupement: p.mode === "conteneur" ? "conteneurs" : "tournées",
      capacites_m3: p.mode === "conteneur" ? { "20 pieds": p.capacite20, "40 pieds": p.capacite40 } : { tournee: p.capaciteTournee ?? "sans limite" },
      colonnes_existantes: p.garderColonnes
        ? ctx.colonnes.map((c) => ({
            ref: `c${c.id}`,
            genre: c.genre,
            libelle: c.libelle,
            taille: c.taille ? `${c.taille} pieds` : null,
            capacite_m3: c.capacite,
            zone: c.zone,
            deja_charge_m3: Math.round((charge.get(c.id) ?? 0) * 100) / 100,
          }))
        : [],
      clients: ctx.lignes.map((l) => ({ id: l.id, client: l.client, ville: l.ville, pays: l.pays, volume_m3: l.volume, remarques: l.remarques || undefined })),
      contraintes_du_dispatcheur: p.contraintes.trim() || "aucune",
    },
    null,
    1,
  );
}

/** L'erreur de Google (souvent un JSON brut) dite en une phrase, pour l'écran et l'historique. */
function raisonLisible(m: string, modele: string) {
  if (/API key not valid|API_KEY_INVALID|UNAUTHENTICATED|PERMISSION_DENIED/i.test(m)) return "la clé GEMINI_API_KEY est refusée par Google";
  if (/\b404\b|not found|no longer available/i.test(m)) return `le modèle ${modele} n'est pas disponible sur ce compte`;
  if (/\b429\b|RESOURCE_EXHAUSTED|quota/i.test(m)) return "le quota de l'IA est dépassé";
  if (/\b50[0-4]\b|UNAVAILABLE|overloaded|INTERNAL/i.test(m)) return "le service de l'IA est momentanément indisponible";
  if (/fetch failed|ENOTFOUND|ECONN|ETIMEDOUT|network/i.test(m)) return "le service de l'IA est injoignable (réseau)";
  return `erreur de l'IA (${m.replace(/\s+/g, " ").slice(0, 120)})`;
}

let client: GoogleGenAI | null = null;

/** Demande la proposition à Gemini. Lève une Error au message lisible si quoi que ce soit échoue. */
export async function proposerParIa(ctx: Contexte): Promise<{ contenu: ContenuProposition; modele: string }> {
  const etat = etatIa();
  if (!etat.disponible) throw new Error(etat.raison ?? "elle est indisponible");
  client ??= new GoogleGenAI({ apiKey: env.geminiApiKey() });

  const arret = new AbortController();
  const minuterie = setTimeout(() => arret.abort(), DELAI_IA_MS);
  let texte: string | undefined;
  try {
    const r = await client.models.generateContent({
      model: etat.modele,
      contents: [{ role: "user", parts: [{ text: donnees(ctx) }] }],
      config: {
        systemInstruction: consigne(ctx),
        responseMimeType: "application/json",
        responseSchema: SCHEMA,
        temperature: 0.2,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        abortSignal: arret.signal,
      },
    });
    texte = r.text;
  } catch (e) {
    if (arret.signal.aborted) throw new Error(`pas de réponse en ${DELAI_IA_MS / 1000} secondes`);
    throw new Error(raisonLisible(e instanceof Error ? e.message : String(e), etat.modele));
  } finally {
    clearTimeout(minuterie);
  }
  if (!texte) throw new Error("réponse vide");
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    throw new Error("réponse illisible (JSON invalide)");
  }
  const contenu = finaliser(brut, ctx);
  if (contenu.colonnes.every((c) => c.lignes.length === 0) && ctx.lignes.length > 0) throw new Error("aucun client placé dans sa réponse");
  return { contenu, modele: etat.modele };
}

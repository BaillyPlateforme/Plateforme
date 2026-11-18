import "server-only";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { env } from "@/lib/env";
import { lireReponseEstimation, type LectureEstimation } from "./commun";

/*
 * Le volume d'une moto ou d'une voiture, estimé par l'IA (Céline, 17/11/2026 :
 * « Volume du véhicule (le calcul par l'IA est-il possible ?) »).
 *
 * Gemini, comme l'analyse des photos et le dispatch : même clé GEMINI_API_KEY,
 * même modèle GEMINI_MODEL (seuls les modèles 3.x répondent sur le compte de
 * Bailly). On lui demande les dimensions extérieures usuelles du modèle —
 * longueur, largeur hors rétroviseurs, hauteur —, jamais un volume : le
 * volume est calculé ici (longueur × largeur × hauteur, au dixième de m³), et
 * les dimensions retenues s'affichent à côté, avec la mention qu'il s'agit
 * d'une estimation. Une réponse sans véhicule reconnu, ou aux dimensions hors
 * des bornes d'une moto ou d'une voiture, n'est pas exploitable : l'équipe
 * saisit le volume à la main.
 *
 * Appelée seulement par l'action serveur estimerVolumeVehicule (actions.ts),
 * qui vérifie la session et tient les plafonds.
 */

/** Le temps laissé à l'IA : au-delà, l'équipe saisit le volume à la main. */
export const DELAI_ESTIMATION_MS = 25_000;

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reconnu: { type: Type.BOOLEAN, description: "Vrai si la marque et le modèle désignent un véhicule réel que tu connais." },
    version: { type: Type.STRING, description: "Le véhicule retenu, en quelques mots (génération, carrosserie), ex. « Peugeot 308 III berline (2021-) »." },
    longueur_m: { type: Type.NUMBER, description: "Longueur hors tout, en mètres." },
    largeur_m: { type: Type.NUMBER, description: "Largeur hors rétroviseurs, en mètres." },
    hauteur_m: { type: Type.NUMBER, description: "Hauteur à vide, en mètres." },
  },
  required: ["reconnu", "longueur_m", "largeur_m", "hauteur_m"],
};

const CONSIGNE = `Tu aides un déménageur français à préparer le transport d'un véhicule (moto ou voiture) par bateau ou par camion.
On te donne le genre, la marque, le modèle et parfois la motorisation. Donne les dimensions extérieures usuelles du constructeur pour ce modèle : longueur hors tout, largeur hors rétroviseurs, hauteur, en mètres.
Si plusieurs générations ou carrosseries existent, retiens la plus courante aujourd'hui et nomme-la dans « version ».
Si la marque ou le modèle ne désignent pas un véhicule réel que tu connais, réponds reconnu = false et 0 pour les dimensions. N'invente jamais de dimensions.`;

/** L'erreur de Google dite en une phrase (comme le dispatch, crm/dispatch/ia.ts). */
function raisonLisible(m: string, modele: string) {
  if (/API key not valid|API_KEY_INVALID|UNAUTHENTICATED|PERMISSION_DENIED/i.test(m)) return "la clé de l’IA est refusée";
  if (/\b404\b|not found|no longer available/i.test(m)) return `le modèle ${modele} n’est pas disponible`;
  if (/\b429\b|RESOURCE_EXHAUSTED|quota/i.test(m)) return "le quota de l’IA est dépassé";
  if (/\b50[0-4]\b|UNAVAILABLE|overloaded|INTERNAL/i.test(m)) return "l’IA est momentanément indisponible";
  if (/fetch failed|ENOTFOUND|ECONN|ETIMEDOUT|network/i.test(m)) return "l’IA est injoignable (réseau)";
  return "l’IA n’a pas répondu";
}

let client: GoogleGenAI | null = null;

/** Demande les dimensions à Gemini et les relit. Ne lève jamais : une panne devient une raison lisible. */
export async function estimerParIa(e: { genre: "moto" | "voiture"; marque: string; modele: string; motorisation: string | null }): Promise<LectureEstimation & { modele_ia: string }> {
  const modele = env.geminiModel();
  if (!process.env.GEMINI_API_KEY) return { ok: false, raison: "l’IA n’est pas configurée sur ce serveur", modele_ia: modele };
  client ??= new GoogleGenAI({ apiKey: env.geminiApiKey() });
  const arret = new AbortController();
  const minuterie = setTimeout(() => arret.abort(), DELAI_ESTIMATION_MS);
  try {
    const r = await client.models.generateContent({
      model: modele,
      contents: [{ role: "user", parts: [{ text: JSON.stringify({ genre: e.genre, marque: e.marque, modele: e.modele, motorisation: e.motorisation ?? "non précisée" }) }] }],
      config: {
        systemInstruction: CONSIGNE,
        responseMimeType: "application/json",
        responseSchema: SCHEMA,
        temperature: 0,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        abortSignal: arret.signal,
      },
    });
    let brut: unknown = null;
    try {
      brut = JSON.parse(r.text ?? "");
    } catch {
      return { ok: false, raison: "réponse illisible", modele_ia: modele };
    }
    return { ...lireReponseEstimation(brut, e.genre), modele_ia: modele };
  } catch (err) {
    if (arret.signal.aborted) return { ok: false, raison: `pas de réponse en ${DELAI_ESTIMATION_MS / 1000} secondes`, modele_ia: modele };
    console.error("[cimob] estimation du volume d'un véhicule :", err instanceof Error ? err.message.slice(0, 300) : err);
    return { ok: false, raison: raisonLisible(err instanceof Error ? err.message : String(err), modele), modele_ia: modele };
  } finally {
    clearTimeout(minuterie);
  }
}

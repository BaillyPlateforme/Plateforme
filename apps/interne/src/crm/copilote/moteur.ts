import "server-only";
import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { DECLARATIONS, executer } from "./outils";

/*
 * Le moteur du Copilote : une conversation avec Gemini, qui appelle les outils
 * de lecture du CRM (outils.ts) autant que nécessaire — six tours au plus —
 * puis répond. Modèle rapide par défaut (COPILOTE_MODEL pour en changer ;
 * seuls les modèles 3.x répondent sur ce compte).
 */

export type Message = { role: "utilisateur" | "copilote"; texte: string };

const MODELE = () => process.env.COPILOTE_MODEL ?? "gemini-3-flash-preview";
const TOURS_MAX = 6;
let client: GoogleGenAI | null = null;

function consigne(prenom: string) {
  const aujourdhui = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
  return `Tu es le Copilote du CRM de Bailly Déménagement. Tu aides ${prenom}, de l'équipe Bailly, à retrouver et comprendre ce qui se passe dans l'agence.
Nous sommes le ${aujourdhui} (heure de Paris).
Règles :
- Tu réponds en français, de façon brève et concrète (quelques lignes, listes courtes).
- Tu t'appuies UNIQUEMENT sur les outils : n'invente jamais un client, une référence, un chiffre, une date ou un statut. Ne cite une référence BD-… ou un identifiant que s'il figure tel quel dans le résultat d'un outil ; sinon, cite le nom du client sans lien. Si l'information manque, dis-le simplement.
- Tu es en lecture seule : tu ne peux rien créer, modifier ni envoyer. Si on te le demande, explique où le faire dans le CRM.
- Pour citer un dossier, écris un lien Markdown vers sa fiche : [BD-2026-0418 · Quentin Dupuis](/dossiers/12) (l'identifiant numérique, pas la référence, dans l'adresse). Pour une demande du site : [Nom](/dashboard/<id>).
- Montants en euros avec espaces (3 640 €), dates en français (lundi 9 novembre).
- Pas de titres Markdown ; du gras avec **…** si utile.`;
}

/** Répond à la conversation ; renvoie le texte et les outils appelés. */
export async function repondre(historique: Message[], prenom: string): Promise<{ texte: string; outils: string[] }> {
  if (!process.env.GEMINI_API_KEY) throw new Error("Le Copilote n'est pas configuré (clé GEMINI_API_KEY absente).");
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const contents: Content[] = historique.map((m) => ({ role: m.role === "utilisateur" ? "user" : "model", parts: [{ text: m.texte }] }));
  const outils: string[] = [];

  for (let tour = 0; tour < TOURS_MAX; tour++) {
    const r = await client.models.generateContent({
      model: MODELE(),
      contents,
      config: { systemInstruction: consigne(prenom), tools: [{ functionDeclarations: DECLARATIONS }], temperature: 0.2 },
    });
    const appels = r.functionCalls ?? [];
    if (appels.length === 0) return { texte: (r.text ?? "").trim() || "Je n'ai pas de réponse à proposer.", outils };

    // Le tour du modèle tel quel (il porte ses appels), puis les réponses des outils.
    const tourModele = r.candidates?.[0]?.content;
    if (tourModele) contents.push(tourModele);
    const reponses: Part[] = [];
    for (const appel of appels) {
      const nom = appel.name ?? "";
      outils.push(nom);
      let resultat: unknown;
      try {
        resultat = await executer(nom, (appel.args ?? {}) as Record<string, unknown>);
      } catch (e) {
        resultat = { erreur: e instanceof Error ? e.message : "Lecture impossible" };
      }
      // Borne la taille rendue au modèle.
      const json = JSON.stringify(resultat ?? null);
      reponses.push({ functionResponse: { id: appel.id, name: nom, response: { resultat: json.length > 24_000 ? "Résultat trop long : demander quelque chose de plus précis." : resultat } } });
    }
    contents.push({ role: "user", parts: reponses });
  }
  return { texte: "Je n'ai pas réussi à conclure en quelques étapes. Reformulez la question, plus précise.", outils };
}

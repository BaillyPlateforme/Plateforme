import "server-only";
import { GoogleGenAI, type Content, type FunctionCall, type Part } from "@google/genai";
import { DECLARATIONS, executer, libelleAppel } from "./outils";
import { separerSuites, type Evenement } from "./types";

/*
 * Le moteur du Copilote : une conversation avec Gemini, en flux. Le modèle
 * appelle les outils de lecture du CRM (outils.ts) autant que nécessaire —
 * six tours au plus — puis répond ; la réponse arrive mot à mot.
 *
 * Chaque étape part vers la page au moment où elle se produit (`emettre`) :
 * l'outil consulté, ce qu'il a trouvé (en cartes), le texte qui s'écrit, puis
 * la réponse nettoyée et ses questions suivantes. Modèle rapide par défaut
 * (COPILOTE_MODEL pour en changer ; seuls les modèles 3.x répondent sur ce
 * compte). Le tour du modèle est renvoyé tel quel, avec ses signatures de
 * pensée, comme Gemini 3 l'exige après un appel d'outil.
 */

export type Message = { role: "utilisateur" | "copilote"; texte: string };

const MODELE = () => process.env.COPILOTE_MODEL ?? "gemini-3-flash-preview";
const TOURS_MAX = 6;
let client: GoogleGenAI | null = null;

function consigne(prenom: string) {
  const aujourdhui = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
  return `Tu es le Copilote du CRM de Bailly Déménagement. Tu aides ${prenom}, de l'équipe Bailly, à retrouver et comprendre ce qui se passe dans l'agence.
Nous sommes le ${aujourdhui} (heure de Paris).

Le fond :
- Tu t'appuies UNIQUEMENT sur les résultats des outils. N'invente jamais un client, une référence, un montant, une date ni un statut. Si l'information manque, dis-le en une phrase.
- Tu es en lecture seule : tu ne peux rien créer, modifier ni envoyer. Si on te le demande, dis où le faire dans le CRM (Parcours, Devis, Planning, Factures, Relances).
- Sur un client ou un dossier : cherche-le (chercher_dossiers), puis lis sa fiche (dossier) si l'on veut savoir où il en est.

La forme (le CRM met ta réponse en page) :
- En français, bref et concret. La première phrase répond directement (le nombre, le chiffre clé, la conclusion). Pas de « Voici », pas de formule de politesse.
- Chaque élément renvoyé par un outil porte une clé (champ "cle" : dossier:12, devis:345, rdv:88, demande:<identifiant>, chiffre:ca…). Pour montrer un élément, écris sa clé entre doubles crochets, SEULE sur sa ligne : [[dossier:12]]. Le CRM affiche alors une carte complète (client, trajet, étape, montant, prochaine étape, lien vers la fiche) : ne recopie pas ces détails dans ton texte. Plusieurs éléments : une clé par ligne, à la suite, dans l'ordre le plus utile.
- Les cartes se rangent d'elles-mêmes (l'agenda par jour, les devis en liste) : pas d'intertitre ni de phrase avant chaque groupe ; toutes les clés d'une même liste à la suite.
- Dans une phrase, une clé devient un lien court qui porte déjà le nom : écris-la À LA PLACE du nom (« [[devis:345]] est le plus ancien »), jamais « Julien Roussel [[devis:345]] ».
- N'utilise que des clés présentes dans les résultats des outils. Jamais de lien Markdown ni d'adresse de page.
- Pour des chiffres, montre la clé chiffre:… qui répond, puis commente en une ou deux phrases (écart, tendance, ce qui ressort).
- Après les cartes, une ou deux phrases au plus pour ce qui mérite l'attention (le plus urgent, le plus gros montant, un trou dans l'agenda).
- Markdown simple : **gras**, listes courtes, « ### » pour un intertitre si la réponse a plusieurs parties, un tableau seulement pour comparer.
- Montants en euros avec espaces (3 640 €), dates en français (lundi 9 novembre).
- Termine TOUJOURS par une dernière ligne de la forme [[suites: Question 1 | Question 2 | Question 3]] : trois questions courtes (moins de 60 caractères), commençant par une majuscule, que ${prenom} pourrait poser ensuite sur ce qu'il vient de voir, et auxquelles tes outils savent répondre.`;
}

/**
 * Répond à la conversation, en flux : chaque événement part par `emettre`.
 * Renvoie quand la réponse est finie (ou arrêtée par `signal`).
 */
export async function repondreEnFlux(historique: Message[], prenom: string, emettre: (e: Evenement) => void, signal?: AbortSignal): Promise<void> {
  if (!process.env.GEMINI_API_KEY) throw new Error("Le Copilote n'est pas configuré (clé GEMINI_API_KEY absente).");
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const contents: Content[] = historique.map((m) => ({ role: m.role === "utilisateur" ? "user" : "model", parts: [{ text: m.texte }] }));
  let n = 0;

  for (let tour = 0; tour < TOURS_MAX; tour++) {
    const flux = await client.models.generateContentStream({
      model: MODELE(),
      contents,
      config: { systemInstruction: consigne(prenom), tools: [{ functionDeclarations: DECLARATIONS }], temperature: 0.2, abortSignal: signal },
    });

    // Le tour du modèle, gardé partie par partie (signatures comprises).
    const parties: Part[] = [];
    const appels: FunctionCall[] = [];
    let ecrit = "";
    for await (const morceau of flux) {
      if (signal?.aborted) return;
      for (const p of morceau.candidates?.[0]?.content?.parts ?? []) {
        parties.push(p);
        if (p.functionCall) appels.push(p.functionCall);
        else if (p.text && !p.thought) {
          ecrit += p.text;
          emettre({ t: "texte", d: p.text });
        }
      }
    }

    if (appels.length === 0) {
      const { texte, suites } = separerSuites(ecrit);
      emettre({ t: "fin", texte: texte || "Je n'ai pas de réponse à proposer.", suites });
      return;
    }

    // Du texte avant un appel d'outil n'était qu'un préambule : la réponse viendra après.
    if (ecrit.trim()) emettre({ t: "efface" });
    contents.push({ role: "model", parts: parties });

    const reponses: Part[] = [];
    for (const appel of appels) {
      const nom = appel.name ?? "";
      const args = (appel.args ?? {}) as Record<string, unknown>;
      const id = `o${++n}`;
      emettre({ t: "outil", id, outil: nom, libelle: libelleAppel(nom, args) });
      let modele: unknown;
      try {
        const r = await executer(nom, args);
        modele = r.modele;
        emettre({ t: "resultat", id, n: r.entites.length, entites: r.entites });
      } catch (e) {
        console.error(`Copilote, outil ${nom} :`, e);
        modele = { erreur: e instanceof Error ? e.message : "Lecture impossible" };
        emettre({ t: "resultat", id, n: 0, entites: [], erreur: true });
      }
      // Borne la taille rendue au modèle.
      const json = JSON.stringify(modele ?? null);
      reponses.push({
        functionResponse: { id: appel.id, name: nom, response: { resultat: json.length > 24_000 ? "Résultat trop long : demander quelque chose de plus précis." : modele } },
      });
    }
    contents.push({ role: "user", parts: reponses });
  }
  emettre({ t: "fin", texte: "Je n'ai pas réussi à conclure en quelques étapes. Reformulez la question, plus précise.", suites: [] });
}

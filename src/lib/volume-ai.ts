import "server-only";
import { GoogleGenAI, Type } from "@google/genai";
import { env } from "@/lib/env";
import { photoAnalysisSchema, type PhotoAnalysisInput } from "@/lib/schemas";

// Modèle vision, configurable via GEMINI_MODEL (défaut : gemini-3.1-pro-preview).
// Les modèles Gemini 2.5 ne sont plus accessibles aux nouveaux projets.

const SYSTEM = `Tu es un métreur expert pour une entreprise de déménagement française.
À partir d'UNE photo d'une pièce, tu identifies le mobilier et les objets volumineux
à déménager, et tu estimes le VOLUME DE DÉMÉNAGEMENT en m³ (volume que prend l'objet
dans le camion, emballé, pas son volume géométrique brut).

Repères indicatifs de volume déménagement :
- Carton standard : 0,1 m³
- Chaise : 0,15 m³ · Table de chevet : 0,2 m³
- Fauteuil : 0,5 m³ · Canapé 2 places : 1 m³ · Canapé 3 places : 1,5 m³
- Table à manger : 0,8 m³ · Buffet / commode : 0,8 m³
- Lit double (avec matelas) : 1,5 m³ · Armoire 2 portes : 1,2 m³ · 3 portes : 1,8 m³
- Réfrigérateur : 0,7 m³ · Lave-linge : 0,6 m³ · Télévision : 0,2 m³
- Bibliothèque : 0,9 m³ · Bureau : 0,6 m³

Règles :
- Ne compte QUE ce qui est visible et qui serait effectivement déménagé.
- N'invente pas d'objets hors du champ de la photo.
- Estime des quantités réalistes (ex : "4 chaises" si tu en vois 4).
- Le volume_m3 de chaque ligne = volume unitaire × quantité.
- Le volume_m3 global de la photo = somme des lignes.
- Sois prudent : en cas de doute sur un objet partiellement visible, estime bas.`;

// Schéma de sortie structurée imposé à Gemini.
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    piece: {
      type: Type.STRING,
      description: "Type de pièce identifié (ex : Salon, Chambre, Cuisine).",
    },
    objets: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING, description: "Nom de l'objet/meuble." },
          quantite: { type: Type.INTEGER },
          volume_m3: {
            type: Type.NUMBER,
            description: "Volume total pour cette ligne (unitaire × quantité).",
          },
        },
        required: ["label", "quantite", "volume_m3"],
      },
    },
    volume_m3: {
      type: Type.NUMBER,
      description: "Volume total estimé de la photo (somme des lignes).",
    },
  },
  required: ["piece", "objets", "volume_m3"],
};

let client: GoogleGenAI | null = null;
function getClient() {
  if (!client) client = new GoogleGenAI({ apiKey: env.geminiApiKey() });
  return client;
}

function normalizeMimeType(mime: string): string {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
  return allowed.includes(mime) ? mime : "image/jpeg";
}

// Analyse UNE photo et retourne l'objet structuré validé.
export async function analyzePhoto(
  base64: string,
  mimeType: string,
): Promise<PhotoAnalysisInput> {
  const response = await getClient().models.generateContent({
    model: env.geminiModel(),
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: normalizeMimeType(mimeType), data: base64 } },
          { text: "Analyse cette pièce et estime le volume de déménagement." },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini n'a pas renvoyé d'analyse.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Réponse Gemini non-JSON.");
  }

  // Zod garantit la forme finale même si le modèle dévie légèrement.
  return photoAnalysisSchema.parse(parsed);
}

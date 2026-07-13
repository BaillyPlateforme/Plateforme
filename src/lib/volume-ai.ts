import "server-only";
import { GoogleGenAI, Type } from "@google/genai";
import { env } from "@/lib/env";
import { photoAnalysisSchema, type PhotoAnalysisInput } from "@/lib/schemas";
import { buildSystemPrompt, type AiConfig } from "@/lib/ai-config";

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

// Analyse UNE photo selon la configuration (prompt, volumes, modèle, température).
export async function analyzePhoto(
  base64: string,
  mimeType: string,
  cfg: AiConfig,
): Promise<PhotoAnalysisInput> {
  const response = await getClient().models.generateContent({
    model: cfg.model || env.geminiModel(),
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: normalizeMimeType(mimeType), data: base64 } },
          { text: cfg.user_instruction },
        ],
      },
    ],
    config: {
      systemInstruction: buildSystemPrompt(cfg),
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: cfg.temperature,
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

  return photoAnalysisSchema.parse(parsed);
}

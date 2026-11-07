import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

export interface VolumeRef {
  label: string;
  volume: number;
}

export interface AiConfig {
  model: string;
  temperature: number;
  prompt_avant: string;
  prompt_apres: string;
  user_instruction: string;
  volume_references: VolumeRef[];
}

// Valeurs par défaut = comportement historique (avant externalisation).
export const DEFAULT_AI_CONFIG: AiConfig = {
  model: "gemini-3.1-pro-preview",
  temperature: 0.2,
  prompt_avant: `Tu es un métreur expert pour une entreprise de déménagement française.
À partir d'UNE photo d'une pièce, tu identifies le mobilier et les objets volumineux
à déménager, et tu estimes le VOLUME DE DÉMÉNAGEMENT en m³ (volume que prend l'objet
dans le camion, emballé, pas son volume géométrique brut).`,
  prompt_apres: `Règles :
- Ne compte QUE ce qui est visible et qui serait effectivement déménagé.
- N'invente pas d'objets hors du champ de la photo.
- Estime des quantités réalistes (ex : "4 chaises" si tu en vois 4).
- Le volume_m3 de chaque ligne = volume unitaire × quantité.
- Le volume_m3 global de la photo = somme des lignes.
- Sois prudent : en cas de doute sur un objet partiellement visible, estime bas.`,
  user_instruction: "Analyse cette pièce et estime le volume de déménagement.",
  volume_references: [
    { label: "Carton standard", volume: 0.1 },
    { label: "Chaise", volume: 0.15 },
    { label: "Table de chevet", volume: 0.2 },
    { label: "Fauteuil", volume: 0.5 },
    { label: "Canapé 2 places", volume: 1 },
    { label: "Canapé 3 places", volume: 1.5 },
    { label: "Table à manger", volume: 0.8 },
    { label: "Buffet / commode", volume: 0.8 },
    { label: "Lit double (avec matelas)", volume: 1.5 },
    { label: "Armoire 2 portes", volume: 1.2 },
    { label: "Armoire 3 portes", volume: 1.8 },
    { label: "Réfrigérateur", volume: 0.7 },
    { label: "Lave-linge", volume: 0.6 },
    { label: "Télévision", volume: 0.2 },
    { label: "Bibliothèque", volume: 0.9 },
    { label: "Bureau", volume: 0.6 },
  ],
};

// Construit le prompt système final à partir de la config.
export function buildSystemPrompt(cfg: AiConfig): string {
  const refs = cfg.volume_references
    .map((r) => `- ${r.label} : ${r.volume} m³`)
    .join("\n");
  return `${cfg.prompt_avant}

Repères indicatifs de volume déménagement :
${refs}

${cfg.prompt_apres}`;
}

export async function getAiConfig(): Promise<AiConfig> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("ai_config").select("*").eq("id", true).maybeSingle();
  if (!data) return DEFAULT_AI_CONFIG;
  return {
    model: data.model || DEFAULT_AI_CONFIG.model,
    temperature: data.temperature != null ? Number(data.temperature) : DEFAULT_AI_CONFIG.temperature,
    prompt_avant: data.prompt_avant || DEFAULT_AI_CONFIG.prompt_avant,
    prompt_apres: data.prompt_apres || DEFAULT_AI_CONFIG.prompt_apres,
    user_instruction: data.user_instruction || DEFAULT_AI_CONFIG.user_instruction,
    volume_references:
      Array.isArray(data.volume_references) && data.volume_references.length > 0
        ? (data.volume_references as VolumeRef[])
        : DEFAULT_AI_CONFIG.volume_references,
  };
}

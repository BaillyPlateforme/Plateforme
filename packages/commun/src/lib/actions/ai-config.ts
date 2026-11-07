"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import type { AiConfig } from "@/lib/ai-config";

export async function saveAiConfig(input: AiConfig) {
  const supabase = createServiceClient();
  await supabase.from("ai_config").upsert(
    {
      id: true,
      model: input.model,
      temperature: input.temperature,
      prompt_avant: input.prompt_avant,
      prompt_apres: input.prompt_apres,
      user_instruction: input.user_instruction,
      volume_references: input.volume_references,
    },
    { onConflict: "id" },
  );
  revalidatePath("/dashboard/configuration");
}

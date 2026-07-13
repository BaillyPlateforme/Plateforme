"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import type { Channel } from "@/lib/messaging";

export interface TemplateInput {
  name: string;
  channel: Channel;
  event: string;
  sujet: string | null;
  contenu: string;
  active: boolean;
}

export async function saveTemplate(id: string | null, input: TemplateInput) {
  const supabase = createServiceClient();
  if (id) await supabase.from("message_templates").update(input).eq("id", id);
  else await supabase.from("message_templates").insert(input);
  revalidatePath("/dashboard/parametres");
}

export async function deleteTemplate(id: string) {
  const supabase = createServiceClient();
  await supabase.from("message_templates").delete().eq("id", id);
  revalidatePath("/dashboard/parametres");
}

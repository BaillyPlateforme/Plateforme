import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { MessageTemplate } from "@/lib/messaging";

export async function listTemplates(): Promise<MessageTemplate[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("message_templates")
    .select("*")
    .order("created_at", { ascending: true });
  return (data ?? []) as MessageTemplate[];
}

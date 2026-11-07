import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { RequestRow } from "@/lib/types";

export async function getRequestByToken(token: string): Promise<RequestRow | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("requests").select("*").eq("completion_token", token).maybeSingle();
  return (data as RequestRow) ?? null;
}

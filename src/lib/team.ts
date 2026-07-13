import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { TeamMemberRow } from "@/lib/types";

export async function listTeam(): Promise<TeamMemberRow[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("team_members")
    .select("*")
    .order("created_at", { ascending: true });
  return (data ?? []) as TeamMemberRow[];
}

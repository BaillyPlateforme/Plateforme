import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Client back-end avec la clé service_role : contourne la RLS.
// À n'utiliser QUE dans des route handlers / server actions / server components.
//
// Note : client non-typé volontairement. On maintient nos types au niveau des
// fonctions métier (RequestRow, etc.). Quand le schéma se stabilise, on génère
// les types avec `supabase gen types typescript` et on branche le générique.
export function createServiceClient() {
  return createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

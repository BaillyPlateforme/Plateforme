"use server";

import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/supabase/auth";

/**
 * Se déconnecter : ferme la session de CE navigateur seulement. Par défaut,
 * Supabase ferme toutes les sessions du compte — se déconnecter d'un poste
 * déconnectait aussi un collègue connecté au même compte ailleurs.
 */
export async function signOut() {
  const supabase = await createAuthClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}

"use server";

import { revalidatePath } from "next/cache";
import { getAcces } from "@/lib/supabase/auth";
import type { Resultat } from "@/lib/actions/espace-client-equipe";
import { executerVeille } from "./veille";

/*
 * « Relancer la veille », depuis le back-office (Réglages › Envois et
 * veille). Une action serveur répond depuis n'importe quelle adresse : elle
 * revérifie elle-même que c'est l'équipe (session ET membre actif de
 * team_members). Relancée à la main, la veille passe outre le verrou du jour ;
 * les messages déjà partis, eux, ne repartent pas (clés d'idempotence).
 */
export async function relancerVeille(): Promise<Resultat> {
  const acces = await getAcces();
  if (!acces || acces.role !== "equipe") return { ok: false, erreur: "Réservé à l'équipe Bailly." };
  try {
    const r = await executerVeille({ declenchement: "manuel", par: acces.email, force: true });
    revalidatePath("/dashboard/envois");
    if (!r.lancee) return { ok: false, erreur: r.raison };
    const s = r.execution.statut;
    const resume = (r.execution.resultat.taches ?? []).map((t) => `${t.libelle} : ${t.resume}`).join(" — ");
    return s === "echec" ? { ok: false, erreur: `Veille en échec. ${resume}` } : { ok: true, message: `Veille ${s === "reussie" ? "exécutée" : "exécutée en partie"}. ${resume}` };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : "Exécution impossible." };
  }
}

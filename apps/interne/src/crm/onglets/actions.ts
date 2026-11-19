"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { membreConnecte } from "@/lib/droits";
import { estRoleAdmin } from "@/lib/roles-equipe";
import { transaction } from "@/crm/lib/db";
import { journaliser } from "@/crm/lib/journal";
import { masquesDuFormulaire } from "./regles";
import { lireMasques } from "./donnees";

/**
 * « Enregistrer » les onglets du menu (Réglages › Onglets) : réservé aux
 * admins et au super admin, revérifié ici — une action serveur peut être
 * appelée depuis n'importe quelle page. Les cases cochées sont les pages
 * visibles ; le reste est masqué pour le rôle (regles.ts).
 */
export async function enregistrerOnglets(f: FormData) {
  const moi = await membreConnecte();
  if (!moi || !estRoleAdmin(moi.role)) redirect("/reglages/onglets?erreur=droits");
  const masques = masquesDuFormulaire(f.getAll("visible").map(String));
  const avant = await lireMasques();
  await transaction(async (db) => {
    await db.query("delete from crm.onglets_masques");
    for (const m of masques) {
      await db.query("insert into crm.onglets_masques (href, role, masque_par) values ($1, $2, $3)", [m.href, m.role, moi.nom || moi.email]);
    }
  });
  const cle = (l: { href: string; role: string }) => `${l.role}|${l.href}`;
  const anciens = new Set(avant.map(cle)), nouveaux = new Set(masques.map(cle));
  const masquees = masques.filter((m) => !anciens.has(cle(m))).map(cle);
  const affichees = avant.filter((m) => !nouveaux.has(cle(m))).map(cle);
  if (masquees.length || affichees.length) {
    await journaliser({
      action: "onglets.modifies",
      libelle: `Onglets du menu modifiés : ${[masquees.length && `${masquees.length} masqué${masquees.length > 1 ? "s" : ""}`, affichees.length && `${affichees.length} réaffiché${affichees.length > 1 ? "s" : ""}`].filter(Boolean).join(", ")}`,
      objet: { type: "onglets" },
      details: { masquees, affichees },
    });
  }
  // La coque est posée une fois pour toutes les pages : elle relit les onglets.
  revalidatePath("/", "layout");
  redirect("/reglages/onglets?ok=1");
}

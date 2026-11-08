import "server-only";
import { ecrireJournal, type Geste } from "@/lib/journal";
import { currentUser } from "./auth";
import { q } from "./db";

/*
 * Le journal des gestes, depuis une action du CRM : la ligne est signée de
 * l'utilisateur connecté et passe par le pool du CRM. Voir
 * packages/commun/src/lib/journal.ts et src/crm/feed/schema.ts.
 *
 * À appeler APRÈS le geste réussi (une suppression faite, pas tentée), et
 * avec `activite` quand l'action écrit aussi une ligne au fil du dossier.
 * Ne lève jamais.
 */
export type { Geste } from "@/lib/journal";

export async function journaliser(g: Geste): Promise<void> {
  let u: Awaited<ReturnType<typeof currentUser>> | null = null;
  try {
    u = await currentUser();
  } catch {
    u = null;
  }
  await ecrireJournal(g, u ? { type: "staff", id: u.id, nom: u.nom, email: u.email } : { type: "staff" }, q);
}

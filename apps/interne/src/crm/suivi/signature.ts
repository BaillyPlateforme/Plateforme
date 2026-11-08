import "server-only";
import { headers } from "next/headers";
import { after } from "next/server";
import { q1 } from "@/crm/lib/db";
import { createAuthClient } from "@/lib/supabase/auth";
import { noterPortail, requeteDe } from "@/lib/suivi-envois";

/**
 * La page de signature d'un devis (/signature/<jeton>) vue par le client :
 * une visite du portail, page « signature » (« a consulté son devis »),
 * rattachée à l'e-mail du devis le plus récent (clé crm:devis:<id>:…).
 *
 * Pas quand c'est l'équipe : la page est publique, mais un membre connecté à
 * l'app (qui l'ouvre depuis la fiche, « Lien de signature client ») a une
 * session ; le client, jamais. Noté après la réponse : la page n'attend pas.
 */
export async function noterSignatureVue(v: { id: number; dossier_id: number; ref: string }) {
  try {
    const { data } = await (await createAuthClient()).auth.getClaims();
    if (data?.claims?.sub) return;
  } catch {
    // Session illisible : dans le doute, rien n'est noté.
    return;
  }
  const r = requeteDe(await headers());
  after(async () => {
    const envoi = await q1<{ id: string }>("select id::text from public.envois where canal = 'email' and cle like $1 order by cree_le desc limit 1", [`crm:devis:${v.id}:%`]).catch(
      () => undefined,
    );
    await noterPortail({ page: "signature", reference: v.ref, ecDossierId: null, crmDossierId: v.dossier_id, envoiId: envoi?.id ?? null }, r);
  });
}

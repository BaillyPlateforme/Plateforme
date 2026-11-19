import { NextResponse, after } from "next/server";
import { erreurEnFrancais, messageDeRefus } from "@/lib/schemas";
import { lireJsonBorne } from "@/lib/requete-json";
import { adresseIp, fenetres, reponseTropDeDemandes, reserver } from "@/lib/limites";
import { contactRapideSchema, creerContactRapide } from "@/lib/contact-rapide";

/**
 * « Je souhaite être contacté(e) par un commercial » (lib/contact-rapide).
 * Un plafond par adresse IP, comme pour les demandes : réglable par
 * CONTACT_RAPIDE_PAR_MINUTE / _PAR_HEURE / _PAR_JOUR.
 */
export async function POST(req: Request) {
  const lu = await lireJsonBorne(req);
  if (!lu.ok) return lu.reponse;
  const parsed = contactRapideSchema.safeParse(lu.corps, { error: erreurEnFrancais });
  if (!parsed.success) return NextResponse.json({ error: messageDeRefus(parsed.error) }, { status: 422 });

  const refus = reserver([{ cle: `contact-rapide:ip:${adresseIp(req.headers)}`, fenetres: fenetres("CONTACT_RAPIDE", { minute: 2, heure: 4, jour: 5 }) }]);
  if (refus) return reponseTropDeDemandes(refus, "Votre demande de rappel est déjà enregistrée.");

  try {
    const { id, suite } = await creerContactRapide(parsed.data);
    after(() => suite().catch((e) => console.error(`[contact rapide ${id}] suite en échec :`, e instanceof Error ? e.message : e)));
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    console.error("[contact rapide] en échec :", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Votre demande n'a pas pu être enregistrée. Réessayez dans un instant, ou appelez-nous." }, { status: 500 });
  }
}

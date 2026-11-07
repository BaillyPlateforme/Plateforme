import "server-only";
import { NextResponse } from "next/server";
import { adressePublique } from "./config";
import { lireDonnees } from "./depot";
import { pdfBons, reponsePdf } from "./pdf";
import { lireVue } from "./vues-equipe";

/**
 * La réponse commune aux deux portes du back-office : les vues en JSON, et
 * les bons de livraison des cartons d'un samedi en PDF (/bons/<samedi>).
 *
 * La porte de démonstration n'a pas de session : elle ne lit jamais les
 * demandes des questionnaires, qui sont de vraies données personnelles.
 */
export async function repondreEquipe(req: Request, chemin: string[], { demo = false } = {}) {
  try {
    if (demo && chemin[0] === "demandes") {
      return NextResponse.json({ demandes: [], devis: [], demande: null, erreur: "les demandes des questionnaires sont de vraies données : elles ne se lisent que connecté à l'espace équipe" });
    }
    if (chemin[0] === "bons") {
      const samedi = chemin[1] ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(samedi)) return new Response("Date invalide.", { status: 400 });
      const d = await lireDonnees();
      const bons = d.livraisons_cartons
        .filter((l) => l.date_samedi === samedi)
        .sort((a, b) => (a.ordre_passage ?? 99) - (b.ordre_passage ?? 99))
        .map((l) => {
          const dossier = d.dossiers.find((x) => x.id === l.dossier_id)!;
          return { l, dossier, client: d.clients.find((c) => c.id === dossier.client_id)! };
        });
      return reponsePdf(await pdfBons(samedi, bons), `bons-cartons-${samedi}.pdf`);
    }
    const vue = await lireVue(chemin, new URL(req.url).searchParams, await adressePublique());
    if (vue === null) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    return NextResponse.json(vue, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Lecture impossible" }, { status: 500 });
  }
}

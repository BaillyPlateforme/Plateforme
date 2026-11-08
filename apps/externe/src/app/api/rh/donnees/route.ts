import { NextResponse } from "next/server";
import { cheminEspace, nomEnseigne, urlLogo } from "@/lib/espaces";
import { lireEspaceRh } from "@/lib/rh";
import type { DonneesRh } from "@/lib/rh-modele";
import { espaceDeLaSession } from "@/lib/rh-session";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

// GET /api/rh/donnees — tout ce que montre l'espace RH.
// L'espace vient du compte (rh-session.ts) : un compte RH ne reçoit que SON
// entreprise, quel que soit le paramètre passé. L'équipe Bailly peut regarder
// l'espace de n'importe quel client (?apercu=<identifiant>) ; sans ce
// paramètre, elle reçoit la liste des espaces à ouvrir.
export async function GET(req: Request) {
  try {
    const s = await espaceDeLaSession(req);
    if (!s.ok) return NextResponse.json({ error: s.erreur }, { status: s.statut });
    if (!s.espace) {
      return NextResponse.json({ choix: s.espaces.map((e) => ({ id: e.id, nom: e.nom, couleur: e.couleur, logo: urlLogo(e) })) });
    }

    const { espace, acces } = s;
    const settings = await getSettings();
    const base = (settings.base_url || "").replace(/\/$/, "");
    const lu = await lireEspaceRh(espace, settings);

    const donnees: DonneesRh = {
      espace: {
        id: espace.id,
        nom: nomEnseigne(espace),
        couleur: espace.couleur,
        logo: urlLogo(espace),
        // Le lien à transmettre aux salariés — seulement tant que l'espace est ouvert.
        lien: espace.actif ? `${base}${cheminEspace(espace)}` : null,
        couts: espace.rh_couts,
      },
      compte: acces.role === "rh" ? { email: acces.email, nom: acces.nom } : null,
      apercu: acces.role !== "rh",
      maintenant: Date.now(),
      ...lu,
    };
    return NextResponse.json(donnees, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Lecture impossible" }, { status: 500 });
  }
}

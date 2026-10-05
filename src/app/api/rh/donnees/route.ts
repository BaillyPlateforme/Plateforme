import { NextResponse } from "next/server";
import { listEspaces, lireRegles } from "@/lib/espaces-pro";
import { cheminEspace, espaceEffectif, nomEnseigne, urlLogo } from "@/lib/espaces";
import { demandesRh } from "@/lib/rh";
import type { DonneesRh } from "@/lib/rh-modele";
import { getSettings } from "@/lib/settings";
import { getAcces } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

// GET /api/rh/donnees — tout ce que montre l'espace RH.
// Un compte RH reçoit les demandes de SON entreprise : l'espace vient de son
// compte, jamais de l'adresse appelée. L'équipe Bailly, elle, peut regarder
// l'espace de n'importe quel client (?apercu=<identifiant>) ; sans ce
// paramètre, elle reçoit la liste des espaces à ouvrir.
export async function GET(req: Request) {
  const acces = await getAcces();
  if (!acces) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  try {
    const [espaces, regles, settings] = await Promise.all([listEspaces(), lireRegles(), getSettings()]);
    const voulu = acces.role === "rh" ? acces.espaceId : new URL(req.url).searchParams.get("apercu");

    if (!voulu) {
      // L'équipe, sans espace choisi.
      return NextResponse.json({
        choix: espaces.filter((e) => e.slug !== "standard").map((e) => ({ id: e.id, nom: e.nom, couleur: e.couleur, logo: urlLogo(e) })),
      });
    }

    const brut = espaces.find((e) => e.id === voulu);
    if (!brut) return NextResponse.json({ error: "Cet espace n'existe plus. Contactez Bailly Déménagement." }, { status: 404 });
    const espace = espaceEffectif(brut, regles);
    const base = (settings.base_url || "").replace(/\/$/, "");

    const donnees: DonneesRh = {
      espace: {
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
      demandes: await demandesRh(espace),
    };
    return NextResponse.json(donnees);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Lecture impossible" }, { status: 500 });
  }
}

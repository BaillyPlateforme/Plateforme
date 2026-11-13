import path from "node:path";
import type { NextConfig } from "next";

/**
 * La racine du monorepo : le code partagé (packages/commun) vit hors du
 * dossier de l'app, et Turbopack comme le traçage des fichiers du build
 * doivent pouvoir l'atteindre. Le build tourne depuis le dossier de l'app.
 */
const racine = path.resolve(process.cwd(), "..", "..");

/**
 * L'espace de l'équipe vivait sur ce domaine avant la séparation des deux
 * apps : ses anciennes adresses (favoris, vieux e-mails) mènent à l'interne.
 */
const interne = (process.env.NEXT_PUBLIC_URL_INTERNE || "").replace(/\/$/, "");

const nextConfig: NextConfig = {
  turbopack: { root: racine },
  outputFileTracingRoot: racine,
  /**
   * Les en-têtes de sécurité. Le formulaire s'affiche en cadre dans le site
   * officiel (et le PDF du devis en cadre dans le formulaire) ; l'équipe ouvre
   * aussi des pages d'ici en cadre. Personne d'autre : un site tiers ne peut
   * plus habiller l'espace client ou le portail RH pour faire cliquer.
   */
  async headers() {
    const ancetres = ["'self'", "https://www.demenagements-bailly.com", "https://demenagements-bailly.com", interne].filter(Boolean).join(" ");
    // Next pose ces en-têtes AVANT ceux d'une route, qui ne peut alors plus les durcir : les routes
    // plus strictes sont exclues de la règle qu'elles durcissent (la porte des fichiers garde sa CSP
    // « sandbox », le suivi des clics et l'aperçu leur « no-referrer »).
    return [
      {
        source: "/:chemin*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
        ],
      },
      {
        source: "/:chemin((?!espace-client/fichier/).*)",
        headers: [{ key: "Content-Security-Policy", value: `frame-ancestors ${ancetres}` }],
      },
      {
        source: "/:chemin((?!t/c/|espace-client/apercu(?:/|$)).*)",
        headers: [{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }],
      },
    ];
  },
  async redirects() {
    if (!interne) return [];
    return ["/dashboard", "/dashboard/:chemin*", "/login"].map((source) => ({
      source,
      destination: `${interne}${source}`,
      permanent: false,
    }));
  },
  experimental: {
    /**
     * Cache de routeur côté client.
     *
     * Par défaut, une page dynamique est refetchée à chaque visite, même si on
     * en revient à l'instant : chaque aller-retour dans le menu repayait le
     * rendu serveur complet. Trente secondes suffisent à rendre les
     * allers-retours instantanés sans servir des chiffres périmés, et le
     * bouton « Actualiser » de la barre du haut force le rafraîchissement.
     */
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
    /**
     * Les pièces et les photos de l'espace client passent par des actions
     * serveur : une photo de téléphone dépasse à elle seule le mégaoctet par
     * défaut. Les formulaires plafonnent un envoi à 30 Mo (10 Mo par fichier) ;
     * la limite laisse la place de l'enveloppe du formulaire.
     */
    serverActions: {
      bodySizeLimit: "32mb",
    },
    /**
     * Le proxy garde aussi les pages qui reçoivent ces envois : il met le
     * corps de la requête en mémoire, et le tronquerait au-delà de 10 Mo par
     * défaut. Même plafond que les actions serveur.
     */
    proxyClientMaxBodySize: "32mb",
  },
};

export default nextConfig;

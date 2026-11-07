import path from "node:path";
import type { NextConfig } from "next";

/**
 * La racine du monorepo : le code partagé (packages/commun) vit hors du
 * dossier de l'app, et Turbopack comme le traçage des fichiers du build
 * doivent pouvoir l'atteindre. Le build tourne depuis le dossier de l'app.
 */
const racine = path.resolve(process.cwd(), "..", "..");

const nextConfig: NextConfig = {
  turbopack: { root: racine },
  outputFileTracingRoot: racine,
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
  },
};

export default nextConfig;

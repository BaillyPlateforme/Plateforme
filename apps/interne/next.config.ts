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
  /**
   * La bulle de Next, en développement seulement : à gauche, elle couvrait le
   * bouton « Équipe » en bas du rail du CRM.
   */
  devIndicators: { position: "bottom-right" },
  /**
   * Les en-têtes de sécurité. L'app de l'équipe ne s'affiche en cadre que
   * chez elle (l'aperçu d'un devis, d'un e-mail) : aucun site tiers ne peut
   * l'habiller pour faire cliquer un membre de l'équipe connecté.
   */
  async headers() {
    // L'aperçu de l'espace client pose lui-même une politique plus stricte (CSP complète avec nonce,
    // DENY, no-referrer) : Next la remplacerait par celle-ci, qui passe avant. Il n'en reçoit que HSTS.
    return [
      {
        source: "/espace-client-apercu/:chemin*",
        headers: [{ key: "Strict-Transport-Security", value: "max-age=63072000" }],
      },
      {
        source: "/:chemin((?!espace-client-apercu(?:/|$)).*)",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
        ],
      },
    ];
  },
  experimental: {
    /** Deux mises en page racines (le CRM à la racine, l'équipe sous /dashboard) : la 404 des adresses inconnues est autonome. */
    globalNotFound: true,
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

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  },
};

export default nextConfig;

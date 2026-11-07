import type { Porte } from "./socle";

/** Le back-office dans l'espace équipe : derrière la session Supabase, gardé par le middleware. */
export const PORTE_EQUIPE: Porte = { racine: "/dashboard/espace-client", base: "/api/data/espace-client", demo: false };

/** Le même back-office, sans connexion, sur les données de démonstration seulement. */
export const PORTE_DEMO: Porte = { racine: "/espace-client/demo-equipe", base: "/espace-client/demo-equipe/donnees", demo: true };

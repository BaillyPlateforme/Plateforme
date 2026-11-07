/*
 * Les quatre sortes de comptes de la même authentification Supabase :
 *
 *   - l'équipe Bailly : les comptes historiques, sans rôle dans app_metadata ;
 *   - les RH des entreprises clientes : role = "rh", rattachés à un espace pro ;
 *   - les clients de l'espace client : role = "client", sans mot de passe,
 *     créés par le serveur au premier lien d'accès ;
 *   - les déménageurs : role = "terrain", créés par l'équipe depuis la page
 *     Déménageurs du CRM, qui n'ouvrent que l'outil terrain (/terrain).
 *
 * app_metadata ne s'écrit qu'avec la clé de service : un compte ne peut pas
 * se donner lui-même un autre rôle. Est « équipe » un compte SANS rôle : un
 * rôle inconnu n'ouvre rien, pour qu'un rôle ajouté demain ne donne pas, par
 * défaut, les clés de l'équipe. Chaque garde de l'équipe s'appuie donc sur
 * `roleDuCompte(…) === "equipe"`, jamais sur l'exclusion d'un seul rôle.
 */

export type RoleCompte = "equipe" | "rh" | "client" | "terrain" | "inconnu";

export function roleDuCompte(appMetadata: unknown): RoleCompte {
  const role = (appMetadata as { role?: unknown } | null | undefined)?.role;
  if (role === undefined || role === null || role === "") return "equipe";
  if (role === "rh") return "rh";
  if (role === "client") return "client";
  if (role === "terrain") return "terrain";
  return "inconnu";
}

/** Le rôle porté par un jeton (revendications `getClaims()`), ou celui d'un utilisateur lu. */
export const estEquipe = (appMetadata: unknown) => roleDuCompte(appMetadata) === "equipe";

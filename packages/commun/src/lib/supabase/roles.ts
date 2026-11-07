/*
 * Les trois sortes de comptes de la même authentification Supabase :
 *
 *   - l'équipe Bailly : les comptes historiques, sans rôle dans app_metadata ;
 *   - les RH des entreprises clientes : role = "rh", rattachés à un espace pro ;
 *   - les clients de l'espace client : role = "client", sans mot de passe,
 *     créés par le serveur au premier lien d'accès.
 *
 * app_metadata ne s'écrit qu'avec la clé de service : un compte ne peut pas
 * se donner lui-même un autre rôle. Est « équipe » tout compte qui n'est ni
 * RH ni client — c'est pourquoi chaque garde de l'équipe doit écarter les
 * deux autres, et jamais seulement les RH.
 */

export type RoleCompte = "equipe" | "rh" | "client";

export function roleDuCompte(appMetadata: unknown): RoleCompte {
  const role = (appMetadata as { role?: unknown } | null | undefined)?.role;
  if (role === "rh") return "rh";
  if (role === "client") return "client";
  return "equipe";
}

/** Le rôle porté par un jeton (revendications `getClaims()`), ou celui d'un utilisateur lu. */
export const estEquipe = (appMetadata: unknown) => roleDuCompte(appMetadata) === "equipe";

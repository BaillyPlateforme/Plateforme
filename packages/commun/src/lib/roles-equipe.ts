/*
 * Les rôles de l'équipe (public.team_members.role, texte libre) et leurs
 * règles, sans rien du serveur : l'écran Réglages › Équipe les montre, les
 * actions (lib/actions/team.ts) et lib/droits.ts les appliquent.
 *
 *   agent         le défaut ;
 *   admin         un administrateur ;
 *   super_admin   un administrateur qui peut, en plus, modifier l'espace d'un
 *                 client en son nom (aperçu en édition). Un super admin est
 *                 aussi un admin : `estRoleAdmin` le compte.
 */

export const ROLES_EQUIPE = ["agent", "admin", "super_admin"] as const;
export type RoleEquipe = (typeof ROLES_EQUIPE)[number];

export const LIBELLES_ROLES: Record<RoleEquipe, string> = { agent: "Agent", admin: "Admin", super_admin: "Super admin" };

export const estRoleEquipe = (r: unknown): r is RoleEquipe => typeof r === "string" && (ROLES_EQUIPE as readonly string[]).includes(r);

/** Un super admin est aussi un admin. */
export const estRoleAdmin = (role: string | null | undefined) => role === "admin" || role === "super_admin";

/** Le membre actif qui porte le droit de super admin. */
export const porteSuperAdmin = (m: { role: string; actif: boolean } | null | undefined) => !!m && m.actif && m.role === "super_admin";

/**
 * Peut-on donner ou retirer le droit de super admin ? Un super admin, oui ;
 * tant qu'aucun super admin actif n'existe, un admin aussi — pour nommer le
 * premier, rien d'autre.
 */
export const peutGererSuperAdmin = (moi: { role: string; actif: boolean } | null | undefined, superAdminsActifs: number) =>
  porteSuperAdmin(moi) || (superAdminsActifs === 0 && !!moi?.actif && moi.role === "admin");

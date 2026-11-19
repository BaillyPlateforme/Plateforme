import { GROUPES, type Groupe } from "@/ui/navigation";

/*
 * Les onglets du menu qu'un admin masque ou affiche, rôle par rôle (demande
 * de David, 19/11/2026 : « depuis paramètre, pour un admin, on doit pouvoir
 * masquer / afficher les onglets et/ou sous-onglets », par rôle) : les
 * rubriques de la barre du haut et leurs pages (ui/navigation.ts). Module
 * pur, partagé par la coque (client), la page de Réglages et son action.
 *
 * - Deux rôles se règlent : les agents et les admins. Le super admin voit
 *   toujours tout : il ne peut pas se fermer le menu.
 * - Une rubrique se masque en masquant toutes ses pages ; elle disparaît de
 *   la barre quand il ne lui en reste aucune.
 * - L'accueil reste visible pour tous, les Réglages pour les admins.
 * - Masquer retire du menu, sans fermer l'adresse : une page masquée s'ouvre
 *   encore depuis un lien (un devis depuis la fiche de son dossier…).
 */

export type RoleMenu = "agent" | "admin";

export const ROLES_MENU: { cle: RoleMenu; label: string }[] = [
  { cle: "agent", label: "Agents" },
  { cle: "admin", label: "Admins" },
];

export const estRoleMenu = (r: unknown): r is RoleMenu => r === "agent" || r === "admin";

/** Toutes les pages du menu, dans son ordre. */
export const PAGES_MENU = GROUPES.flatMap((g) => g.entrees.map((e) => e.href));

/** Une page qui ne se masque pas pour ce rôle : l'accueil, et les Réglages pour un admin. */
export const verrouillee = (href: string, role: RoleMenu) => href === "/" || (href === "/reglages" && role === "admin");

/**
 * Le rôle du menu d'un membre de l'équipe (team_members.role) : null pour le
 * super admin, qui voit tout ; « admin » pour un admin ; « agent » sinon (un
 * rôle inconnu compte comme le plus restreint).
 */
export function roleMenu(role: string | null | undefined): RoleMenu | null {
  if (role === "super_admin") return null;
  return role === "admin" ? "admin" : "agent";
}

/** Les pages masquées pour un rôle, parmi les lignes enregistrées : sans les pages verrouillées ni celles qui n'existent plus. */
export function masquesPour(lignes: readonly { href: string; role: string }[], role: RoleMenu | null): string[] {
  if (!role) return [];
  return [...new Set(lignes.filter((l) => l.role === role && PAGES_MENU.includes(l.href) && !verrouillee(l.href, role)).map((l) => l.href))];
}

/** Le menu sans les pages masquées ; une rubrique sans page disparaît. */
export function groupesVisibles(masques: readonly string[], groupes: Groupe[] = GROUPES): Groupe[] {
  if (!masques.length) return groupes;
  const m = new Set(masques);
  return groupes.map((g) => ({ ...g, entrees: g.entrees.filter((e) => !m.has(e.href)) })).filter((g) => g.entrees.length > 0);
}

/** La clé d'une case du formulaire : « rôle|adresse ». */
export const cleCase = (role: RoleMenu, href: string) => `${role}|${href}`;

/**
 * Ce que le formulaire enregistre : chaque case cochée est une page visible ;
 * toute autre page du menu est masquée pour ce rôle, sauf les verrouillées.
 */
export function masquesDuFormulaire(cochees: readonly string[]): { role: RoleMenu; href: string }[] {
  const visibles = new Set(cochees);
  return ROLES_MENU.flatMap(({ cle }) => PAGES_MENU.filter((href) => !verrouillee(href, cle) && !visibles.has(cleCase(cle, href))).map((href) => ({ role: cle, href })));
}

import { describe, expect, it } from "vitest";
import { GROUPES } from "@/ui/navigation";
import { cleCase, groupesVisibles, masquesDuFormulaire, masquesPour, PAGES_MENU, roleMenu, verrouillee } from "@/crm/onglets/regles";

/*
 * Réglages › Onglets (demande de David, 19/11/2026) : un admin masque ou
 * affiche les rubriques et les pages du menu, pour les agents et pour les
 * admins ; le super admin voit tout.
 */

const titres = (g: ReturnType<typeof groupesVisibles>) => g.map((x) => x.titre);
const pages = (g: ReturnType<typeof groupesVisibles>, titre: string) => g.find((x) => x.titre === titre)?.entrees.map((e) => e.href) ?? [];

describe("le rôle du menu", () => {
  it("le super admin voit tout ; un admin est un admin ; tout autre rôle compte comme agent", () => {
    expect(roleMenu("super_admin")).toBeNull();
    expect(roleMenu("admin")).toBe("admin");
    expect(roleMenu("agent")).toBe("agent");
    expect(roleMenu("inconnu")).toBe("agent");
    expect(roleMenu(null)).toBe("agent");
  });
});

describe("les pages masquées d'un rôle", () => {
  const lignes = [
    { href: "/devis", role: "agent" },
    { href: "/feed", role: "agent" },
    { href: "/copilote", role: "admin" },
    { href: "/", role: "agent" }, // verrouillée : ignorée
    { href: "/reglages", role: "agent" }, // hors de la barre (menu du compte) : ignorée
    { href: "/page-disparue", role: "agent" }, // plus au menu : ignorée
  ];

  it("chaque rôle a les siennes, sans les verrouillées ni les adresses disparues", () => {
    expect(masquesPour(lignes, "agent").sort()).toEqual(["/devis", "/feed"]);
    expect(masquesPour(lignes, "admin")).toEqual(["/copilote"]);
  });

  it("le super admin n'en a aucune", () => {
    expect(masquesPour(lignes, null)).toEqual([]);
  });

  it("verrouillée : l'accueil, pour tous", () => {
    expect(verrouillee("/", "agent")).toBe(true);
    expect(verrouillee("/", "admin")).toBe(true);
    expect(verrouillee("/devis", "admin")).toBe(false);
  });
});

describe("le menu sans les pages masquées", () => {
  it("rien de masqué : le menu complet, tel quel", () => {
    expect(groupesVisibles([])).toBe(GROUPES);
  });

  it("une page masquée quitte sa rubrique ; les autres restent dans l'ordre", () => {
    const g = groupesVisibles(["/devis"]);
    expect(pages(g, "Dossiers")).toEqual(["/parcours", "/planning", "/factures", "/relances"]);
    expect(titres(g)).toEqual(titres(GROUPES));
  });

  it("une rubrique sans page visible quitte la barre", () => {
    const exploitation = GROUPES.find((x) => x.titre === "Exploitation")!.entrees.map((e) => e.href);
    const g = groupesVisibles([...exploitation, "/feed"]);
    expect(titres(g)).not.toContain("Exploitation");
    expect(pages(g, "Accueil")).not.toContain("/feed");
    expect(titres(g)).toContain("Dossiers");
  });

  it("les fonctions qui allument une page suivent la page", () => {
    const g = groupesVisibles(["/devis"]);
    const parcours = g.find((x) => x.titre === "Dossiers")!.entrees.find((e) => e.href === "/parcours")!;
    expect(parcours.actif?.("/dossiers/12")).toBe(true);
  });
});

describe("le formulaire : les cases cochées sont les pages visibles", () => {
  const toutCoche = () => ["agent", "admin"].flatMap((r) => PAGES_MENU.map((h) => cleCase(r as "agent" | "admin", h)));

  it("tout coché : rien de masqué", () => {
    expect(masquesDuFormulaire(toutCoche())).toEqual([]);
  });

  it("une case décochée : la page est masquée pour ce rôle seulement", () => {
    const cochees = toutCoche().filter((k) => k !== cleCase("agent", "/factures"));
    expect(masquesDuFormulaire(cochees)).toEqual([{ role: "agent", href: "/factures" }]);
  });

  it("rien de coché : tout masqué, sauf les pages verrouillées", () => {
    const m = masquesDuFormulaire([]);
    expect(m).not.toContainEqual({ role: "agent", href: "/" });
    expect(m).not.toContainEqual({ role: "admin", href: "/" });
    expect(m.some((x) => x.href === "/reglages")).toBe(false);
    expect(m).toHaveLength(PAGES_MENU.length * 2 - 2);
  });

  it("une case inventée (adresse ou rôle hors menu) ne compte pas", () => {
    expect(masquesDuFormulaire([...toutCoche(), "agent|/inventee", "super_admin|/devis"])).toEqual([]);
  });
});

describe("la barre du haut simplifiée (David, 19/11/2026)", () => {
  it("cinq rubriques : Accueil (avec le Feed), Demandes, Dossiers, Clients (avec l'espace client), Exploitation ; Réglages hors barre", async () => {
    const { enBarre } = await import("@/ui/navigation");
    expect(titres(enBarre(GROUPES))).toEqual(["Accueil", "Demandes", "Dossiers", "Clients", "Exploitation"]);
    expect(GROUPES.find((g) => g.titre === "Demandes")!.entrees.map((e) => e.label)).toEqual(["Kanban", "Feed", "Top demandes", "Liste", "À rappeler", "Statistiques", "Suivi des leads"]);
    expect(pages(GROUPES, "Accueil")).toContain("/feed");
    expect(pages(GROUPES, "Clients")).toEqual(["/clients", "/dashboard/espace-client"]);
    expect(GROUPES.find((g) => g.titre === "Réglages")?.horsBarre).toBe(true);
  });

  it("une page de l'espace client allume la rubrique Clients ; une page de réglage, les Réglages", async () => {
    const { groupeDe } = await import("@/ui/navigation");
    expect(groupeDe("/dashboard/espace-client/dossiers/abc").titre).toBe("Clients");
    expect(groupeDe("/feed").titre).toBe("Accueil");
    expect(groupeDe("/demandes").titre).toBe("Demandes");
    expect(groupeDe("/dashboard/abc-123").titre).toBe("Demandes");
    expect(groupeDe("/dashboard/espace-client/reglages").titre).toBe("Réglages");
    expect(groupeDe("/reglages/onglets").titre).toBe("Réglages");
  });
});

describe("les vues de Demandes dans la sous-barre (David, 19/11/2026)", () => {
  it("la vue de l'adresse allume la bonne entrée, une seule", async () => {
    const { estActif } = await import("@/ui/navigation");
    const entrees = GROUPES.find((g) => g.titre === "Demandes")!.entrees;
    const allumees = (chemin: string, vue: string | null) => entrees.filter((e) => estActif(e, chemin, vue)).map((e) => e.label);
    expect(allumees("/demandes", null)).toEqual(["Kanban"]);
    expect(allumees("/demandes", "kanban")).toEqual(["Kanban"]);
    expect(allumees("/demandes", "feed")).toEqual(["Feed"]);
    expect(allumees("/demandes", "statistiques")).toEqual(["Statistiques"]);
    expect(allumees("/demandes", "leads")).toEqual(["Suivi des leads"]);
    // La page d'une demande, sous /dashboard : la rubrique Demandes, sur le Kanban.
    expect(allumees("/dashboard/3f2a-uuid", null)).toEqual(["Kanban"]);
  });
});


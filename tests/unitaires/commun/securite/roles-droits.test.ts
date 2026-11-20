import { beforeEach, describe, expect, it, vi } from "vitest";

const supa = vi.hoisted(() => ({ resultat: { data: null as unknown, error: null as unknown, count: null as number | null }, appels: [] as unknown[][] }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const chaine: Record<string | symbol, unknown> = new Proxy({}, {
        get(_, k) {
          if (k === "then") return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(supa.resultat).then(ok, ko);
          return (...args: unknown[]) => {
            supa.appels.push([table, String(k), ...args]);
            return chaine;
          };
        },
      });
      return chaine;
    },
  }),
}));
vi.mock("@/lib/supabase/auth", () => ({ getAcces: vi.fn() }));

import { estSuperAdmin, membreConnecte, membreParEmail, nombreSuperAdmins } from "@/lib/droits";
import { estRoleAdmin, estRoleEquipe, peutGererSuperAdmin, porteSuperAdmin, ROLES_EQUIPE } from "@/lib/roles-equipe";
import { getAcces } from "@/lib/supabase/auth";
import { estEquipe, roleDuCompte } from "@/lib/supabase/roles";

beforeEach(() => {
  supa.resultat = { data: [], error: null, count: null };
  supa.appels = [];
  vi.mocked(getAcces).mockReset();
});

describe("roles-equipe", () => {
  it("trois rôles, écrits exactement", () => {
    expect(ROLES_EQUIPE).toEqual(["agent", "admin", "super_admin"]);
    for (const r of ROLES_EQUIPE) expect(estRoleEquipe(r)).toBe(true);
  });

  it.each(["Admin", " admin", "admin ", "SUPER_ADMIN", "superadmin", "root", "", "__proto__", "constructor", "toString", null, undefined, 1, ["admin"], { role: "admin" }])(
    "estRoleEquipe(%j) : non",
    (r) => expect(estRoleEquipe(r)).toBe(false),
  );

  it("un super admin est aussi un admin ; rien d'autre ne l'est", () => {
    expect(estRoleAdmin("admin")).toBe(true);
    expect(estRoleAdmin("super_admin")).toBe(true);
    for (const r of ["agent", "ADMIN", "Admin ", "", null, undefined]) expect(estRoleAdmin(r)).toBe(false);
  });

  it("porteSuperAdmin exige le rôle exact ET une fiche active", () => {
    expect(porteSuperAdmin({ role: "super_admin", actif: true })).toBe(true);
    expect(porteSuperAdmin({ role: "super_admin", actif: false })).toBe(false);
    expect(porteSuperAdmin({ role: "admin", actif: true })).toBe(false);
    expect(porteSuperAdmin({ role: "Super_Admin", actif: true })).toBe(false);
    expect(porteSuperAdmin(null)).toBe(false);
    expect(porteSuperAdmin(undefined)).toBe(false);
  });

  it("peutGererSuperAdmin : un super admin toujours ; un admin seulement pour nommer le premier", () => {
    expect(peutGererSuperAdmin({ role: "super_admin", actif: true }, 3)).toBe(true);
    expect(peutGererSuperAdmin({ role: "admin", actif: true }, 0)).toBe(true);
    expect(peutGererSuperAdmin({ role: "admin", actif: true }, 1)).toBe(false);
    expect(peutGererSuperAdmin({ role: "admin", actif: false }, 0)).toBe(false);
    expect(peutGererSuperAdmin({ role: "agent", actif: true }, 0)).toBe(false);
    expect(peutGererSuperAdmin({ role: "super_admin", actif: false }, 0)).toBe(false);
    expect(peutGererSuperAdmin(null, 0)).toBe(false);
    expect(peutGererSuperAdmin({ role: "admin", actif: true }, Number.NaN)).toBe(false);
    expect(peutGererSuperAdmin({ role: "admin", actif: true }, -1)).toBe(false);
  });
});

describe("roleDuCompte — un rôle inconnu n'ouvre rien", () => {
  it.each([
    [undefined, "equipe"], [null, "equipe"], [{}, "equipe"], [{ role: null }, "equipe"], [{ role: "" }, "equipe"],
    [{ role: "rh" }, "rh"], [{ role: "client" }, "client"], [{ role: "terrain" }, "terrain"], [{ role: "marketing" }, "marketing"],
  ])("%j → %s", (m, attendu) => {
    expect(roleDuCompte(m)).toBe(attendu);
  });

  it.each([
    { role: "RH" }, { role: " rh" }, { role: "rh " }, { role: "Client" }, { role: "equipe" }, { role: "admin" }, { role: "super_admin" },
    { role: 0 }, { role: false }, { role: [] }, { role: ["rh"] }, { role: {} }, { role: "Marketing" }, { role: "marketing " }, { role: "rh\u0000" }, { role: "rh​" }, { role: "rһ" },
  ])("%j → inconnu", (m) => {
    expect(roleDuCompte(m)).toBe("inconnu");
    expect(estEquipe(m)).toBe(false);
  });

  it("estEquipe : seulement un compte sans rôle", () => {
    expect(estEquipe({})).toBe(true);
    expect(estEquipe({ role: "rh" })).toBe(false);
    expect(estEquipe({ role: "client" })).toBe(false);
    expect(estEquipe({ role: "marketing" })).toBe(false);
  });
});

describe("membreParEmail — la fiche de l'équipe, comparaison exacte", () => {
  const celine = { id: "1", email: "celine@bailly.fr", nom: "Céline", role: "super_admin", actif: true };

  it("vide ou blanc : null, sans interroger la base", async () => {
    for (const v of ["", "   ", null, undefined]) expect(await membreParEmail(v)).toBeNull();
    expect(supa.appels).toHaveLength(0);
  });

  it("normalise l'adresse cherchée, et la compare exactement à celle de la fiche", async () => {
    supa.resultat = { data: [{ ...celine, email: " Celine@Bailly.FR " }], error: null, count: null };
    expect(await membreParEmail("  CELINE@bailly.fr ")).toMatchObject({ id: "1" });
    expect(supa.appels).toContainEqual(["team_members", "ilike", "email", "celine@bailly.fr"]);
  });

  it("un joker « % » ou « _ » de ilike ne fait pas trouver un autre membre", async () => {
    supa.resultat = { data: [celine, { ...celine, id: "2", email: "christian@bailly.fr" }], error: null, count: null };
    for (const joker of ["%", "%@bailly.fr", "c%", "celine@bailly.f_", "_eline@bailly.fr"]) {
      expect(await membreParEmail(joker), joker).toBeNull();
    }
  });

  it("une erreur de lecture est levée, jamais prise pour « aucune fiche »", async () => {
    supa.resultat = { data: null, error: { message: "délai" }, count: null };
    await expect(membreParEmail("celine@bailly.fr")).rejects.toThrow(/Lecture de l'équipe impossible/);
  });
});

describe("membreConnecte et estSuperAdmin", () => {
  const celine = { id: "1", email: "celine@bailly.fr", nom: "Céline", role: "super_admin", actif: true };

  it("un compte de l'équipe à fiche active", async () => {
    vi.mocked(getAcces).mockResolvedValue({ id: "u", email: "celine@bailly.fr", role: "equipe" });
    supa.resultat = { data: [celine], error: null, count: null };
    expect(await membreConnecte()).toMatchObject({ id: "1" });
    expect(await estSuperAdmin()).toBe(true);
  });

  it("une fiche désactivée, un compte RH, aucune session : personne", async () => {
    vi.mocked(getAcces).mockResolvedValue({ id: "u", email: "celine@bailly.fr", role: "equipe" });
    supa.resultat = { data: [{ ...celine, actif: false }], error: null, count: null };
    expect(await membreConnecte()).toBeNull();
    expect(await estSuperAdmin()).toBe(false);
    vi.mocked(getAcces).mockResolvedValue({ id: "u", email: "celine@bailly.fr", role: "rh", espaceId: "carrefour", nom: "RH" });
    supa.resultat = { data: [celine], error: null, count: null };
    expect(await membreConnecte()).toBeNull();
    vi.mocked(getAcces).mockResolvedValue(null);
    expect(await membreConnecte()).toBeNull();
  });

  it("une session ou une base illisible : personne (jamais un droit par défaut)", async () => {
    vi.mocked(getAcces).mockRejectedValue(new Error("réseau"));
    expect(await membreConnecte()).toBeNull();
    vi.mocked(getAcces).mockResolvedValue({ id: "u", email: "celine@bailly.fr", role: "equipe" });
    supa.resultat = { data: null, error: { message: "délai" }, count: null };
    expect(await membreConnecte()).toBeNull();
    expect(await estSuperAdmin()).toBe(false);
  });

  it("un simple admin n'est pas super admin", async () => {
    vi.mocked(getAcces).mockResolvedValue({ id: "u", email: "celine@bailly.fr", role: "equipe" });
    supa.resultat = { data: [{ ...celine, role: "admin" }], error: null, count: null };
    expect(await estSuperAdmin()).toBe(false);
  });
});

describe("nombreSuperAdmins", () => {
  it("compte les super admins actifs", async () => {
    supa.resultat = { data: null, error: null, count: 2 };
    expect(await nombreSuperAdmins()).toBe(2);
    expect(supa.appels).toContainEqual(["team_members", "eq", "role", "super_admin"]);
    expect(supa.appels).toContainEqual(["team_members", "eq", "actif", true]);
  });

  it("sans compte lisible : 0 ; sur erreur : levée (pas de premier super admin nommé à l'aveugle)", async () => {
    supa.resultat = { data: null, error: null, count: null };
    expect(await nombreSuperAdmins()).toBe(0);
    supa.resultat = { data: null, error: { message: "x" }, count: null };
    await expect(nombreSuperAdmins()).rejects.toThrow(/Lecture de l'équipe impossible/);
  });
});

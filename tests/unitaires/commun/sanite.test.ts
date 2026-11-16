import { describe, expect, it } from "vitest";
import { adresseIp, delaiLisible, lireLimite } from "@/lib/limites";

describe("outillage", () => {
  it("charge le code partagé (alias @/lib, server-only neutralisé)", () => {
    expect(typeof adresseIp).toBe("function");
    expect(delaiLisible(30)).toBe("dans une minute");
    expect(lireLimite("INEXISTANTE_XYZ", 7)).toBe(7);
  });
});

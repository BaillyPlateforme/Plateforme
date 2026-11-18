import { describe, expect, it } from "vitest";
import { REPERE_VIDE, volumeDe } from "@/app/demande/volume";

/*
 * Le volume retenu par le formulaire (apps/externe/src/app/demande/volume.tsx).
 * Campagne du 18/11/2026, n° 100 : la barre affichait « Tout y est — -12 m³ à
 * déménager », et 0 m³ partait au chiffrage (750 €).
 */
describe("volumeDe — un volume nul ou négatif n'est pas un volume", () => {
  it.each(["-12", "0", "0.00", "-0.5", "", "abc"])("saisi « %s » : aucun volume (le bouton reste fermé)", (saisi) => {
    expect(volumeDe("explicit", saisi, [], [])).toBeNull();
  });

  it.each([["30", 30], ["18.5", 18.5], ["0.5", 0.5]])("saisi « %s » : %s m³", (saisi, attendu) => {
    expect(volumeDe("explicit", saisi, [], [])).toBe(attendu);
  });

  it("une liste dont le total est nul : aucun volume ; vide : aucun", () => {
    expect(volumeDe("list", "", [{ label: "Carton", quantite: 3, volume_unitaire_m3: 0 }], [])).toBeNull();
    expect(volumeDe("list", "", [], [])).toBeNull();
    expect(volumeDe("list", "", [{ label: "Carton standard", quantite: 10, volume_unitaire_m3: 0.1 }], [])).toBe(1);
  });

  it("le logement décrit : son volume, ou rien sans type ni surface", () => {
    expect(volumeDe("logement", "", [], [], REPERE_VIDE)).toBeNull();
    expect(volumeDe("logement", "", [], [], { ...REPERE_VIDE, type: "T3" })).toBeGreaterThan(0);
  });
});

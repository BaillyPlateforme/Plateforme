import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fausseBase, filtre, type Repondeur } from "./_outils";

const etat = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => etat.client }));

import { conclure, destinataireNormalise, lireEnvois, partisSur24h, reserver, type NouvelEnvoi } from "@/lib/envois/journal";

function brancher(repondre: Repondeur) {
  const b = fausseBase(repondre);
  etat.client = b.client;
  return b;
}

const nouvel: NouvelEnvoi = {
  cle: "questionnaires:demande_recue:r1:d1", canal: "email", origine: "questionnaires", modele: "Alerte : accusé",
  destinataire: "client@gmail.com", sujet: "Votre demande", apercu: null, reference: "d1", notification_id: null, mode: "actif", bac_a_sable: false,
};
const ligne = (champs: Record<string, unknown> = {}) => ({ id: "l1", ...nouvel, statut: "en_cours", motif: null, brevo_id: null, tentatives: 0, cree_le: "", traite_le: null, ...champs });

afterEach(() => {
  vi.useRealTimers();
});

describe("envois/journal — destinataireNormalise", () => {
  it("retire l'alias « +étiquette » et met l'adresse en minuscules", () => {
    expect(destinataireNormalise("email", "Claire+Promo@Gmail.com")).toBe("claire@gmail.com");
    expect(destinataireNormalise("email", "claire+1+2@gmail.com")).toBe("claire@gmail.com");
    expect(destinataireNormalise("email", "  CLAIRE@gmail.com ")).toBe("claire@gmail.com");
  });

  it("garde le « + » d'un domaine intact (seule la partie locale est touchée)", () => {
    expect(destinataireNormalise("email", "a+b@sous+domaine.fr")).toBe("a@sous+domaine.fr");
  });

  it("une adresse sans @ (ou qui commence par @) reste telle quelle, en minuscules", () => {
    expect(destinataireNormalise("email", "PasUneAdresse")).toBe("pasuneadresse");
    expect(destinataireNormalise("email", "@bailly.fr")).toBe("@bailly.fr");
  });

  it("ramène les écritures d'un même numéro à une seule (06…, +336…, 0033…)", () => {
    const formes = ["06 12 34 56 78", "+33 6 12 34 56 78", "+33612345678", "0033 6 12 34 56 78", "0033612345678", "06.12.34.56.78", "33612345678"];
    for (const f of formes) expect(destinataireNormalise("sms", f), f).toBe("33612345678");
  });

  it("ne touche pas un numéro étranger", () => {
    expect(destinataireNormalise("sms", "+1 514 555 0199")).toBe("15145550199");
  });
});

describe("envois/journal — partisSur24h", () => {
  const MAINTENANT = new Date("2026-11-15T10:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(MAINTENANT);
  });

  it("ne compte que les messages automatiques vers le client réellement partis, sur 24 heures à la milliseconde près", async () => {
    const b = brancher(() => ({ data: [{ destinataire: "a@b.fr" }, { destinataire: "c@d.fr" }] }));
    expect(await partisSur24h({ canal: "email" })).toBe(2);
    const [r] = b.de("envois", "select");
    expect(filtre(r, "eq", "origine")).toBe("questionnaires");
    expect(filtre(r, "like", "cle")).toBe("questionnaires:%");
    expect(filtre(r, "eq", "canal")).toBe("email");
    expect(filtre(r, "eq", "statut")).toBe("envoye");
    expect(filtre(r, "gte", "cree_le")).toBe("2026-11-14T10:00:00.000Z");
    expect(new Date(filtre(r, "gte", "cree_le") as string).getTime()).toBe(MAINTENANT.getTime() - 86_400_000);
  });

  it("compte par destinataire, alias et écritures du même numéro compris", async () => {
    brancher(() => ({
      data: [
        { destinataire: "claire@gmail.com" },
        { destinataire: "Claire+1@gmail.com" },
        { destinataire: "CLAIRE+robot@GMAIL.com" },
        { destinataire: "autre@gmail.com" },
        { destinataire: null },
      ],
    }));
    expect(await partisSur24h({ canal: "email", destinataire: "claire+2@gmail.com" })).toBe(3);
  });

  it("compte les SMS d'un même numéro, quelle qu'en soit l'écriture", async () => {
    brancher(() => ({ data: [{ destinataire: "06 12 34 56 78" }, { destinataire: "+33612345678" }, { destinataire: "0033612345678" }, { destinataire: "0711223344" }] }));
    expect(await partisSur24h({ canal: "sms", destinataire: "+33 6 12 34 56 78" })).toBe(3);
  });

  it("rend 0 quand le journal est illisible (on ne bloque pas un vrai message sur une panne)", async () => {
    brancher(() => ({ error: { message: "relation does not exist" } }));
    expect(await partisSur24h({ canal: "email" })).toBe(0);
    brancher(() => ({ data: null }));
    expect(await partisSur24h({ canal: "sms", destinataire: "0612345678" })).toBe(0);
  });
});

describe("envois/journal — reserver", () => {
  it("réserve la clé en une seule requête « on conflict do nothing », statut « en_cours »", async () => {
    const b = brancher((r) => (r.action === "upsert" ? { data: [ligne()] } : undefined));
    const res = await reserver(nouvel);
    expect(res.reservee).toBe(true);
    expect(res.ligne.id).toBe("l1");
    const [u] = b.de("envois", "upsert");
    expect(u.charge).toMatchObject({ ...nouvel, statut: "en_cours" });
    expect(u.options).toEqual({ onConflict: "cle", ignoreDuplicates: true });
  });

  it("une clé déjà prise par un message parti ne se réserve pas : la ligne existante est rendue", async () => {
    const b = brancher((r) => (r.action === "upsert" ? { data: [] } : r.action === "select" ? { data: ligne({ statut: "envoye", brevo_id: "<m1>" }) } : undefined));
    const res = await reserver(nouvel);
    expect(res.reservee).toBe(false);
    expect(res.ligne.statut).toBe("envoye");
    expect(b.de("envois", "update")).toHaveLength(0);
  });

  for (const statut of ["en_cours", "journalise", "bloque", "fictif", "bac_a_sable", "incertain"]) {
    it(`une clé au statut « ${statut} » ne se reprend pas (rien ne repart)`, async () => {
      const b = brancher((r) => (r.action === "upsert" ? { data: [] } : r.action === "select" ? { data: ligne({ statut }) } : undefined));
      expect((await reserver(nouvel)).reservee).toBe(false);
      expect(b.de("envois", "update")).toHaveLength(0);
    });
  }

  it("un message refusé par Brevo (« echec ») se reprend sous la même clé, une seule reprise à la fois", async () => {
    const b = brancher((r) => {
      if (r.action === "upsert") return { data: [] };
      if (r.action === "select") return { data: ligne({ statut: "echec", tentatives: 2 }) };
      if (r.action === "update") return { data: [ligne({ statut: "en_cours", tentatives: 3 })] };
    });
    const res = await reserver({ ...nouvel, mode: "recette", bac_a_sable: true });
    expect(res.reservee).toBe(true);
    const [u] = b.de("envois", "update");
    expect(u.charge).toEqual({ statut: "en_cours", motif: null, mode: "recette", bac_a_sable: true, tentatives: 3, traite_le: null });
    // La reprise n'aboutit que si la ligne n'a pas bougé entre-temps.
    expect(filtre(u, "eq", "statut")).toBe("echec");
    expect(filtre(u, "eq", "tentatives")).toBe(2);
  });

  it("une reprise perdue au profit d'un appel simultané n'est pas réservée", async () => {
    brancher((r) => {
      if (r.action === "upsert") return { data: [] };
      if (r.action === "select") return { data: ligne({ statut: "echec", tentatives: 0 }) };
      if (r.action === "update") return { data: [] };
    });
    expect((await reserver(nouvel)).reservee).toBe(false);
  });

  it("lève si la base refuse l'insertion (l'appelant n'envoie rien)", async () => {
    brancher(() => ({ error: { message: "permission denied" } }));
    await expect(reserver(nouvel)).rejects.toThrow("permission denied");
  });

  it("lève si la clé est introuvable après le conflit", async () => {
    brancher((r) => (r.action === "upsert" ? { data: [] } : { data: null }));
    await expect(reserver(nouvel)).rejects.toThrow("clé introuvable après conflit");
  });

  it("lève « la base ne répond pas » au bout de 8 secondes", async () => {
    vi.useFakeTimers();
    brancher(() => new Promise(() => undefined));
    const p = reserver(nouvel);
    const verif = expect(p).rejects.toThrow("la base ne répond pas");
    await vi.advanceTimersByTimeAsync(7_999);
    await vi.advanceTimersByTimeAsync(1);
    await verif;
  });
});

describe("envois/journal — conclure et lireEnvois", () => {
  it("inscrit le statut, le motif, l'identifiant Brevo et l'heure du traitement", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-15T09:00:00.000Z"));
    const b = brancher(() => undefined);
    await conclure("l1", { statut: "envoye", motif: null, brevo_id: "<m1>" });
    const [u] = b.de("envois", "update");
    expect(u.charge).toEqual({ statut: "envoye", motif: null, brevo_id: "<m1>", traite_le: "2026-11-15T09:00:00.000Z" });
    expect(filtre(u, "eq", "id")).toBe("l1");
  });

  it("lève si la mise à jour échoue", async () => {
    brancher(() => ({ error: { message: "timeout" } }));
    await expect(conclure("l1", { statut: "echec", motif: "x" })).rejects.toThrow("timeout");
  });

  it("borne la lecture du journal à 1000 lignes", async () => {
    const b = brancher(() => ({ data: [] }));
    await lireEnvois({ limite: 50_000, origine: "crm" });
    const [r] = b.de("envois", "select");
    expect(r.filtres).toContainEqual(["limit", 1000]);
    expect(filtre(r, "eq", "origine")).toBe("crm");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fausseBase, fetchInterdit, type Requete } from "./_outils";

/*
 * La lecture d'un e-mail entrant (emails-in.ts) : il devient une demande,
 * puis déclenche les règles des questionnaires. La base, les réglages, les
 * règles (fireEvent) et la qualification sont simulés.
 */

const m = vi.hoisted(() => ({ client: null as unknown, fireEvent: vi.fn(), qualifyRequest: vi.fn(), getSettings: vi.fn(), ordre: [] as string[] }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => m.client }));
vi.mock("@/lib/alerts", () => ({ fireEvent: m.fireEvent }));
vi.mock("@/lib/qualification", () => ({ qualifyRequest: m.qualifyRequest }));
vi.mock("@/lib/settings", () => ({ getSettings: m.getSettings }));

import { ingestEmail, type IncomingEmail } from "@/lib/emails-in";

let base: ReturnType<typeof fausseBase>;
let demandeCreee: { id: string } | null;

const complet: IncomingEmail = {
  expediteur: "claire.dumont@gmail.com", client_nom: "Claire Dumont", client_email: "claire.dumont@gmail.com", client_tel: "06 12 34 56 78",
  ville_depart: "Paris", ville_arrivee: "Lyon", volume_m3: 30, sujet: "Demande de devis", corps: "Bonjour, je déménage.",
};
const insere = (table: string) => base.de(table, "insert").map((r) => r.charge as Record<string, unknown>);
const ctxDe = (i: number) => m.fireEvent.mock.calls[i][1] as Record<string, unknown>;

beforeEach(() => {
  vi.stubGlobal("fetch", fetchInterdit());
  demandeCreee = { id: "req-42" };
  m.ordre = [];
  base = fausseBase((r: Requete) => (r.table === "requests" && r.action === "insert" ? { data: demandeCreee } : { data: null }));
  m.client = base.client;
  m.fireEvent.mockReset().mockImplementation(async (ev: string) => void m.ordre.push(`fire:${ev}`));
  m.qualifyRequest.mockReset().mockImplementation(async () => void m.ordre.push("qualifier"));
  m.getSettings.mockReset().mockResolvedValue({ base_url: "https://devis.bailly.fr/" });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("emails-in — un e-mail complet", () => {
  it("crée la demande (source e-mail, statut new), sans jeton de complétion", async () => {
    const r = await ingestEmail(complet);
    expect(r).toEqual({ id: "req-42", completion_token: null, incomplet: false });
    const [d] = insere("requests");
    expect(d).toMatchObject({ source: "email", status: "new", client_nom: "Claire Dumont", client_email: "claire.dumont@gmail.com", client_tel: "06 12 34 56 78", depart_ville: "Paris", arrivee_ville: "Lyon", volume_m3: 30, completion_token: null });
    expect(d.raw_payload).toEqual(complet);
  });

  it("garde l'e-mail reçu, rattaché à la demande, « traite »", async () => {
    await ingestEmail(complet);
    expect(insere("emails_recus")[0]).toEqual({
      expediteur: "claire.dumont@gmail.com", client_nom: "Claire Dumont", client_email: "claire.dumont@gmail.com", client_tel: "06 12 34 56 78",
      ville_depart: "Paris", ville_arrivee: "Lyon", volume_m3: 30, sujet: "Demande de devis", corps: "Bonjour, je déménage.", request_id: "req-42", status: "traite",
    });
  });

  it("l'estimation d'abord, puis « demande_recue » et « demande_complete »", async () => {
    await ingestEmail(complet);
    expect(m.qualifyRequest).toHaveBeenCalledWith("req-42");
    expect(m.ordre).toEqual(["qualifier", "fire:demande_recue", "fire:demande_complete"]);
    expect(insere("request_events")).toEqual([{ request_id: "req-42", type: "created", payload: { source: "email" } }]);
  });

  it("une qualification qui échoue n'empêche pas les messages, puis l'erreur remonte", async () => {
    m.qualifyRequest.mockRejectedValue(new Error("grille absente"));
    await expect(ingestEmail(complet)).rejects.toThrow("grille absente");
    expect(m.fireEvent.mock.calls.map((c) => c[0])).toEqual(["demande_recue", "demande_complete"]);
  });

  it("un volume à 0 n'est pas un volume manquant", async () => {
    const r = await ingestEmail({ ...complet, volume_m3: 0 });
    expect(r.incomplet).toBe(false);
  });
});

describe("emails-in — un e-mail incomplet", () => {
  it("un jeton de complétion, le lien sur l'adresse des réglages (sans double barre), et ce qui manque", async () => {
    const r = await ingestEmail({ ...complet, volume_m3: undefined, ville_arrivee: "" });
    expect(r.incomplet).toBe(true);
    expect(r.completion_token).toMatch(/^[0-9a-f-]{36}$/);
    expect(insere("requests")[0].completion_token).toBe(r.completion_token);
    expect(insere("request_events")[1]).toEqual({ request_id: "req-42", type: "incomplete", payload: { manque: ["Volume", "Adresse d'arrivée"] } });
    expect(ctxDe(0).lien_completion).toBe(`https://devis.bailly.fr/completer/${r.completion_token}`);
    expect(ctxDe(0)).toMatchObject({ manque_volume: true, manque_depart: false, manque_arrivee: true, source: "email", request_id: "req-42" });
  });

  it("« demande_recue » puis « demande_incomplete », sans estimation", async () => {
    await ingestEmail({ client_email: "x@gmail.com" });
    expect(m.qualifyRequest).not.toHaveBeenCalled();
    expect(m.fireEvent.mock.calls.map((c) => c[0])).toEqual(["demande_recue", "demande_incomplete"]);
    expect(insere("request_events")[1].payload).toEqual({ manque: ["Volume", "Adresse de départ", "Adresse d'arrivée"] });
  });

  it("sans adresse dans les réglages : un lien relatif", async () => {
    m.getSettings.mockResolvedValue({ base_url: null });
    const r = await ingestEmail({ client_email: "x@gmail.com" });
    expect(ctxDe(0).lien_completion).toBe(`/completer/${r.completion_token}`);
  });

  it("deux e-mails incomplets : deux jetons différents", async () => {
    const a = await ingestEmail({});
    const b = await ingestEmail({});
    expect(a.completion_token).not.toBe(b.completion_token);
  });
});

describe("emails-in — expéditeur, champs absents et contenus hostiles", () => {
  it("l'expéditeur : celui du message, sinon l'adresse du client, sinon rien", async () => {
    await ingestEmail({ client_email: "c@gmail.com" });
    await ingestEmail({});
    expect(insere("emails_recus").map((e) => e.expediteur)).toEqual(["c@gmail.com", null]);
  });

  it("un e-mail vide ne fait pas lever : tout à null", async () => {
    await ingestEmail({});
    expect(insere("requests")[0]).toMatchObject({ client_nom: null, client_email: null, client_tel: null, depart_ville: null, arrivee_ville: null, volume_m3: null });
  });

  it("l'objet et le corps reçus sont gardés tels quels, et ne passent jamais aux messages sortants", async () => {
    const hostile = { ...complet, sujet: "Devis\r\nBcc: pirate@pirate.com", corps: "<script>alert(1)</script>\r\n.\r\nRCPT TO:<x@y.z>", expediteur: "Claire <c@gmail.com>\r\nBcc: x@y.z" };
    await ingestEmail(hostile);
    expect(insere("emails_recus")[0]).toMatchObject({ sujet: hostile.sujet, corps: hostile.corps, expediteur: hostile.expediteur });
    for (let i = 0; i < m.fireEvent.mock.calls.length; i++) {
      const ctx = ctxDe(i);
      expect(ctx).not.toHaveProperty("sujet");
      expect(ctx).not.toHaveProperty("corps");
      expect(ctx).not.toHaveProperty("expediteur");
    }
  });

  it("du HTML dans le nom passe tel quel au contexte : l'échappement se fait au rendu", async () => {
    await ingestEmail({ ...complet, client_nom: "<img src=x onerror=alert(1)>" });
    expect(ctxDe(0).client_nom).toBe("<img src=x onerror=alert(1)>");
  });

  it("une adresse client multiple est transmise telle quelle (les garde-fous de l'envoi la refusent)", async () => {
    await ingestEmail({ ...complet, client_email: "a@gmail.com, b@gmail.com" });
    expect(ctxDe(0).client_email).toBe("a@gmail.com, b@gmail.com");
  });

  it("la demande non créée : l'e-mail reçu est gardé sans demande, aucune trace d'historique, les règles partent sans demande", async () => {
    demandeCreee = null;
    const r = await ingestEmail(complet);
    expect(r.id).toBeUndefined();
    expect(insere("emails_recus")[0].request_id).toBeNull();
    expect(insere("request_events")).toEqual([]);
    expect(m.qualifyRequest).not.toHaveBeenCalled();
    expect(ctxDe(0).request_id).toBeNull();
  });
});

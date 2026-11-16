import { beforeEach, describe, expect, it, vi } from "vitest";
import { fauxSupabase } from "./_outils";
import type { LivraisonCartons } from "@/lib/espace-client/types";

const m = vi.hoisted(() => ({
  creerClient: vi.fn(),
  estDemo: vi.fn(() => false),
  lireDonnees: vi.fn(),
  modifier: vi.fn(async () => true),
  envoyer: vi.fn(),
  geocoder: vi.fn(),
  destinatairesAlerte: vi.fn(),
  noterEvenement: vi.fn(),
  pdfBons: vi.fn(async () => Buffer.from("PDF")),
}));
vi.mock("@/lib/messaging", () => ({ TEL_AGENCE: "01 69 10 35 35" }));
vi.mock("@/lib/alertes-equipe", () => ({
  champDesabonnement: (a: { desabonnement: string | null }) => ({ desabonnement: a.desabonnement }),
  destinatairesAlerte: m.destinatairesAlerte,
  noterEvenement: m.noterEvenement,
}));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => m.creerClient() }));
vi.mock("@/lib/espace-client/pdf", () => ({ pdfBons: m.pdfBons }));
vi.mock("@/lib/espace-client/config", () => ({ estDemo: m.estDemo }));
vi.mock("@/lib/espace-client/depot", () => ({
  avecDelai: (p: PromiseLike<unknown>) => Promise.resolve(p),
  depot: () => ({ modifier: m.modifier }),
  lireDonnees: m.lireDonnees,
  maintenant: () => "2026-11-20T17:00:00.000Z",
}));
vi.mock("@/lib/espace-client/emails", () => ({ texteSms: (modele: string) => `sms:${modele}` }));
vi.mock("@/lib/espace-client/lectures", () => ({
  conseillerDe: () => ({ prenom: "Nadia", nom: "Benali", email: "nadia@exemple.fr", telephone: "0102030405" }),
  signatureDe: () => ({ nom: "Nadia Benali", role: "Votre contact", telephone: "0102030405" }),
}));
vi.mock("@/lib/espace-client/notifier", () => ({ notifier: { envoyer: m.envoyer } }));
vi.mock("@/lib/espace-client/tournee", async (original) => ({ ...(await original<typeof import("@/lib/espace-client/tournee")>()), geocoder: m.geocoder }));

import { calculerTourneeDuSamedi, envoyerCreneauxDuSamedi, envoyerRecapitulatifEquipe, occupationSamedis } from "@/lib/espace-client/samedi";

const SAMEDI = "2026-11-21";
const livraison = (o: Partial<LivraisonCartons>): LivraisonCartons => ({
  id: "l", dossier_id: "do-1", date_samedi: SAMEDI, adresse: "1 rue A, 91300 Massy", complement: null, code_acces: null,
  contact_nom: "Claire Dumont", contact_tel: "0600000000", nb_cartons: null, ordre_passage: null, creneau_debut: null,
  creneau_fin: null, lat: null, lng: null, statut: "confirmee", creneau_envoye_le: null, created_at: "2026-11-01T10:00:00Z", ...o,
});
const DOSSIERS = [{ id: "do-1", client_id: "cl-1", reference: "BD-2026-0164" }, { id: "do-2", client_id: "cl-2", reference: "BD-2026-0165" }];
const CLIENTS = [
  { id: "cl-1", civilite: "Madame", prenom: "Claire", nom: "Dumont", email: "claire@example.com", conseiller_id: "co-1" },
  { id: "cl-2", civilite: null, prenom: "Hugo", nom: "Petit", email: "hugo@example.com", conseiller_id: "co-1" },
];
const donnees = (livraisons_cartons: LivraisonCartons[]) => ({ livraisons_cartons, dossiers: DOSSIERS, clients: CLIENTS });

beforeEach(() => {
  vi.clearAllMocks();
  m.estDemo.mockReturnValue(false);
  m.modifier.mockResolvedValue(true);
});

describe("occupationSamedis — un nombre de livraisons par samedi, rien d'autre", () => {
  const lignes = [
    { id: "a", date_samedi: "2026-11-21" }, { id: "b", date_samedi: "2026-11-21" }, { id: "c", date_samedi: "2026-11-28" },
    { id: "d", date_samedi: "2026-12-05" }, { id: "e", date_samedi: "2026-11-14" },
  ];

  it("en démonstration : compte dans la fenêtre, bornes comprises", async () => {
    m.estDemo.mockReturnValue(true);
    m.lireDonnees.mockResolvedValue({ livraisons_cartons: lignes });
    await expect(occupationSamedis("2026-11-21", "2026-11-28")).resolves.toEqual({ "2026-11-21": 2, "2026-11-28": 1 });
  });

  it("la livraison que le client déplace n'est pas comptée", async () => {
    m.estDemo.mockReturnValue(true);
    m.lireDonnees.mockResolvedValue({ livraisons_cartons: lignes });
    await expect(occupationSamedis("2026-11-21", "2026-11-28", "a")).resolves.toEqual({ "2026-11-21": 1, "2026-11-28": 1 });
  });

  it("en base : la fenêtre est revérifiée même si la base en rend trop", async () => {
    m.creerClient.mockReturnValue(fauxSupabase({ ec_livraisons_cartons: { data: lignes } }).client);
    await expect(occupationSamedis("2026-11-21", "2026-11-28")).resolves.toEqual({ "2026-11-21": 2, "2026-11-28": 1 });
  });

  it("aucun identifiant ni donnée d'un autre client ne sort : seulement des dates et des nombres", async () => {
    m.creerClient.mockReturnValue(fauxSupabase({ ec_livraisons_cartons: { data: lignes } }).client);
    const r = await occupationSamedis("2026-11-01", "2026-12-31");
    for (const [k, v] of Object.entries(r)) {
      expect(k).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("base en erreur : une erreur claire", async () => {
    m.creerClient.mockReturnValue(fauxSupabase({ ec_livraisons_cartons: { data: null, error: { message: "boom" } } }).client);
    await expect(occupationSamedis("2026-11-21", "2026-11-28")).rejects.toThrow("Lecture du calendrier impossible : boom");
  });

  it("fenêtre vide ou sans livraison : objet vide", async () => {
    m.creerClient.mockReturnValue(fauxSupabase({ ec_livraisons_cartons: { data: [] } }).client);
    await expect(occupationSamedis("2026-11-21", "2026-11-28")).resolves.toEqual({});
  });
});

describe("envoyerCreneauxDuSamedi — le message de la veille", () => {
  const jeu = [
    livraison({ id: "pret", creneau_debut: "09:00", creneau_fin: "10:00", nb_cartons: 30 }),
    livraison({ id: "sans-creneau", nb_cartons: 20 }),
    livraison({ id: "sans-nombre", creneau_debut: "10:15", creneau_fin: "11:15" }),
    livraison({ id: "deja", creneau_debut: "09:00", creneau_fin: "10:00", nb_cartons: 10, creneau_envoye_le: "2026-11-20T08:00:00Z" }),
    livraison({ id: "livree", creneau_debut: "09:00", creneau_fin: "10:00", nb_cartons: 10, statut: "livree" }),
    livraison({ id: "autre-jour", date_samedi: "2026-11-28", creneau_debut: "09:00", creneau_fin: "10:00", nb_cartons: 10 }),
    livraison({ id: "orpheline", dossier_id: "do-inconnu", creneau_debut: "09:00", creneau_fin: "10:00", nb_cartons: 10 }),
    livraison({ id: "concurrente", dossier_id: "do-2", creneau_debut: "11:30", creneau_fin: "12:30", nb_cartons: 15 }),
  ];

  beforeEach(() => {
    m.lireDonnees.mockResolvedValue(donnees(jeu));
    // « concurrente » : déjà marquée par l'autre envoi lancé en même temps.
    m.modifier.mockImplementation(async (_t: string, id: string) => id !== "concurrente");
    m.envoyer.mockImplementation(async (msg: { canal: string }) => ({ statut: msg.canal === "sms" ? "envoyee" : "echec" }));
  });

  it("compte prévenus, partis, échecs et incomplets", async () => {
    await expect(envoyerCreneauxDuSamedi(SAMEDI)).resolves.toEqual({ envoyes: 1, prevenus: 1, partis: 1, echecs: 1, incomplets: 2 });
  });

  it("marque la livraison AVANT d'envoyer, sous condition qu'elle ne le soit pas déjà", async () => {
    await envoyerCreneauxDuSamedi(SAMEDI);
    expect(m.modifier).toHaveBeenCalledWith("livraisons_cartons", "pret", { creneau_envoye_le: "2026-11-20T17:00:00.000Z" }, { creneau_envoye_le: null });
    const ordreMarque = m.modifier.mock.invocationCallOrder[0];
    expect(Math.min(...m.envoyer.mock.invocationCallOrder)).toBeGreaterThan(ordreMarque);
  });

  it("un SMS et un e-mail, chacun avec sa clé propre au samedi et au créneau", async () => {
    await envoyerCreneauxDuSamedi(SAMEDI);
    expect(m.envoyer).toHaveBeenCalledTimes(2);
    const [[sms, optSms], [email, optEmail]] = m.envoyer.mock.calls;
    expect(sms).toMatchObject({ dossier_id: "do-1", canal: "sms", modele: "creneau_cartons", destinataire: "0600000000" });
    expect(email).toMatchObject({ canal: "email", destinataire: "claire@example.com" });
    expect(email.payload).toMatchObject({ salutation: "Madame Dumont", prenom: "Claire", nb: 30, jour: "samedi 21 novembre", debut: "9 h 00", fin: "10 h 00" });
    expect(sms.payload.texte).toBe("sms:creneau_cartons");
    expect(optSms).toEqual({ cle: "cartons:creneau:pret:2026-11-21:09:00:sms", origine: "espace_client" });
    expect(optEmail).toEqual({ cle: "cartons:creneau:pret:2026-11-21:09:00:email", origine: "espace_client" });
  });

  it("l'envoi automatique de la veille se signale comme tel", async () => {
    await envoyerCreneauxDuSamedi(SAMEDI, { origine: "veille" });
    expect(m.envoyer.mock.calls.every((c) => c[1].origine === "veille")).toBe(true);
  });

  it("rien de prêt : aucun envoi", async () => {
    m.lireDonnees.mockResolvedValue(donnees([livraison({ id: "x" })]));
    await expect(envoyerCreneauxDuSamedi(SAMEDI)).resolves.toEqual({ envoyes: 0, prevenus: 0, partis: 0, echecs: 0, incomplets: 1 });
    expect(m.envoyer).not.toHaveBeenCalled();
  });
});

describe("calculerTourneeDuSamedi — ordre de passage et créneaux", () => {
  it("localise ce qui manque, écarte le hors zone et l'introuvable, enregistre l'ordre", async () => {
    m.lireDonnees.mockResolvedValue(donnees([
      livraison({ id: "massy", lat: 48.73, lng: 2.27 }),
      livraison({ id: "a-localiser", adresse: "Paris 11e" }),
      livraison({ id: "lyon", lat: 45.76, lng: 4.84 }),
      livraison({ id: "introuvable", adresse: "nulle part" }),
      livraison({ id: "livree", statut: "livree", lat: 48.8, lng: 2.3 }),
    ]));
    m.geocoder.mockImplementation(async (a: string) => (a === "Paris 11e" ? { lat: 48.86, lng: 2.38 } : null));

    const r = await calculerTourneeDuSamedi(SAMEDI);
    expect(r.arrets).toBe(2);
    expect(r.horsTournee).toBe(2);
    expect(r.distanceKm).toBeGreaterThan(0);
    expect(r.fin).toMatch(/^\d{2}:\d{2}$/);
    expect(m.geocoder).toHaveBeenCalledTimes(2);

    const maj = Object.fromEntries(m.modifier.mock.calls.map((c) => [c[1], c[2]]));
    expect(Object.keys(maj).sort()).toEqual(["a-localiser", "introuvable", "lyon", "massy"]);
    expect(maj["a-localiser"]).toMatchObject({ lat: 48.86, lng: 2.38 });
    expect([maj.massy.ordre_passage, maj["a-localiser"].ordre_passage].sort()).toEqual([1, 2]);
    expect(maj.massy.creneau_debut).toMatch(/^\d{2}:\d{2}$/);
    expect(maj.lyon).toMatchObject({ lat: 45.76, lng: 4.84, ordre_passage: null, creneau_debut: null, creneau_fin: null });
    expect(maj.introuvable).toMatchObject({ lat: null, lng: null, ordre_passage: null });
  });
});

describe("envoyerRecapitulatifEquipe — le récapitulatif de la veille", () => {
  const jeu = () => [
    livraison({ id: "l1", ordre_passage: 2, nb_cartons: 30, creneau_debut: "09:00", creneau_fin: "10:00", contact_nom: "Claire Dumont" }),
    livraison({ id: "l2", ordre_passage: 1, nb_cartons: 20, creneau_debut: "08:30", creneau_fin: "09:30", contact_nom: "Zoé Martin" }),
    livraison({ id: "l3", contact_nom: "Bruno Roux", nb_cartons: 10 }),
    livraison({ id: "l4", contact_nom: "Aline Faure" }),
    livraison({ id: "livree", statut: "livree", nb_cartons: 99 }),
  ];

  beforeEach(() => {
    m.destinatairesAlerte.mockResolvedValue({ destinataires: [{ email: "Equipe@Exemple.fr", desabonnement: "https://x/stop" }, { email: "b@exemple.fr", desabonnement: null }] });
  });

  it("rien ce samedi : aucun envoi", async () => {
    m.lireDonnees.mockResolvedValue(donnees([]));
    await expect(envoyerRecapitulatifEquipe(SAMEDI)).resolves.toEqual({ destinataires: 0, partis: 0, journalises: 0, deja: 0 });
    expect(m.envoyer).not.toHaveBeenCalled();
  });

  it("dans l'ordre de passage, puis par nom ; total des cartons ; incomplets comptés", async () => {
    m.lireDonnees.mockResolvedValue(donnees(jeu()));
    m.envoyer.mockResolvedValue({ statut: "envoyee" });
    await envoyerRecapitulatifEquipe(SAMEDI);
    const p = m.envoyer.mock.calls[0][0].payload;
    expect(p.lignes.map((l: { client: string }) => l.client)).toEqual(["Zoé Martin", "Claire Dumont", "Aline Faure", "Bruno Roux"]);
    expect(p.total).toBe(60); // 20 + 30 + 10, la livraison livrée exclue
    expect(p.incomplets).toBe(2);
    expect(p.lignes[0].creneau).toBe("8 h 30 – 9 h 30");
    expect(p.jour).toBe("samedi 21 novembre");
  });

  it("compte partis, journalisés et déjà traités, destinataire par destinataire", async () => {
    m.lireDonnees.mockResolvedValue(donnees(jeu()));
    m.envoyer.mockResolvedValueOnce({ statut: "envoyee" }).mockResolvedValueOnce({ statut: "envoyee", doublon: true });
    await expect(envoyerRecapitulatifEquipe(SAMEDI)).resolves.toEqual({ destinataires: 2, partis: 1, journalises: 0, deja: 1 });
    m.envoyer.mockResolvedValue({ statut: "journalisee" });
    await expect(envoyerRecapitulatifEquipe(SAMEDI)).resolves.toMatchObject({ journalises: 2, partis: 0 });
  });

  it("la clé tient compte du contenu : relancé à l'identique, même clé ; tournée changée, autre clé", async () => {
    m.envoyer.mockResolvedValue({ statut: "envoyee" });
    m.lireDonnees.mockResolvedValue(donnees(jeu()));
    await envoyerRecapitulatifEquipe(SAMEDI);
    await envoyerRecapitulatifEquipe(SAMEDI);
    const change = jeu();
    change[0].nb_cartons = 31;
    m.lireDonnees.mockResolvedValue(donnees(change));
    await envoyerRecapitulatifEquipe(SAMEDI);
    const cles = m.envoyer.mock.calls.map((c) => c[1].cle as string);
    expect(cles[0]).toBe(cles[2]);
    expect(cles[1]).toBe(cles[3]);
    expect(cles[4]).not.toBe(cles[0]);
    expect(cles[0]).toMatch(/^veille:cartons:recap:2026-11-21:equipe@exemple\.fr:[0-9a-f]{16}$/);
  });

  it("joint les bons en PDF et note l'événement", async () => {
    m.lireDonnees.mockResolvedValue(donnees(jeu()));
    m.envoyer.mockResolvedValue({ statut: "envoyee" });
    await envoyerRecapitulatifEquipe(SAMEDI);
    expect(m.envoyer.mock.calls[0][1].piecesJointes).toEqual([{ nom: "bons-cartons-2026-11-21.pdf", base64: Buffer.from("PDF").toString("base64") }]);
    expect(m.envoyer.mock.calls[0][0].payload.desabonnement).toBe("https://x/stop");
    expect(m.noterEvenement).toHaveBeenCalledWith("recap_cartons", expect.stringMatching(/^2026-11-21-[0-9a-f]{16}$/), null, 2, expect.any(String));
  });
});

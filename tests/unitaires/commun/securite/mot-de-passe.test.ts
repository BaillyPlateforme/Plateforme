import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Le mot de passe de l'équipe, choisi par un lien à usage unique (20/11/2026) :
 * les règles, l'émission du lien (le bon compte, et lui seul) et sa
 * consommation (règles avant jeton, compte de l'équipe actif, sessions
 * fermées). Supabase, l'équipe, le journal et l'envoi sont simulés.
 */

const sb = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  generateLink: vi.fn(),
  updateUserById: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { verifyOtp: sb.verifyOtp } }) }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ auth: { admin: { generateLink: sb.generateLink, updateUserById: sb.updateUserById, signOut: sb.signOut } } }),
}));
const membres = vi.hoisted(() => ({ membreParEmail: vi.fn() }));
vi.mock("@/lib/droits", () => membres);
const journal = vi.hoisted(() => ({ ecrireJournal: vi.fn(async () => undefined) }));
vi.mock("@/lib/journal", () => journal);
const envois = vi.hoisted(() => ({ envoyerEmail: vi.fn(async () => ({ statut: "journalise" })) }));
vi.mock("@/lib/envois", () => envois);
vi.mock("@/lib/settings", () => ({ getSettings: async () => ({ base_url: "https://espace.exemple.fr", entreprise_nom: "Bailly Déménagement" }) }));
vi.mock("@/lib/adresses", () => ({ URL_INTERNE: "https://app.exemple.fr", versInterne: (c: string) => `https://app.exemple.fr${c}` }));

import { choisirParLien, emettreLienMotDePasse, envoyerLienMotDePasse, LIEN_INVALIDE } from "@/lib/equipe/lien-mot-de-passe";
import { jetonValide, refusMotDePasse } from "@/lib/equipe/regles-mot-de-passe";

const CELINE = { id: "uid-celine", email: "celine@example.com", nom: "Céline Exemple", role: "admin", actif: true };
const JETON = "ab".repeat(28);
const BON = "Un-Bon-Mot-De-Passe-42";

beforeEach(() => {
  for (const f of Object.values(sb)) f.mockReset();
  membres.membreParEmail.mockReset().mockResolvedValue(CELINE);
  journal.ecrireJournal.mockClear();
  envois.envoyerEmail.mockClear();
  sb.verifyOtp.mockResolvedValue({ data: { user: { id: CELINE.id, email: CELINE.email, app_metadata: {} }, session: { access_token: "jwt-du-lien" } }, error: null });
  sb.updateUserById.mockResolvedValue({ error: null });
  sb.signOut.mockResolvedValue({ error: null });
  sb.generateLink.mockResolvedValue({ data: { user: { id: CELINE.id, app_metadata: {} }, properties: { hashed_token: JETON } }, error: null });
});

describe("les règles du nouveau mot de passe", () => {
  it("refuse deux saisies différentes, trop courtes, trop longues, répétitives", () => {
    expect(refusMotDePasse("Abcdefghij1", "Abcdefghij2")).toMatch(/pas identiques/);
    expect(refusMotDePasse("Court-1", "Court-1")).toMatch(/au moins 10/);
    expect(refusMotDePasse("x".repeat(73), "x".repeat(73))).toMatch(/dépasser 72/);
    // 72 octets : les lettres accentuées en comptent deux.
    expect(refusMotDePasse("é".repeat(37), "é".repeat(37))).toMatch(/dépasser 72/);
    expect(refusMotDePasse(" ".repeat(12), " ".repeat(12))).toMatch(/espaces/);
    expect(refusMotDePasse("aaaaaaaaaaab", "aaaaaaaaaaab")).toMatch(/répétitif/);
    expect(refusMotDePasse(BON, BON)).toBeNull();
  });

  it("ne lit qu'un jeton de la forme de Supabase", () => {
    expect(jetonValide(JETON)).toBe(true);
    for (const j of ["", "court", "a".repeat(201), "abc def ghi jkl mno pqr", "../../etc/passwd/xxxxxxxx", undefined, 42]) expect(jetonValide(j)).toBe(false);
  });
});

describe("l'émission du lien", () => {
  it("rend un lien vers le CRM, construit sur l'adresse réglée, avec le jeton de Supabase", async () => {
    const lien = await emettreLienMotDePasse(CELINE);
    expect(lien).toBe(`https://app.exemple.fr/login/mot-de-passe/choisir?jeton=${JETON}`);
    expect(sb.generateLink).toHaveBeenCalledWith({ type: "recovery", email: CELINE.email });
  });

  it("refuse un compte qui n'est pas exactement celui de la fiche, ou pas de l'équipe", async () => {
    sb.generateLink.mockResolvedValueOnce({ data: { user: { id: "un-autre", app_metadata: {} }, properties: { hashed_token: JETON } }, error: null });
    await expect(emettreLienMotDePasse(CELINE)).rejects.toThrow(/ne correspond pas/);
    sb.generateLink.mockResolvedValueOnce({ data: { user: { id: CELINE.id, app_metadata: { role: "client" } }, properties: { hashed_token: JETON } }, error: null });
    await expect(emettreLienMotDePasse(CELINE)).rejects.toThrow(/ne correspond pas/);
    await expect(emettreLienMotDePasse({ ...CELINE, actif: false })).rejects.toThrow(/pas actif/);
  });

  it("n'envoie rien pour une adresse sans fiche active, et sans suivi pour un membre", async () => {
    membres.membreParEmail.mockResolvedValueOnce(null);
    expect(await envoyerLienMotDePasse("inconnu@example.com")).toBeNull();
    membres.membreParEmail.mockResolvedValueOnce({ ...CELINE, actif: false });
    expect(await envoyerLienMotDePasse(CELINE.email)).toBeNull();
    expect(sb.generateLink).not.toHaveBeenCalled();
    expect(envois.envoyerEmail).not.toHaveBeenCalled();

    await envoyerLienMotDePasse(CELINE.email.toUpperCase());
    const m = (envois.envoyerEmail.mock.calls as unknown as [{ a: string; suivi: boolean; html: string; texte: string }][])[0][0];
    // Toujours l'adresse de la fiche, jamais celle saisie ; ni pixel ni lien réécrit.
    expect(m.a).toBe(CELINE.email);
    expect(m.suivi).toBe(false);
    expect(m.html).toContain(`jeton=${JETON}`);
    expect(m.texte).toContain("valable une heure");
  });
});

describe("la consommation du lien", () => {
  it("vérifie les règles AVANT le jeton : une saisie refusée ne brûle pas le lien", async () => {
    const r = await choisirParLien(JETON, "court", "court");
    expect(r).toMatchObject({ ok: false });
    expect(r.ok === false && r.lienPerdu).toBeFalsy();
    expect(sb.verifyOtp).not.toHaveBeenCalled();
  });

  it("enregistre le mot de passe du membre, ferme toutes ses sessions et le note au journal", async () => {
    expect(await choisirParLien(JETON, BON, BON)).toEqual({ ok: true, email: CELINE.email });
    expect(sb.verifyOtp).toHaveBeenCalledWith({ token_hash: JETON, type: "recovery" });
    expect(sb.updateUserById).toHaveBeenCalledWith(CELINE.id, { password: BON });
    expect(sb.signOut).toHaveBeenCalledWith("jwt-du-lien", "global");
    expect(journal.ecrireJournal).toHaveBeenCalledWith(expect.objectContaining({ action: "membre_equipe.mot_de_passe" }), { type: "staff", email: CELINE.email });
  });

  it("refuse un jeton refusé par Supabase", async () => {
    sb.verifyOtp.mockResolvedValueOnce({ data: { user: null, session: null }, error: { message: "Token has expired or is invalid" } });
    expect(await choisirParLien(JETON, BON, BON)).toEqual({ ok: false, erreur: LIEN_INVALIDE, lienPerdu: true });
    expect(sb.updateUserById).not.toHaveBeenCalled();
  });

  it("refuse, et ferme la session ouverte par le lien, un compte qui n'est pas de l'équipe ou plus actif", async () => {
    for (const cas of [
      () => sb.verifyOtp.mockResolvedValueOnce({ data: { user: { id: CELINE.id, email: CELINE.email, app_metadata: { role: "rh" } }, session: { access_token: "jwt-du-lien" } }, error: null }),
      () => membres.membreParEmail.mockResolvedValueOnce({ ...CELINE, actif: false }),
      () => membres.membreParEmail.mockResolvedValueOnce({ ...CELINE, id: "une-autre-fiche" }),
      () => membres.membreParEmail.mockResolvedValueOnce(null),
    ]) {
      sb.updateUserById.mockClear();
      sb.signOut.mockClear();
      cas();
      expect(await choisirParLien(JETON, BON, BON)).toEqual({ ok: false, erreur: LIEN_INVALIDE, lienPerdu: true });
      expect(sb.updateUserById).not.toHaveBeenCalled();
      expect(sb.signOut).toHaveBeenCalledWith("jwt-du-lien", "global");
    }
  });

  it("dit qu'il faut un nouveau lien quand Supabase refuse le mot de passe après coup", async () => {
    sb.updateUserById.mockResolvedValueOnce({ error: { message: "Password is known to be weak" } });
    const r = await choisirParLien(JETON, BON, BON);
    expect(r).toMatchObject({ ok: false, lienPerdu: true });
    expect(r.ok === false && r.erreur).toMatch(/weak.*nouveau/);
    expect(sb.signOut).toHaveBeenCalled();
  });
});

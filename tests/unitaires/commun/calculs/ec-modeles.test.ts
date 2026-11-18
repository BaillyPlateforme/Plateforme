import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fauxSupabase } from "./_outils";

/*
 * Les modèles à télécharger des pièces (migration 0021) : dans le magasin de
 * démonstration en mémoire (jeu de départ, cloisonnement), par les actions de
 * l'équipe (ajouter, remplacer, retirer, retirer la pièce), par la porte qui
 * les sert, et en base tant que la migration manque (lecture tolérante).
 */

const m = vi.hoisted(() => {
  process.env.ESPACE_CLIENT_DONNEES = "demo";
  // Les PDF (la page témoin) prennent leurs polices dans public/ de l'app, au chargement du module.
  const ici = process.cwd();
  process.chdir(decodeURIComponent(new URL("../../../../apps/externe", import.meta.url).pathname));
  return { service: null as unknown, journal: [] as unknown[], ici };
});
afterAll(() => process.chdir(m.ici));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({ createAuthClient: async () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => m.service }));
vi.mock("@/lib/espace-client/equipe", () => ({ exigerEquipe: async () => ({ nom: "Équipe (démonstration)", demo: true }), equipeConnectee: async () => null }));
vi.mock("@/lib/journal", () => ({ ecrireJournal: async (g: unknown) => void m.journal.push(g) }));

import { ajouterModele, enregistrerPiece, retirerModele, supprimerPiece } from "@/lib/actions/espace-client-equipe";
import { depot, restreindre, tableManquante } from "@/lib/espace-client/depot";
import { lienFichier, lireOctets } from "@/lib/espace-client/fichiers";
import { modelesDe, servirModele } from "@/lib/espace-client/modeles";
import { formatDuModele, texteLienModele, typeDuModele, verifierModele } from "@/lib/espace-client/modeles-schema";
import { MODELES_CIMOB } from "@/lib/espace-client/seed";

const fichier = (nom: string, type: string, contenu = "contenu du modèle") => new File([contenu], nom, { type });
const formulaire = (champs: Record<string, string | File>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(champs)) fd.set(k, v);
  return fd;
};

beforeEach(async () => {
  process.env.ESPACE_CLIENT_DONNEES = "demo";
  await depot().reinitialiser();
});

describe("le jeu de démonstration en mémoire", () => {
  it("porte les modèles de Céline, rattachés aux pièces CIMOB/DICOM, sans fichier", async () => {
    const d = await depot().lire();
    expect(d.modeles_pieces.map((x) => x.id).sort()).toEqual(MODELES_CIMOB.map((x) => x.id).sort());
    for (const x of d.modeles_pieces) expect(d.document_requirements.some((r) => r.id === x.requirement_id), x.id).toBe(true);
    expect(modelesDe(d, "rq-cimob-cerfa").map((x) => x.libelle)).toEqual(["Modèle", "Exemple rempli"]);
    expect(await lireOctets(d.modeles_pieces[0].chemin)).toBeNull();
  });

  it("plus de pièce provisoire ; l'attestation de mutation du profil E est rattachée à la pièce de Céline", async () => {
    const d = await depot().lire();
    expect(d.document_requirements.some((r) => r.id === "rq-mil-mutation" || r.id === "rq-mil-carte")).toBe(false);
    expect(d.documents.find((x) => x.id === "doc-j2")).toMatchObject({ requirement_id: "rq-cimob-mutation", libelle: "Attestation de mutation" });
  });

  it("cloisonnement : le client CIMOB/DICOM lit les modèles de son segment, un particulier aucun", async () => {
    const d = await depot().lire();
    expect(restreindre(d, "cl-lefort").modeles_pieces).toHaveLength(MODELES_CIMOB.length);
    expect(restreindre(d, "cl-dumont").modeles_pieces).toEqual([]);
    expect(restreindre(d, "inconnu").modeles_pieces).toEqual([]);
  });
});

describe("les actions de l'équipe sur les modèles (démonstration)", () => {
  it("ajouter : le fichier rejoint la mémoire, la ligne prend le rang suivant", async () => {
    const r = await ajouterModele("rq-cimob-cerfa", formulaire({ fichier: fichier("notice.pdf", "application/pdf", "%PDF notice"), libelle: "Notice" }));
    expect(r).toMatchObject({ ok: true });
    const d = await depot().lire();
    const notice = modelesDe(d, "rq-cimob-cerfa").at(-1)!;
    expect(notice).toMatchObject({ libelle: "Notice", nom_fichier: "notice.pdf", mime: "application/pdf", ordre: 3, created_by: "Équipe (démonstration)" });
    expect(notice.chemin).toMatch(/^modeles\/rq-cimob-cerfa\/[0-9a-f]{8}-notice\.pdf$/);
    expect((await lireOctets(notice.chemin))?.donnees.toString()).toBe("%PDF notice");
  });

  it("un .doc annoncé sans type par le navigateur passe, par son extension ; sans libellé, c'est « Modèle »", async () => {
    const r = await ajouterModele("rq-cimob-mutation", formulaire({ fichier: fichier("attestation.doc", "") }));
    expect(r).toMatchObject({ ok: true });
    expect(modelesDe(await depot().lire(), "rq-cimob-mutation")).toMatchObject([{ libelle: "Modèle", mime: "application/msword", ordre: 1 }]);
  });

  it("remplacer : même ligne, nouveau fichier, l'ancien quitte la mémoire", async () => {
    await ajouterModele("rq-cimob-mutation", formulaire({ fichier: fichier("v1.pdf", "application/pdf", "v1") }));
    const [v1] = modelesDe(await depot().lire(), "rq-cimob-mutation");
    const r = await ajouterModele("rq-cimob-mutation", formulaire({ fichier: fichier("v2.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "v2"), remplace: v1.id }));
    expect(r).toMatchObject({ ok: true });
    const apres = modelesDe(await depot().lire(), "rq-cimob-mutation");
    expect(apres).toHaveLength(1);
    expect(apres[0]).toMatchObject({ id: v1.id, nom_fichier: "v2.docx", libelle: "Modèle", ordre: v1.ordre });
    expect(await lireOctets(v1.chemin)).toBeNull();
    expect((await lireOctets(apres[0].chemin))?.donnees.toString()).toBe("v2");
  });

  it("refuse un format qui n'est pas un modèle, une pièce inconnue, un remplacement d'une autre pièce", async () => {
    expect(await ajouterModele("rq-cimob-cerfa", formulaire({ fichier: fichier("outil.exe", "application/x-msdownload") }))).toMatchObject({ ok: false, erreurs: { fichier: expect.stringMatching(/format non accepté/) } });
    expect(await ajouterModele("rq-cimob-cerfa", formulaire({ libelle: "Sans fichier" }))).toMatchObject({ ok: false, erreurs: { fichier: "Choisissez un fichier." } });
    expect(await ajouterModele("rq-inexistante", formulaire({ fichier: fichier("a.pdf", "application/pdf") }))).toMatchObject({ ok: false, erreur: expect.stringMatching(/Pièce introuvable/) });
    const r = await ajouterModele("rq-cimob-mutation", formulaire({ fichier: fichier("a.pdf", "application/pdf"), remplace: "mo-cimob-cerfa" }));
    expect(r).toMatchObject({ ok: false, erreur: expect.stringMatching(/Modèle introuvable/) });
    expect(modelesDe(await depot().lire(), "rq-cimob-cerfa").map((x) => x.nom_fichier)).toEqual(["CERFA.pdf", "EXEMPLE CERFA.pdf"]);
  });

  it("retirer : la ligne et le fichier partent ; deux fois de suite, sans erreur", async () => {
    await ajouterModele("rq-cimob-mutation", formulaire({ fichier: fichier("a.pdf", "application/pdf") }));
    const [a] = modelesDe(await depot().lire(), "rq-cimob-mutation");
    expect(await retirerModele(a.id)).toMatchObject({ ok: true });
    expect(modelesDe(await depot().lire(), "rq-cimob-mutation")).toEqual([]);
    expect(await lireOctets(a.chemin)).toBeNull();
    expect(await retirerModele(a.id)).toMatchObject({ ok: true, message: "Ce modèle était déjà retiré." });
  });

  it("retirer une pièce emporte ses modèles", async () => {
    expect(await supprimerPiece("rq-cimob-cerfa")).toMatchObject({ ok: true });
    const d = await depot().lire();
    expect(d.document_requirements.some((r) => r.id === "rq-cimob-cerfa")).toBe(false);
    expect(d.modeles_pieces.some((x) => x.requirement_id === "rq-cimob-cerfa")).toBe(false);
    expect(d.modeles_pieces).toHaveLength(MODELES_CIMOB.length - 2);
  });

  it("l'éditeur pose, change et retire la condition d'une pièce", async () => {
    const base = { pays: "", segment: "militaire", libelle: "Attestation de mutation", description: "", obligatoire: true, ordre: "6" };
    expect(await enregistrerPiece("rq-cimob-mutation", { ...base, condition: "repli" })).toMatchObject({ ok: true });
    expect(await depot().trouver("document_requirements", "rq-cimob-mutation")).toMatchObject({ condition: "repli" });
    expect(await enregistrerPiece("rq-cimob-mutation", { ...base, condition: "" })).toMatchObject({ ok: true });
    expect((await depot().trouver("document_requirements", "rq-cimob-mutation"))?.condition).toBeNull();
    // Une pièce nouvelle sans condition ne porte pas la colonne : elle s'enregistre aussi sur une base sans la migration 0021.
    expect(await enregistrerPiece(null, { ...base, libelle: "Pièce sans condition" })).toMatchObject({ ok: true });
    const nouvelle = (await depot().lire()).document_requirements.find((r) => r.libelle === "Pièce sans condition")!;
    expect("condition" in nouvelle).toBe(false);
  });
});

describe("servirModele — la porte des modèles", () => {
  const url = (id: string) => new URL(`http://localhost${lienFichier("modele", id, { telecharger: true })}`);

  it("un modèle du jeu sans fichier : une page témoin en PDF, à télécharger", async () => {
    const r = await servirModele(await depot().lire(), "mo-cimob-cerfa", url("mo-cimob-cerfa"), () => true);
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("application/pdf");
    expect(r.headers.get("Content-Disposition")).toMatch(/^attachment; filename="CERFA\.pdf"/);
  });

  it("un modèle déposé par l'équipe : ses octets, en pièce jointe", async () => {
    await ajouterModele("rq-cimob-mutation", formulaire({ fichier: fichier("modele.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "DOCX") }));
    const [x] = modelesDe(await depot().lire(), "rq-cimob-mutation");
    const r = await servirModele(await depot().lire(), x.id, url(x.id), () => true);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("DOCX");
    expect(r.headers.get("Content-Disposition")).toMatch(/^attachment/);
  });

  it("sans droit sur la pièce : introuvable, comme un modèle qui n'existe pas", async () => {
    const d = await depot().lire();
    expect((await servirModele(d, "mo-cimob-cerfa", url("mo-cimob-cerfa"), () => false)).status).toBe(404);
    expect((await servirModele(d, "inconnu", url("inconnu"), () => true)).status).toBe(404);
  });

  it("un lien d'un autre modèle, altéré ou sans signature est refusé avant toute lecture", async () => {
    const d = await depot().lire();
    expect((await servirModele(d, "mo-cimob-cerfa", url("mo-cimob-cerfa-exemple"), () => true)).status).toBe(403);
    expect((await servirModele(d, "mo-cimob-cerfa", new URL("http://localhost/x"), () => true)).status).toBe(403);
  });
});

describe("modeles-schema — les formats d'un modèle", () => {
  it("Word, PDF, LibreOffice, tableur, images ; pas d'exécutable ni de HTML", () => {
    expect(typeDuModele({ name: "a.doc", type: "application/msword" })).toBe("application/msword");
    expect(typeDuModele({ name: "a.DOCX", type: "" })).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(typeDuModele({ name: "a.odt", type: "application/octet-stream" })).toBe("application/vnd.oasis.opendocument.text");
    expect(typeDuModele({ name: "a.html", type: "text/html" })).toBeNull();
    expect(typeDuModele({ name: "a.pdf", type: "text/html" })).toBeNull();
    expect(typeDuModele({ name: "a.exe", type: "" })).toBeNull();
    expect(verifierModele({ name: "gros.pdf", size: 11 * 1024 * 1024, type: "application/pdf" })).toMatch(/dépasse 10 Mo/);
    expect(verifierModele({ name: "vide.pdf", size: 0, type: "application/pdf" })).toBe("Choisissez un fichier.");
  });

  it("le texte du lien et le format affiché", () => {
    expect(texteLienModele("Modèle")).toBe("Télécharger le modèle");
    expect(texteLienModele("Exemple rempli")).toBe("Exemple rempli");
    expect(formatDuModele("CERTIFICAT DE NON CESSION.doc")).toBe("DOC");
  });
});

describe("en base, tant que la migration 0021 manque", () => {
  afterEach(() => {
    process.env.ESPACE_CLIENT_DONNEES = "demo";
    for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
  });

  it("la table des modèles absente : l'espace se lit sans elle, et l'éditeur le sait", async () => {
    delete process.env.ESPACE_CLIENT_DONNEES;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemple.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "cle-publique-de-test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "cle-de-service-de-test";
    const absente = { data: null, error: { code: "PGRST205", message: "Could not find the table 'public.ec_modeles_pieces' in the schema cache" } as { message: string } };
    m.service = fauxSupabase({ ec_modeles_pieces: absente, ec_document_requirements: { data: [{ id: "rq-1", pays: null, segment: null, libelle: "Pièce", description: "", obligatoire: true, ordre: 1 }] } }).client;
    const d = await depot().lire();
    expect(d.modeles_pieces).toEqual([]);
    expect(d.document_requirements).toHaveLength(1);
    expect(tableManquante("modeles_pieces")).toBe(true);
    // La migration appliquée : la marque s'efface à la lecture suivante.
    m.service = fauxSupabase({}).client;
    await depot().lire();
    expect(tableManquante("modeles_pieces")).toBe(false);
  });

  it("ajouter un modèle sans la migration : le message le dit, plutôt qu'une erreur de l'API", async () => {
    delete process.env.ESPACE_CLIENT_DONNEES;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemple.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "cle-publique-de-test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "cle-de-service-de-test";
    m.service = {
      ...fauxSupabase({
        ec_document_requirements: { data: { id: "rq-1", libelle: "Pièce", segment: "militaire" } },
        ec_modeles_pieces: { data: null, error: { message: "Could not find the table 'public.ec_modeles_pieces' in the schema cache" } },
      }).client,
      storage: { from: () => ({ upload: async () => ({ error: { message: "Bucket not found" } }), remove: async () => ({ error: null }) }) },
    };
    const r = await ajouterModele("rq-1", formulaire({ fichier: fichier("a.pdf", "application/pdf") }));
    expect(r).toMatchObject({ ok: false, erreur: expect.stringMatching(/migration 0021/) });
  });
});

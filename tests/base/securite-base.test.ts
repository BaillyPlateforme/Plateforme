/*
 * Le niveau « base » : les deux projets Supabase (recette et production),
 * vus de l'extérieur avec la clé publique — ce qu'a n'importe quel visiteur —
 * et de l'intérieur par le catalogue de Postgres.
 *
 * En production, la connexion Postgres est ouverte en LECTURE SEULE
 * (default_transaction_read_only) et aucune requête n'écrit : les essais
 * d'écriture anonyme ne se font qu'en recette ; en production on vérifie,
 * dans le catalogue, qu'aucune politique ne les permettrait.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RACINE, projet } from "../outils/config.mjs";

const BASES = (process.env.BASES ?? "recette,prod").split(",").map((b) => b.trim()) as ("recette" | "prod")[];

/** Les seaux de stockage publics voulus, et pourquoi. */
const SEAUX_PUBLICS: Record<string, string> = {
  "playground-photos": "la bibliothèque des photos d'exemple du formulaire (lib/library.ts, « bucket public »)",
};

/** Les fonctions SECURITY DEFINER que le client connecté (authenticated) doit pouvoir appeler : ses politiques RLS s'en servent. */
const DEFINER_CLIENT = ["ec_client_courant", "ec_dossiers_courants", "ec_voit_devis", "ec_voit_factures"];

const FICHIERS_MIGRATIONS = fs
  .readdirSync(path.join(RACINE, "supabase/migrations"))
  .filter((f) => /^\d{4}_[\w-]+\.sql$/.test(f))
  .sort()
  .map((f) => ({ version: f.replace(/\.sql$/, ""), empreinte: createHash("sha256").update(fs.readFileSync(path.join(RACINE, "supabase/migrations", f), "utf8")).digest("hex") }));

for (const nom of BASES) {
  describe(`base ${nom}`, () => {
    const p = projet(nom);
    let db: pg.Client;
    const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as T[];
    const anon = { apikey: p.anon, Authorization: `Bearer ${p.anon}`, "Content-Type": "application/json" };
    let tablesPubliques: string[] = [];

    beforeAll(async () => {
      expect(p.url && p.anon && p.db, `accès à la base ${nom} introuvables`).toBeTruthy();
      db = new pg.Client({ connectionString: p.db!, ssl: { rejectUnauthorized: false } });
      await db.connect();
      await db.query("set default_transaction_read_only = on");
      tablesPubliques = (await q<{ t: string }>("select c.relname t from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','v','m','p') order by 1")).map((r) => r.t);
    });
    afterAll(async () => {
      await db?.end();
    });

    describe("authentification", () => {
      it("les inscriptions publiques sont fermées", async () => {
        const reglages = await (await fetch(`${p.url}/auth/v1/settings`, { headers: anon })).json();
        expect(reglages.disable_signup).toBe(true);
      });

      it("une tentative d'inscription est refusée", async () => {
        const r = await fetch(`${p.url}/auth/v1/signup`, { method: "POST", headers: anon, body: JSON.stringify({ email: "batterie.inscription@example.com", password: "Inscription-Refusee-1!" }) });
        expect(r.status).toBeGreaterThanOrEqual(400);
        expect(await r.text()).toMatch(/signup|disabled|not allowed/i);
      });

      it("aucun compte sans rôle n'existe hors de l'équipe (un tel compte entrerait comme membre)", async () => {
        const orphelins = await q<{ email: string }>(
          `select u.email from auth.users u
            where coalesce(u.raw_app_meta_data->>'role', '') = ''
              and lower(u.email) not in (select lower(email) from public.team_members)
              and u.banned_until is null
              and lower(u.email) not like 'batterie.%'`,
        );
        expect(orphelins.map((o) => o.email)).toEqual([]);
      });

      it("aucun compte n'a un rôle inconnu", async () => {
        const r = await q<{ role: string; n: number }>(
          "select raw_app_meta_data->>'role' role, count(*)::int n from auth.users where coalesce(raw_app_meta_data->>'role','') not in ('', 'rh', 'client', 'terrain') and banned_until is null and lower(email) not like 'batterie.%' group by 1",
        );
        expect(r).toEqual([]);
      });

      it("l'équipe a au moins un administrateur actif", async () => {
        const [{ n }] = await q<{ n: number }>("select count(*)::int n from public.team_members where actif and role = 'admin'");
        expect(n).toBeGreaterThan(0);
      });
    });

    describe("cloisonnement (RLS)", () => {
      it("toutes les tables de public et de crm ont la sécurité au niveau des lignes", async () => {
        const sans = await q<{ t: string }>(
          "select n.nspname||'.'||c.relname t from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public','crm') and c.relkind in ('r','p') and not c.relrowsecurity order by 1",
        );
        expect(sans.map((x) => x.t)).toEqual([]);
      });

      it("aucune politique n'ouvre une table à anon ou à public", async () => {
        const r = await q<{ t: string; policyname: string }>(
          "select schemaname||'.'||tablename t, policyname from pg_policies where schemaname in ('public','crm','storage') and (roles && array['anon','public']::name[])",
        );
        expect(r).toEqual([]);
      });

      it("aucune politique n'est grande ouverte (« true ») pour un compte connecté", async () => {
        const r = await q<{ t: string; policyname: string }>(
          "select schemaname||'.'||tablename t, policyname from pg_policies where schemaname in ('public','crm','storage') and (btrim(coalesce(qual,'')) = 'true' or btrim(coalesce(with_check,'')) = 'true')",
        );
        expect(r).toEqual([]);
      });

      it("un compte connecté ne peut qu'y lire : aucune politique d'écriture pour authenticated", async () => {
        const r = await q<{ t: string; cmd: string }>(
          "select schemaname||'.'||tablename t, cmd from pg_policies where schemaname in ('public','crm') and cmd <> 'SELECT' and (roles && array['authenticated']::name[])",
        );
        expect(r).toEqual([]);
      });

      it("chaque table ouverte au client connecté filtre par son client ou ses dossiers", async () => {
        const r = await q<{ t: string; qual: string }>(
          "select tablename t, qual from pg_policies where schemaname = 'public' and (roles && array['authenticated']::name[])",
        );
        expect(r.length).toBeGreaterThan(0);
        for (const x of r) expect(x.qual, x.t).toMatch(/ec_client_courant|ec_dossiers_courants/);
      });

      it("le schéma crm n'est pas exposé par l'API REST", async () => {
        const r = await fetch(`${p.url}/rest/v1/clients?select=*&limit=1`, { headers: { ...anon, "Accept-Profile": "crm" } });
        expect(r.status).toBeGreaterThanOrEqual(400);
      });
    });

    describe("la clé publique, comme un visiteur", () => {
      it("ne lit aucune ligne d'aucune table de public", async () => {
        const fuites: string[] = [];
        for (const t of tablesPubliques) {
          const r = await fetch(`${p.url}/rest/v1/${t}?select=*&limit=1`, { headers: anon });
          const texte = await r.text();
          if (r.ok && texte.trim().startsWith("[{")) fuites.push(t);
        }
        expect(fuites).toEqual([]);
      });

      it.runIf(nom === "recette")("n'écrit dans aucune table de public (essai réel, en recette)", async () => {
        const acceptees: string[] = [];
        for (const t of tablesPubliques) {
          const r = await fetch(`${p.url}/rest/v1/${t}`, { method: "POST", headers: { ...anon, Prefer: "return=minimal" }, body: "{}" });
          if (r.status < 300) acceptees.push(`${t} (${r.status})`);
        }
        expect(acceptees).toEqual([]);
      });

      it("ne modifie ni n'efface rien (essai sur une ligne impossible)", async () => {
        for (const t of ["requests", "settings", "team_members", "envois", "compteurs_jour"]) {
          const maj = await fetch(`${p.url}/rest/v1/${t}?id=eq.00000000-0000-0000-0000-000000000000`, { method: "PATCH", headers: { ...anon, Prefer: "return=representation" }, body: "{}" });
          expect(await maj.text(), `PATCH ${t}`).not.toMatch(/^\[\{/);
          const eff = await fetch(`${p.url}/rest/v1/${t}?id=eq.00000000-0000-0000-0000-000000000000`, { method: "DELETE", headers: { ...anon, Prefer: "return=representation" } });
          expect(await eff.text(), `DELETE ${t}`).not.toMatch(/^\[\{/);
        }
      });

      it("ne peut appeler aucune fonction SECURITY DEFINER, ni le compteur du jour", async () => {
        const r = await q<{ f: string }>(
          "select p.proname f from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE')",
        );
        expect(r.map((x) => x.f)).toEqual([]);
        const rpc = await fetch(`${p.url}/rest/v1/rpc/reserver_compteur_jour`, { method: "POST", headers: anon, body: JSON.stringify({ p_cle: "batterie", p_n: -1000, p_max: 0 }) });
        expect(rpc.status).toBeGreaterThanOrEqual(400);
      });

      it("ne liste aucun seau de stockage privé", async () => {
        const seaux = await q<{ id: string; public: boolean }>("select id, public from storage.buckets");
        for (const s of seaux.filter((x) => !x.public)) {
          const r = await fetch(`${p.url}/storage/v1/object/list/${s.id}`, { method: "POST", headers: anon, body: JSON.stringify({ prefix: "", limit: 5 }) });
          expect((await r.text()).trim().startsWith("[{"), `seau ${s.id}`).toBe(false);
        }
      });
    });

    describe("fonctions et stockage", () => {
      it("toute fonction SECURITY DEFINER fixe son search_path", async () => {
        const r = await q<{ f: string }>(
          "select p.proname f from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','crm') and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) x where x like 'search_path=%')",
        );
        expect(r.map((x) => x.f)).toEqual([]);
      });

      it("seules les fonctions des politiques du client sont SECURITY DEFINER et ouvertes à authenticated", async () => {
        const r = await q<{ f: string }>(
          "select p.proname f from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'EXECUTE') order by 1",
        );
        expect(r.map((x) => x.f).filter((f) => !DEFINER_CLIENT.includes(f))).toEqual([]);
      });

      it("seuls les seaux voulus sont publics", async () => {
        const publics = (await q<{ id: string }>("select id from storage.buckets where public")).map((x) => x.id);
        expect(publics.filter((s) => !(s in SEAUX_PUBLICS))).toEqual([]);
      });
    });

    describe("schéma et données", () => {
      it("chaque fichier de migration est inscrit au registre, avec la même empreinte", async () => {
        const registre = new Map((await q<{ version: string; empreinte: string }>("select version, empreinte from public.schema_migrations")).map((r) => [r.version, r.empreinte]));
        const manquantes = FICHIERS_MIGRATIONS.filter((m) => !registre.has(m.version)).map((m) => m.version);
        const modifiees = FICHIERS_MIGRATIONS.filter((m) => registre.has(m.version) && registre.get(m.version) !== m.empreinte).map((m) => m.version);
        expect({ manquantes, modifiees }).toEqual({ manquantes: [], modifiees: [] });
      });

      it("le registre ne cite aucune migration absente du dépôt", async () => {
        const versions = new Set(FICHIERS_MIGRATIONS.map((m) => m.version));
        const inconnues = (await q<{ version: string }>("select version from public.schema_migrations")).map((r) => r.version).filter((v) => !versions.has(v));
        expect(inconnues).toEqual([]);
      });

      it("la ligne des réglages existe, et une seule", async () => {
        const [{ n }] = await q<{ n: number }>("select count(*)::int n from public.settings");
        expect(n).toBe(1);
      });

      it("une grille tarifaire existe (sinon aucune estimation)", async () => {
        const [{ n }] = await q<{ n: number }>("select count(*)::int n from public.pricing_grids");
        expect(n).toBeGreaterThan(0);
      });

      it("le compteur du jour existe et n'est lisible que par le service", async () => {
        const [{ existe }] = await q<{ existe: boolean }>("select to_regclass('public.compteurs_jour') is not null existe");
        expect(existe).toBe(true);
        const [{ lit }] = await q<{ lit: boolean }>("select has_table_privilege('anon', 'public.compteurs_jour', 'SELECT') or has_table_privilege('authenticated', 'public.compteurs_jour', 'SELECT') lit");
        expect(lit).toBe(false);
      });

      it("toute demande a une adresse e-mail et une date de création", async () => {
        const [{ n }] = await q<{ n: number }>("select count(*)::int n from public.requests where coalesce(btrim(client_email), '') = '' or created_at is null");
        expect(n).toBe(0);
      });

      it("aucun envoi n'est resté « en cours » plus d'une heure", async () => {
        const statuts = (await q<{ statut: string; n: number }>("select statut, count(*)::int n from public.envois where traite_le is null and cree_le < now() - interval '1 hour' group by 1"));
        expect(statuts).toEqual([]);
      });

      it.runIf(nom === "prod")("la production ne contient aucune donnée de démonstration", async () => {
        const r = {
          ec_clients_demo: (await q<{ n: number }>("select count(*)::int n from public.ec_clients where demo"))[0].n,
          agents_terrain_demo: (await q<{ n: number }>("select count(*)::int n from crm.agents_terrain where demo"))[0].n,
          comptes_batterie: (await q<{ n: number }>("select count(*)::int n from auth.users where email like 'batterie.%'"))[0].n,
        };
        expect(r).toEqual({ ec_clients_demo: 0, agents_terrain_demo: 0, comptes_batterie: 0 });
      });
    });
  });
}

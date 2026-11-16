import { describe, expect, it } from "vitest";
import { SCHEMA_DISCUSSION } from "@/lib/espace-client/discussion-schema";
import { SCHEMA_TUTOS_VUS } from "@/lib/espace-client/tutos-vus-schema";
import { RETENTION_JOURS, SCHEMA_SUIVI } from "@/lib/suivi-envois/schema";

/*
 * Les tables créées au démarrage, en une requête idempotente. Le cloisonnement
 * annoncé par leurs commentaires : la clé publique ne lit que ce que la RLS lui
 * rend, et n'écrit rien (ni politique d'écriture, ni privilège).
 */

const normal = (sql: string) => sql.replace(/\s+/g, " ").toLowerCase();

describe("SCHEMA_DISCUSSION (ec_messages)", () => {
  const sql = normal(SCHEMA_DISCUSSION);

  it("ne fait rien quand la table existe déjà ou sans l'espace client", () => {
    expect(sql).toContain("if to_regclass('public.ec_dossiers') is null or to_regclass('public.ec_messages') is not null then return;");
  });

  it("prend un verrou consultatif avant de créer la table, puis revérifie", () => {
    const verrou = sql.indexOf("pg_advisory_xact_lock");
    const creation = sql.indexOf("create table public.ec_messages");
    expect(verrou).toBeGreaterThan(0);
    expect(creation).toBeGreaterThan(verrou);
    expect(sql.slice(verrou, creation)).toContain("to_regclass('public.ec_messages') is not null");
  });

  it("retire tout privilège à anon et authenticated, puis ne rend que la lecture", () => {
    expect(sql).toContain("revoke all on table public.ec_messages from anon, authenticated;");
    expect(sql).toContain("grant select on table public.ec_messages to authenticated;");
    expect(sql).not.toMatch(/grant (insert|update|delete|all|truncate|references|trigger)/);
    expect(sql).not.toMatch(/grant [^;]* to [^;]*anon/);
  });

  it("active la RLS, et ses seules politiques sont des lectures de la session", () => {
    expect(sql).toContain("alter table public.ec_messages enable row level security;");
    const politiques = sql.match(/create policy [^;]*;/g) ?? [];
    expect(politiques).toHaveLength(1);
    expect(politiques[0]).toContain("for select to authenticated");
    expect(politiques[0]).toContain("using (dossier_id in (select public.ec_dossiers_courants()))");
    expect(sql).not.toMatch(/for (insert|update|delete|all)\b/);
  });

  it("borne le corps à 4000 caractères et exige un contenu", () => {
    expect(sql).toContain("check (length(corps) <= 4000)");
    expect(sql).toContain("check (btrim(corps) <> '' or piece_chemin is not null)");
  });

  it("un message de l'équipe porte son auteur, celui du client n'en porte pas", () => {
    expect(sql).toContain("check (auteur in ('client', 'equipe'))");
    expect(sql).toContain("check ((auteur = 'client') = (equipe_id is null))");
  });

  it("est une seule instruction DO, sans point-virgule hors du bloc", () => {
    const t = SCHEMA_DISCUSSION.trim();
    expect(t.startsWith("do $discussion$")).toBe(true);
    expect(t.endsWith("$discussion$;")).toBe(true);
    expect(t.split("$discussion$").length).toBe(3);
  });
});

describe("SCHEMA_TUTOS_VUS (ec_tutos_vus)", () => {
  const sql = normal(SCHEMA_TUTOS_VUS);

  it("ne fait rien sans ec_tutos ni ec_clients, ou si la table existe", () => {
    expect(sql).toContain("to_regclass('public.ec_tutos') is null or to_regclass('public.ec_clients') is null or to_regclass('public.ec_tutos_vus') is not null");
  });

  it("une seule ligne par client et par tutoriel, deux façons de le voir", () => {
    expect(sql).toContain("primary key (client_id, tuto_id)");
    expect(sql).toContain("check (par in ('bouton', 'video'))");
  });

  it("cloisonnée : privilèges retirés, lecture seule du client de la session", () => {
    expect(sql).toContain("revoke all on table public.ec_tutos_vus from anon, authenticated;");
    expect(sql).toContain("grant select on table public.ec_tutos_vus to authenticated;");
    expect(sql).not.toMatch(/grant (insert|update|delete|all)/);
    expect(sql).toContain("alter table public.ec_tutos_vus enable row level security;");
    const politiques = sql.match(/create policy [^;]*;/g) ?? [];
    expect(politiques).toHaveLength(1);
    expect(politiques[0]).toContain("for select to authenticated using (client_id = (select public.ec_client_courant()))");
  });
});

describe("SCHEMA_SUIVI (envois_liens, envois_evenements)", () => {
  const sql = normal(SCHEMA_SUIVI);

  it("garde 13 mois", () => {
    expect(RETENTION_JOURS).toBe(395);
  });

  it("fermé à la clé publique : RLS sans aucune politique, privilèges retirés", () => {
    expect(sql).toContain("revoke all on table public.envois_liens, public.envois_evenements from anon, authenticated;");
    expect(sql).toContain("alter table public.envois_liens enable row level security;");
    expect(sql).toContain("alter table public.envois_evenements enable row level security;");
    expect(sql).not.toContain("create policy");
    expect(sql).not.toMatch(/\bgrant\b/);
  });

  it("la destination d'un lien est gardée chiffrée, jamais en clair complète", () => {
    expect(sql).toContain("url_chiffree text not null");
  });

  it("ne garde aucune adresse IP en clair : son empreinte seulement", () => {
    expect(sql).toContain("empreinte_ip text");
    expect(sql).not.toMatch(/\bip\s+(text|inet|cidr)\b/);
  });

  it("n'admet qu'une liste fermée de types d'événement", () => {
    expect(sql).toContain("check (type in ('delivre', 'ouverture', 'clic', 'rebond', 'plainte', 'desinscription', 'portail', 'action'))");
  });

  it("idempotent : chaque création est « if not exists »", () => {
    const creations = sql.match(/create (table|index) [a-z_]+/g) ?? [];
    expect(creations.length).toBeGreaterThan(0);
    for (const c of sql.match(/create (table|index) [^(]*/g) ?? []) expect(c).toContain("if not exists");
  });
});

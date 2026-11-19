/*
 * Les onglets du menu masqués, rôle par rôle (src/crm/onglets/regles.ts),
 * ajoutés au schéma du CRM (crm/lib/schema.ts) et rejoués à chaque
 * démarrage : idempotent. Une ligne = une page du menu masquée pour un rôle
 * (« agent » ou « admin ») ; aucune ligne, le menu complet.
 */
export const SCHEMA_ONGLETS = `
create table if not exists crm.onglets_masques (
  href text not null,
  role text not null check (role in ('agent','admin')),
  masque_par text,
  masque_le timestamptz not null default now(),
  primary key (href, role)
);
alter table crm.onglets_masques enable row level security;
`;

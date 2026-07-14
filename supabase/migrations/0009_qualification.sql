-- ============================================================
-- 0009 — Qualification : configuration du scoring des demandes
-- ============================================================
create table if not exists qualification_config (
  id          boolean primary key default true,
  criteria    jsonb not null default '[]'::jsonb,  -- [{key,label,description,enabled,poids,target,floor,invert}]
  updated_at  timestamptz not null default now(),
  constraint qualification_config_singleton check (id)
);
create trigger qualification_config_set_updated_at
  before update on qualification_config for each row execute function set_updated_at();

alter table qualification_config enable row level security;

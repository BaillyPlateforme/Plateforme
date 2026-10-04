-- Les demandes de rappel.
--
-- Le client, au bout de son estimation, peut demander à être rappelé. Chaque
-- demande devient une carte dans un tableau dédié, classée par priorité : le
-- score de potentiel de la demande, figé au moment du clic — il sert à décider
-- qui l'on rappelle en premier, et ne doit pas bouger si le score est recalculé.

create table if not exists rappels (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references requests(id) on delete cascade,
  devis_id    uuid references devis(id) on delete set null,
  statut      text not null default 'a_rappeler',  -- a_rappeler | en_cours | rappele | injoignable | clos
  priorite    integer not null default 0,          -- score de potentiel, 0 à 100
  montant_ttc numeric(10,2),                       -- figé : ce que valait l'estimation
  creneau     text,                                -- ce que le client a indiqué
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists rappels_statut_priorite_idx
  on rappels (statut, priorite desc, created_at);

-- Une demande n'a qu'un rappel ouvert à la fois : un client qui reclique ne
-- doit pas créer une seconde carte.
create unique index if not exists rappels_request_ouvert_idx
  on rappels (request_id)
  where statut in ('a_rappeler', 'en_cours');

create trigger rappels_set_updated_at
  before update on rappels for each row execute function set_updated_at();

alter table rappels enable row level security;
-- Écriture par la clé de service uniquement, comme le reste.

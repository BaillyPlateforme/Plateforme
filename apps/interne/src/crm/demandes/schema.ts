/*
 * Le prestige de l'adresse d'une demande (demande de David, 08/11/2026 :
 * « une vue par potentiel, avec une vue araignée, difficulté, prestige de
 * l'adresse »). Aucun score n'existait : il se calcule sur une donnée
 * publique, jamais inventée.
 *
 * - crm.dvf_communes : le prix médian au m² des logements vendus (maisons et
 *   appartements) de chaque commune — arrondissement pour Paris, Lyon et
 *   Marseille —, sur les ventes DVF 2021–2025. Source : « Statistiques DVF »
 *   (data.gouv.fr, Licence Ouverte 2.0), fichier stats_whole_period.csv.
 *   prestige : la part des ventes de logements faites en France dans une
 *   commune moins chère (rang centile pondéré par les ventes, 0 à 100) ;
 *   vide sous 5 ventes (pas assez pour un prix fiable). Rempli et rafraîchi
 *   par scripts/importer-dvf.mjs (deux fois par an, avec la donnée DVF).
 * - crm.communes_demandes : la commune (code INSEE) de chaque ville saisie
 *   dans une demande, trouvée une fois par le géocodeur de la Base Adresse
 *   Nationale (Géoplateforme), et gardée : la clé est « code postal|ville ».
 *
 * Rejoué à chaque démarrage : idempotent.
 */
export const SCHEMA_PRESTIGE = `
create table if not exists crm.dvf_communes (
  code_insee text primary key,
  libelle text not null,
  prix_m2_median int not null,
  ventes int not null,
  prestige smallint check (prestige between 0 and 100),
  periode text not null,
  source_maj date,
  importe_le timestamptz not null default now()
);
alter table crm.dvf_communes enable row level security;
create table if not exists crm.communes_demandes (
  cle text primary key,
  code_insee text,
  libelle text,
  resolu_le timestamptz not null default now()
);
alter table crm.communes_demandes enable row level security;
`;

-- Le réglage « résultat instantané » des questionnaires (Paramètres de l'espace équipe).
-- La colonne avait été ajoutée à la main sur la première base, sans migration :
-- une base neuve ne l'avait pas, et l'enregistrement des paramètres y échouait.
alter table public.settings add column if not exists resultat_instantane boolean not null default false;

-- ============================================================
-- 0022 — Le fournisseur de chaque envoi (bascule de Brevo vers Twilio)
-- ============================================================
--
-- Décision de David (18/11/2026) : les e-mails passent par Twilio SendGrid, les
-- SMS par Twilio, à la place de Brevo. Le journal des envois (public.envois,
-- migration 0013) garde désormais le nom du fournisseur de chaque message :
-- 'brevo', 'sendgrid' ou 'twilio' — null quand le message n'est allé chez
-- personne (journalisé, bloqué, fictif…).
--
-- POUR MÉMOIRE : le code n'attend pas cette migration. Tant que la colonne
-- manque, le statut s'inscrit sans elle (packages/commun/src/lib/envois/journal.ts),
-- et les écrans déduisent le fournisseur de la forme de l'identifiant du
-- message (fournisseurDe, envois/fournisseurs.ts). Pas de contrainte sur les
-- valeurs : un fournisseur de plus ne doit pas faire échouer l'écriture d'un
-- statut.
--
-- L'identifiant du message reste dans la colonne brevo_id, quel que soit le
-- fournisseur : la renommer casserait le code en service le temps du
-- déploiement. Elle reçoit seulement un commentaire qui le dit.
--
-- Les lignes déjà parties sont rattachées à leur fournisseur d'après la forme
-- de leur identifiant — la même règle que fournisseurDe : « SM… » ou « MM… »
-- suivi de 32 caractères hexadécimaux, Twilio ; un Message-ID (« <…@…> ») ou
-- un numéro, Brevo ; tout autre identifiant, SendGrid. Seules les lignes sans
-- fournisseur sont touchées.
--
-- Rien d'autre n'est modifié. Idempotente : elle se rejoue sans effet.
-- Appliquée par scripts/appliquer-migrations.mjs, dans une transaction.

alter table public.envois add column if not exists fournisseur text;

update public.envois
   set fournisseur = case
         when brevo_id ~* '^(SM|MM)[0-9a-f]{32}$' then 'twilio'
         when brevo_id like '%@%' or brevo_id ~ '^[0-9]+$' then 'brevo'
         else 'sendgrid'
       end
 where fournisseur is null
   and nullif(btrim(brevo_id), '') is not null;

comment on column public.envois.fournisseur is 'Le fournisseur qui a reçu le message : brevo, sendgrid ou twilio (null : il n''est allé chez personne).';
comment on column public.envois.brevo_id is 'L''identifiant du message chez son fournisseur (Brevo, SendGrid ou Twilio), malgré le nom de la colonne.';

-- L'API recharge son schéma pour voir la colonne nouvelle.
notify pgrst, 'reload schema';

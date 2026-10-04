-- Modèles de messages : ce qu'ils emportent.
--
-- Une colonne `options` : pour l'instant la pièce jointe, demain autre chose.
--
-- Cette migration est FACULTATIVE. Sans elle, un message qui montre
-- l'estimation la joint en PDF, d'office. Avec elle, l'équipe peut en décider
-- modèle par modèle depuis l'éditeur (« Pièce jointe : aucune / l'estimation »).
--
-- Les contenus par défaut ne sont plus semés ici : ils vivent dans le code
-- (src/lib/email-defauts.ts), qui remplace tout modèle resté mot pour mot à
-- son texte d'origine par sa version complète. Rien à réécrire en base.

alter table message_templates
  add column if not exists options jsonb not null default '{}'::jsonb;

comment on column message_templates.options is
  'Options du modèle. piece_jointe = ''estimation'' joint le PDF de l''estimation ; null ne joint rien.';

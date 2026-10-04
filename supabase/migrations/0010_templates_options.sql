-- Modèles de messages : ce qu'ils emportent, et des contenus par défaut propres.
--
-- 1. Une colonne `options` : pour l'instant la pièce jointe, demain autre chose.
-- 2. Les modèles livrés avec l'application, réécrits en blocs — le corps se
--    compose de phrases et de jetons `{{bloc_…}}` que le rendu transforme en
--    tableaux, boutons et encadrés mis en page.
--
-- Le remplacement des contenus ne touche QUE les modèles encore à leur texte
-- d'origine : un message retouché par l'équipe n'est jamais écrasé.

alter table message_templates
  add column if not exists options jsonb not null default '{}'::jsonb;

comment on column message_templates.options is
  'Options du modèle. piece_jointe = ''estimation'' joint le PDF de l''estimation.';

-- ── Les modèles par défaut ────────────────────────────────────────────────

-- Accusé de réception → devient le message qui porte l'estimation.
-- Céline : « je ne vois pas l'intérêt de ce mail puisque le client a
-- l'estimation en fin de processus ; le mieux serait qu'il reçoive
-- l'estimation en PDF ».
insert into message_templates (name, channel, event, sujet, contenu, options, active)
values (
  'Email — Votre estimation',
  'email',
  'devis_cree',
  'Votre estimation de déménagement — {{entreprise_nom}}',
  'Bonjour {{client_nom}},

Merci de votre confiance. Voici l''estimation de votre déménagement, établie sur notre grille tarifaire à partir des informations que vous nous avez transmises. Vous la retrouverez également en pièce jointe.

{{bloc_recapitulatif}}

{{bloc_estimation}}

{{bouton_estimation}}

Cette estimation vaut pour un déménagement dans des conditions normales d''accès. Un conseiller la confirme après échange avec vous — par téléphone ou lors d''une visite technique, gratuite et sans engagement.

Si elle vous convient, appelez-nous : nous bloquons votre date et vous recevez un devis ferme sous 24 heures ouvrées.

{{bloc_contact}}

À très bientôt,
L''équipe {{entreprise_nom}}',
  '{"piece_jointe": "estimation"}'::jsonb,
  true
)
on conflict do nothing;

-- Demande incomplète : il manque des informations pour chiffrer.
insert into message_templates (name, channel, event, sujet, contenu, options, active)
values (
  'Email — Il nous manque quelques informations',
  'email',
  'demande_incomplete',
  'Votre demande de déménagement — il nous manque quelques informations',
  'Bonjour {{client_nom}},

Nous avons bien reçu votre demande de déménagement de {{ville_depart}} vers {{ville_arrivee}}.

Pour vous donner une estimation juste, il nous manque encore quelques éléments. Cela vous prendra deux minutes.

{{bouton_completer}}

Dès que ce sera fait, vous recevrez votre estimation détaillée.

{{bloc_contact}}

À très bientôt,
L''équipe {{entreprise_nom}}',
  '{}'::jsonb,
  true
)
on conflict do nothing;

-- Envoi du devis ferme par le commercial.
insert into message_templates (name, channel, event, sujet, contenu, options, active)
values (
  'Email — Votre devis',
  'email',
  'devis_envoye',
  'Votre devis {{reference}} — {{entreprise_nom}}',
  'Bonjour {{client_nom}},

Voici votre devis pour le déménagement de {{ville_depart}} vers {{ville_arrivee}}. Il est joint à ce message.

{{bloc_recapitulatif}}

{{bloc_estimation}}

Ce devis est valable jusqu''au {{validite}}. Pour le confirmer, répondez simplement à ce message ou appelez-nous.

{{bloc_contact}}

Bien à vous,
L''équipe {{entreprise_nom}}',
  '{"piece_jointe": "estimation"}'::jsonb,
  true
)
on conflict do nothing;

-- 0006 — Distingue workflows (auto vers client) et alertes (notif équipe)
alter table alerts add column if not exists kind text not null default 'alerte';
-- Rétro-classement : destinataire client => workflow, sinon alerte
update alerts set kind = 'workflow' where destinataire = 'client';
update alerts set kind = 'alerte' where destinataire = 'custom';

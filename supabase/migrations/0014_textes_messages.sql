-- ============================================================
-- 0014 — Les textes des messages de l'espace client, depuis le catalogue du CRM
-- ============================================================
--
-- « Courriers et SMS » (apps/interne/src/crm/messages) fait de
-- crm.modeles_messages le catalogue unique des messages : les modèles du CRM,
-- et ceux de l'espace client au client (clés `ec_…`). L'espace client envoie
-- aussi depuis l'app externe, qui ne parle qu'à l'API de Supabase — et le
-- schéma crm n'y est pas exposé. Cette fonction lui rend, en lecture seule,
-- les seules lignes de l'espace client : leur texte et si elles sont actives.
--
-- Réservée à la clé de service, comme les fonctions de 0012. Elle ne résout
-- crm.modeles_messages qu'à l'exécution : sur une base où le CRM n'a pas encore
-- posé les colonnes nouvelles, elle échoue, et l'espace client garde ses
-- textes de départ (textes-messages.ts).
--
-- Rien d'existant n'est modifié. Idempotente.

create or replace function public.ec_textes_messages()
returns table (cle text, canal text, objet text, corps text, actif boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
    select m.cle, m.canal, m.objet, m.corps, m.actif
      from crm.modeles_messages m
     where m.cle like 'ec\_%';
end;
$$;

revoke all on function public.ec_textes_messages() from public, anon, authenticated;
grant execute on function public.ec_textes_messages() to service_role;

notify pgrst, 'reload schema';

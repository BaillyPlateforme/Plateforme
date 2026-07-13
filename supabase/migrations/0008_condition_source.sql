-- 0008 — Condition "source" (formulaire vs mail) sur les règles de workflow
alter table alerts add column if not exists condition_source text; -- 'form' | 'email'

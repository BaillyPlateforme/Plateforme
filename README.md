# Bailly Déménagement — Plateforme

Plateforme interne de réception, analyse et qualification des demandes de déménagement.

## Stack

- **Next.js 16** (App Router, TypeScript) — front + API, déployé sur **Railway**
- **Supabase** — Postgres, Auth (équipe), Storage (photos). Source de vérité unique.
- **Zod** — schémas partagés form ↔ API ↔ IA
- **Gemini 3.1 Pro** (`@google/genai`) — analyse de volume par image (modèle configurable via `GEMINI_MODEL`)
- **n8n** — uniquement ingestion des mails + notifications

## Architecture

```
Formulaire ──┐
             ├──► POST /api/requests ──► requests (Supabase) ──► scoring ──► Dashboard
Mail ──(n8n)─┘         (source unique)
```

Le formulaire public et n8n (mail parsé) postent sur **le même endpoint** `POST /api/requests`.
n8n signale la source via l'en-tête `x-request-source: email`.

## Démarrage

```bash
cp .env.local.example .env.local   # puis remplir les clés Supabase + Gemini
npm install
npm run dev
```

Appliquer le schéma sur Supabase : exécuter `supabase/migrations/0001_init.sql`
dans le SQL Editor Supabase (ou via la CLI `supabase db push`).

## Structure

```
src/
  app/
    page.tsx              Landing interne
    dashboard/            Liste des demandes (lecture)
    api/requests/         Endpoint unique de création (form + mail)
  lib/
    schemas.ts            Schémas Zod partagés
    requests.ts           Logique métier (création, listing)
    types.ts              Types DB (manuels pour l'instant)
    env.ts                Accès typé aux variables d'env
    supabase/server.ts    Client service_role (back-end)
supabase/
  migrations/0001_init.sql
```

## Feuille de route

1. ✅ Socle : Next.js + Supabase + schéma DB + endpoint + dashboard lecture
2. ⬜ Formulaire multi-étapes (dont étape Volume : explicite / liste / IA)
3. ⬜ Fiche détail d'une demande (`/dashboard/[id]`)
4. ✅ Analyse volume IA (`/api/analyze-volume`, sortie structurée Gemini)
5. ⬜ Scoring potentiel / difficulté
6. ⬜ Ingestion mail via n8n
7. ⬜ Stats & notifications

# Guide n8n — Mails entrants → Demandes Bailly (extraction IA)

Objectif : chaque email de demande reçu est **lu par un agent OpenAI** qui en extrait les
informations **structurées** (nom, téléphone, ville de départ, ville d'arrivée, volume), puis
envoyées à la plateforme, qui crée une **demande**. Si une info manque encore, la plateforme
envoie au client un **lien de complétion** (workflows _Messagerie → Workflow_).

**Flux : Email (IMAP) → Agent OpenAI (Information Extractor) → Code (fusion) → HTTP POST**

---

## 0. Prérequis

- Accès à l'instance **n8n**.
- Identifiants **IMAP** de la boîte mail qui reçoit les demandes (host, port 993 SSL, login, mdp).
- Une **clé API OpenAI**.
- L'**URL publique de la plateforme** (Railway), ex. `https://bailly-plateforme.up.railway.app`
  → endpoint appelé : `https://<cette-url>/api/emails-entrants`.

---

## 1. Import du workflow (recommandé)

Fichier fourni : **[`n8n-bailly-workflow.json`](./n8n-bailly-workflow.json)**.

1. n8n → **⋮ (haut-droite) → Import from File** → choisir le fichier.
2. Le workflow apparaît avec 4 nodes déjà reliés (dont la liaison IA).
3. Configurer les 3 credentials / réglages ci-dessous (§2 à §4).
4. **Save** → **Active**.

---

## 2. Node « Email Trigger (IMAP) »

- **Credential IMAP** à créer : Host, Port `993`, SSL/TLS, User, Password.
- Paramètres : **Mailbox** `INBOX`, **Format** `Resolved`, post-traitement `Mark as read`.
- Sortie : `subject`, `from`, `textPlain`, `textHtml`, `date`.

---

## 3. Agent OpenAI — extraction structurée

Deux nodes reliés (déjà dans le JSON) :

- **« OpenAI Chat Model »** (`@n8n/n8n-nodes-langchain.lmChatOpenAi`)
  - **Credential OpenAI** à créer (clé API).
  - Modèle : `gpt-4o-mini` (par défaut), température `0`.
- **« Extraire les infos (IA) »** (`@n8n/n8n-nodes-langchain.informationExtractor`)
  - **Text** analysé : `={{ $json.textPlain || $json.text || $json.subject }}`
  - **Attributs extraits** (déjà configurés) :
    | Attribut        | Type   | Description |
    |-----------------|--------|-------------|
    | `client_nom`    | string | Nom et prénom du client |
    | `client_tel`    | string | Téléphone |
    | `ville_depart`  | string | Ville de départ |
    | `ville_arrivee` | string | Ville d'arrivée |
    | `volume_m3`     | number | Volume en m³ (vide si non mentionné) |
  - **System prompt** : « N'invente rien ; si une info est absente, laisse le champ vide. »

> La liaison **OpenAI Chat Model → Information Extractor** est du type `ai_languageModel`
> (elle est déjà faite dans le JSON — visible par le petit connecteur sous le node).

---

## 4. Node « Préparer le payload » (Code)

Fusionne les champs extraits par l'IA avec l'expéditeur / le sujet / le corps du mail.
Code déjà inclus dans le JSON — rien à faire, sauf vérifier qu'il est bien là.

---

## 5. Node « Envoyer à la plateforme » (HTTP Request)

- **Method** : `POST`
- **URL** : `https://<URL-RAILWAY>/api/emails-entrants` ← **remplacer** `REMPLACER-PAR-URL-RAILWAY`.
- **Send Body** : ON · **Body Content Type** : `JSON` · **Specify Body** : `Using JSON`
- **JSON** (expression) : `{{ $json }}`
- **Header** : `Content-Type: application/json`

Réponse attendue : **HTTP 201** `{ "id": "…", "completion_token": "…", "incomplet": true|false }`.

---

## 6. Tester

1. **Execute Workflow** et envoyer un vrai mail de test à la boîte
   (ou **pinned data** sur le trigger avec un exemple de mail).
2. Vérifier la sortie du node IA (les champs extraits).
3. Vérifier que le node HTTP renvoie **201**.
4. Dans la plateforme (_Espace équipe → Demandes_), la demande apparaît (source « Mail »).
5. Si le volume manquait, vérifier qu'un email de complétion part (si le workflow
   « Demande incomplète » est actif — voir §8).

---

## 7. Contrat de l'API (référence)

`POST /api/emails-entrants` — corps JSON, **tous les champs optionnels** :

| Champ           | Type   | Exemple                |
|-----------------|--------|------------------------|
| `client_nom`    | string | `"Paul Martin"`        |
| `client_email`  | string | `"paul@example.com"`   |
| `client_tel`    | string | `"0612345678"`         |
| `ville_depart`  | string | `"Lyon"`               |
| `ville_arrivee` | string | `"Marseille"`          |
| `volume_m3`     | number | `25`                   |
| `sujet`         | string | `"Demande de devis"`   |
| `corps`         | string | texte brut du mail     |

---

## 8. Réglages côté plateforme (à faire une fois)

**Espace équipe → Paramètres → Général** :
- **URL publique du site** = l'URL Railway (sert aux liens `{{lien_completion}}`).
- **Connexion Brevo** : « Connecté » (sinon autoriser l'IP Railway + valider l'email expéditeur).

**Messagerie → Templates** puis **Workflow** :
- Template email/SMS contenant `{{lien_completion}}`.
- **Workflow** : événement « Demande incomplète » → « quand le volume manque » → ce template →
  destinataire « le client ».

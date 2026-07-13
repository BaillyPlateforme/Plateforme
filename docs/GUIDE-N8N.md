# Guide n8n — Mails entrants → Demandes Bailly

Objectif : chaque email de demande reçu dans la boîte mail est transformé en **demande**
dans la plateforme. Si le mail est incomplet (pas de volume, pas d'adresse…), la
plateforme envoie automatiquement au client un **lien de complétion** (workflows configurés
dans _Messagerie → Workflow_). **n8n n'a donc pas besoin de tout extraire** : il envoie ce
qu'il a, la plateforme gère le reste.

Flux : **Email (IMAP) → Code (préparer le payload) → HTTP Request (POST vers la plateforme)**

---

## 0. Prérequis

- Un accès à l'instance **n8n**.
- Les identifiants **IMAP** de la boîte mail qui reçoit les demandes (serveur, port, login, mot de passe).
- L'**URL publique de la plateforme** déployée sur Railway, par ex. :
  `https://bailly-plateforme.up.railway.app`
  → l'endpoint à appeler sera : `https://<cette-url>/api/emails-entrants`

---

## 1. Créer le workflow

Dans n8n : **Workflows → Add workflow**. Nommer par ex. `Bailly — Mails entrants`.

---

## 2. Node 1 — Déclencheur email (IMAP)

- **Add first step → On App Event / Trigger → “Email Trigger (IMAP)”**
  (type : `Email Read (IMAP)`).
- **Credential** : créer une credential IMAP avec les infos de la boîte mail
  (Host, Port 993, SSL/TLS activé, User, Password).
- **Paramètres** :
  - **Mailbox** : `INBOX`
  - **Action / Post-process** : au choix, `Mark as read` (recommandé pour ne pas retraiter).
  - **Format** : `Resolved` (pour récupérer le texte et l'expéditeur proprement).
  - **Download attachments** : non nécessaire.

Ce node sort, pour chaque mail : `subject`, `from`, `textPlain` (ou `text`), `textHtml`, `date`.

---

## 3. Node 2 — Code (préparer le payload)

- **Add node → “Code”** (type : Code, langage JavaScript).
- **Mode** : `Run Once for Each Item`.
- Coller **exactement** ce code :

```javascript
const email = $input.item.json;

// Expéditeur (le format varie selon la version : on couvre les cas courants)
const from = email.from || {};
const address =
  (from.value && from.value[0] && from.value[0].address) ||
  from.address ||
  (typeof from === "string" ? from : "") ||
  email.fromEmail ||
  "";
const name =
  (from.value && from.value[0] && from.value[0].name) ||
  from.name ||
  "";

// Corps du message (texte brut de préférence)
const corps =
  email.textPlain ||
  email.text ||
  (email.textHtml ? String(email.textHtml).replace(/<[^>]+>/g, " ") : "") ||
  "";
const sujet = email.subject || "";

// Extraction naïve du volume s'il est mentionné (ex : "25 m3", "25m³")
const vmatch = corps.match(/(\d+[.,]?\d*)\s?(m3|m³|metres? cubes?|mètres? cubes?)/i);
const volume_m3 = vmatch ? parseFloat(vmatch[1].replace(",", ".")) : null;

return {
  json: {
    client_email: address || undefined,
    client_nom: name || undefined,
    sujet: sujet,
    corps: corps,
    volume_m3: volume_m3, // null si non trouvé → la plateforme demandera au client
    // ville_depart / ville_arrivee / client_tel : laissés vides ici
    // (voir §6 pour une extraction plus poussée par IA, optionnelle)
  },
};
```

> Ce node ne remplit que ce qui est fiable (email, nom, sujet, corps, et le volume si
> écrit noir sur blanc). Le reste (villes, téléphone) reste vide : c'est **normal**, la
> plateforme enverra un lien de complétion au client.

---

## 4. Node 3 — HTTP Request (envoi vers la plateforme)

- **Add node → “HTTP Request”**.
- **Paramètres** :
  - **Method** : `POST`
  - **URL** : `https://<URL-DE-LA-PLATEFORME>/api/emails-entrants`
    _(remplacer par l'URL Railway réelle)_
  - **Send Body** : `ON`
  - **Body Content Type** : `JSON`
  - **Specify Body** : `Using JSON`
  - **JSON** : mettre l'expression (mode expression `=`) :
    ```
    {{ $json }}
    ```
  - **Send Headers** : `ON`
    - Header : `Content-Type` = `application/json`

C'est tout. Le node envoie le payload préparé au Node 2.

---

## 5. Relier et activer

- Relier : **Email Trigger → Code → HTTP Request**.
- **Save**, puis basculer le workflow sur **Active** (interrupteur en haut à droite).

À chaque nouveau mail, une demande est créée. Réponse attendue de l'API (HTTP **201**) :
```json
{ "id": "…", "completion_token": "…", "incomplet": true }
```
- `incomplet: true` → il manquait volume et/ou adresses → la plateforme déclenche les
  workflows de complétion (email/SMS au client avec le lien), **si** ils sont configurés
  dans _Messagerie → Workflow_ (événement « Demande incomplète »).

---

## 6. (Optionnel) Extraction avancée par IA

Pour remplir aussi `ville_depart`, `ville_arrivee`, `client_tel`, `volume_m3` à partir du
texte du mail, insérer un node d'IA **entre le Node 1 et le Node 2** :

- Node **“Information Extractor”** (LangChain) ou **“OpenAI” / “Google Gemini”** avec un prompt du type :
  > « Extrais du texte suivant, au format JSON strict, les champs : client_nom, client_tel,
  > ville_depart, ville_arrivee, volume_m3 (nombre en m³ ou null). Texte : {{ $json.textPlain }} »
- Puis dans le Node 2 (Code), fusionner ces champs extraits dans le `json` renvoyé.

Ce n'est **pas obligatoire** : sans IA, la plateforme relancera simplement le client pour
compléter.

---

## 7. Tester

1. Dans n8n, ouvrir le workflow, cliquer **Execute Workflow** puis envoyer un vrai mail de
   test à la boîte (ou utiliser des **pinned data** sur le trigger).
2. Vérifier que le Node HTTP renvoie **201**.
3. Dans la plateforme (_Espace équipe → Demandes_), la nouvelle demande apparaît (source
   « Mail »).
4. Si le mail ne mentionnait pas le volume, vérifier qu'un email de complétion part (si le
   workflow « Demande incomplète » est actif et l'expéditeur Brevo validé).

---

## 8. Contrat de l'API (référence)

`POST /api/emails-entrants` — corps JSON, **tous les champs optionnels** :

| Champ           | Type    | Exemple                    |
|-----------------|---------|----------------------------|
| `client_nom`    | string  | `"Paul Martin"`            |
| `client_email`  | string  | `"paul@example.com"`       |
| `client_tel`    | string  | `"0612345678"`             |
| `ville_depart`  | string  | `"Lyon"`                   |
| `ville_arrivee` | string  | `"Marseille"`              |
| `volume_m3`     | number  | `25`                       |
| `sujet`         | string  | `"Demande de devis"`       |
| `corps`         | string  | texte brut du mail         |
| `expediteur`    | string  | `"paul@example.com"`       |

Réponse : `201` avec `{ id, completion_token, incomplet }`.

---

## 9. Réglages côté plateforme (à faire une fois)

Dans **Espace équipe → Paramètres → Général** :
- **URL publique du site** : l'URL Railway (sert à construire les liens de complétion).
- **Connexion Brevo** : vérifier « Connecté » (sinon autoriser l'IP Railway dans Brevo et
  valider l'email expéditeur).

Dans **Messagerie → Templates** puis **Workflow** :
- Créer un template email/SMS contenant la variable `{{lien_completion}}`.
- Créer un **Workflow** : événement « Demande incomplète » → « quand le volume manque » →
  ce template → destinataire « le client ».

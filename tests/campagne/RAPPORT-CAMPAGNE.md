# Campagne de 100 simulations du formulaire de devis public

18/11/2026 — branche `retours-celine-16-11`, commit `912e969` (code du formulaire identique à la production). Serveurs **locaux** de la batterie (ports 4101/4102, `next start` du build du jour), base de **recette**, `ENVOI_MODE=desactive`, `CREAGIDEM_MODE=inactif` (fiches préparées, jamais envoyées), Gemini **réel** pour les 5 scénarios photos (5 analyses sur un budget de 6). Rien n'a été lancé contre la production.

## Deuxième passage, après corrections (18/11/2026, après-midi)

Les dix défauts ci-dessous ont été corrigés (branche du worktree, sur `e77914d`), puis la campagne relancée en entier sur les mêmes serveurs locaux et la recette, photos en analyse **factice** (`CAMPAGNE_PHOTOS=factice` : le budget Gemini, déjà à 5/6, n'a pas été touché).

- Passage complet : **99 ✅, 1 ❌** — le n° 16 seulement, pour une erreur 504 ponctuelle de la Géoplateforme de l'IGN (la carte de l'écran de fin), relevée comme erreur de console ; rien de faux dans la demande, le devis ou la fiche.
- Rejeu, après un dernier build, du n° 16 et des scénarios touchés en dernier (téléphones français et étrangers, dates, volumes, messages de refus, mutation, entreprise) : 13/13 ✅. Le tableau ci-dessous reprend ce rejeu : **100 ✅, 0 ❌**.
- Nettoyage : restes **aucun** (`restes()` vide).

Ce que la campagne attend désormais, volontairement (et non pour masquer un défaut) :
- **pas de distance automatique** pour une ville tapée hors de la liste (étrangère ou introuvable) ni de l'outre-mer vers un autre territoire : `requests.distance_km` vide, événement `distance_inconnue`, pas de devis, écran replié sans montant, fiche Créagidem à `0.00` avec la ligne « Distance : non calculée… » ;
- **transport seul** : la colonne `formule` garde la grille appliquée (`eco`, la colonne n'admet que eco / standard / luxe) ; le choix est gardé dans `raw_payload.prestations.transport = "bailly"` et c'est lui que disent la fiche Créagidem (« Formule : Transport de meubles uniquement », jamais « Économique »), le CRM et l'e-mail ;
- n° 95 : le message « Ville introuvable… » est attendu jusqu'à 10 s (il ne peut venir qu'après la réponse de la vraie base d'adresses).

Pendant ce passage, l'ancienne adresse de la base (api-adresse.data.gouv.fr) ne répondait plus (plus de 8 s, ou rien) ; la Géoplateforme (data.geopf.fr), qui la remplace, répondait en 0,2 s.

## Bilan chiffré (premier passage, avant corrections)

| | Nombre |
|---|---:|
| Scénarios | 100 (49 au téléphone — Pixel 7 —, 51 sur ordinateur ; 11 dans le cadre du site officiel ; 25 ouverts ensuite dans le CRM) |
| ✅ Réussis | **60** |
| ❌ En échec | **40** — tous pour des défauts de l'application (aucun échec dû au test) |
| ⏭️ Ignorés | 0 |
| Devis brouillons créés | 64 (+1 au rejeu du n° 43), références `DEV-2026-NNNN` toutes uniques et bien formées |
| Messages réellement envoyés | 0 (journal des envois : « fictif » pour les e-mails `@example.com`, « journalisé » pour les SMS) |
| Fiches Créagidem envoyées | 0 (toutes « préparée », garde-fou « environnement batterie-locale ») |
| Recette après nettoyage | **rien** (`restes()` vide ; envois, journal des alertes et photos déposées retirés aussi) |

Passage principal : 6,9 min, 4 ouvriers. Le n° 43 a été rejoué seul après correction d'un sélecteur du test (libellé « Interlocuteur facultatif ») : il réussit.

Les 40 échecs se ramènent à **10 défauts** (ci-dessous). À lui seul, le défaut n° 3 (code postal d'arrivée du devis express) fait échouer 19 scénarios ; sans lui, 17 des 25 devis express passeraient.

## Défauts de l'application, par gravité

### Majeur

**1. Une ville étrangère ou inconnue est placée sur une commune française au nom voisin, sans prévenir : l'estimation affichée et la distance envoyée à Créagidem sont fausses.**
- *Saisi* : une ville tapée sans la choisir dans la liste (la liste ne propose que des communes françaises), avec le pays choisi dans « Pays » au devis complet.
- *Attendu* : pas d'estimation fondée sur une autre ville. Le visiteur est prévenu (ville introuvable ou déménagement international), ou la demande part sans prix, pour que l'équipe la chiffre.
- *Obtenu* : la page et le serveur interrogent la Base Adresse Nationale avec `limit=1`, gardent le premier résultat quel que soit son score, et ignorent le pays choisi :

| N° | Trajet saisi | Ville retenue (score BAN) | Distance | Estimation affichée | Créagidem `distance` |
|---|---|---|---:|---:|---:|
| 14 | Toulouse → « Londres » (express) | Saint-Martin-de-Londres 34380 (0,67) | 263 km (vol d'oiseau réel : 887 km) | 2 160 € | 263.00 |
| 37 | Strasbourg → Berlin (Allemagne, 10115) | Berling 57370 (0,84) | 63 km (réel : 592 km) | 2 532 € | 63.00 |
| 38 | Perpignan → Barcelone (Espagne, 08001) | Barcelonne 26120 (0,75) | 364 km (réel : 158 km) | 1 680 € | 364.00 |
| 39 | Paris → Montréal (Canada) | Montréal 11290, Aude (0,94) | 754 km (réel : 5 505 km) | 4 788 € | 754.00 |
| 40 | Marseille → Marrakech (Maroc, 40000) | Mont-de-Marsan 40000 (0,30) | 584 km (réel : 1 749 km) | 3 048 € | 588.00 |
| 95 | « Zzyzx-sur-Mer » → Paris (express) | Méry-sur-Marne 77730 (0,34) | 74 km | 1 080 € | 74.00 |

  Le n° 41 (Nice → Alger, 16000) réussit **par hasard** : « 16000 Alger » donne Angoulême (code 16000), et Nice → Angoulême tombe dans la fourchette plausible de Nice → Alger. Quand la base ne trouve rien (Bruxelles, Genève avec code postal, Londres avec « SW1A 1AA », New York : n° 13, 34, 35, 36, 42, 90), aucune estimation n'est affichée (repli « en cours de finalisation », correct), mais Créagidem reçoit une distance de `0.00`.
- *En cause* : `packages/commun/src/lib/trajet.ts:31-37` (`situerVille` : `limit=1`, `features[0]` sans seuil de score) ; `apps/externe/src/app/demande/DemandeForm.tsx:460-477` (express) et `:812-825` (complet : la ville est située même quand « Pays » n'est pas la France) ; `packages/commun/src/lib/qualification.ts` (`distanceEntreVilles`, même logique côté serveur).
- Captures : `captures/014-fin.png`, `038-fin.png`, `040-fin.png`, `095-fin.png`.

**2. Outre-mer : l'estimation est calculée sur une distance routière absurde, renvoyée telle quelle par le service d'itinéraires public.**
- *Saisi* : une ville d'outre-mer choisie dans la liste (n° 10 Paris → Fort-de-France, n° 12 Saint-Denis 97400 → Saint-Denis 93200, n° 48 Pointe-à-Pitre → Bordeaux).
- *Attendu* : pas d'estimation automatique pour une traversée maritime, ou une estimation fondée sur un autre barème.
- *Obtenu* : le service OSRM public ne répond pas « pas de route » : il rapproche le point d'outre-mer d'une route d'Europe. Il donne 1 940 km pour Paris → Fort-de-France (vérifié directement auprès du service le 18/11) et **0 km** pour La Réunion → Seine-Saint-Denis. Affiché au client : **3 000 €** (n° 10), **810 €** (n° 12, chiffré comme un déménagement local) et **3 000 €** (n° 48). Créagidem reçoit 1 940, 0 et 1 356 km. Les mutations et projets vers l'outre-mer, sans prix à l'écran, envoient aussi 1 937 et 1 940 km à Créagidem (n° 80, 84).
- *En cause* : `apps/externe/src/app/demande/AddressInput.tsx:206-214` (`roadDistanceKm` ne compare pas la distance routière au vol d'oiseau) ; `packages/commun/src/lib/trajet.ts` (`distanceRoutiereKm`, même chose côté serveur) ; aucun garde-fou outre-mer dans `qualification.ts`.
- Captures : `captures/010-fin.png`, `012-fin.png`, `048-fin.png`.

### Moyen

**3. Devis express : le code postal de la ville d'arrivée n'est jamais enregistré, si bien que la livraison part à Créagidem sans code postal ni pays.**
- *Saisi* : une ville d'arrivée choisie dans la liste (avec son code postal), dans les 19 devis express où elle est française (n° 1 à 12, 15 à 17, 22 à 25).
- *Attendu* : `requests.arrivee_code_postal` = le code postal choisi ; Créagidem `livraison.code_postal` et `livraison.pays` = « France ».
- *Obtenu* : `arrivee_code_postal` vide ; Créagidem `livraison.code_postal: ""`, `livraison.pays: ""`. Pour des homonymes, l'équipe ne peut plus savoir où l'on va : au n° 12, l'arrivée choisie est Saint-Denis 93200, mais la demande et la fiche disent seulement « Saint-Denis » (le départ est Saint-Denis 97400).
- *En cause* : `apps/externe/src/app/demande/DemandeForm.tsx:658` (`onSelect` ne garde que `p.ville`) et `:526` (`arrivee: { ville }` seulement) ; `packages/commun/src/lib/creagidem/fiche.ts:109` (sans code postal à 5 chiffres, le pays reste vide).

**4. Un téléphone incomplet est accepté.**
- n° 93 : « 06 12 » au devis complet. *Attendu* : refus à l'étape « Vous ». *Obtenu* : « Continuer » s'ouvre, l'estimation s'affiche, la demande est enregistrée avec `client_tel = "06 12"`, et la fiche Créagidem porte `tel_portable: "06 12"`.
- *En cause* : `DemandeForm.tsx:1880` (seulement « non vide ») ; `packages/commun/src/lib/schemas.ts:104` (`tel: texteLibre(30)`, aucune forme vérifiée). Même chose dans les parcours mutation et entreprise (`Questionnaires.tsx`, `contactManquant`).
- Capture : `captures/093-vous.png`, `093-fin.png`.

**5. Une date passée est acceptée.**
- n° 97 : 30/06/2025 au devis complet. *Attendu* : refus. *Obtenu* : demande enregistrée avec `date_souhaitee = 2025-06-30`, estimation de 1 320 € affichée, fiche Créagidem `date_ou_periode: "20250630"`.
- *En cause* : `schemas.ts` (`date_souhaitee` : format et validité seulement) ; `DemandeForm.tsx:1605` (champ date sans `min`).

**6. Volume nul ou négatif : le formulaire l'accepte, et un volume de 0 m³ est chiffré.**
- n° 100 : « -12 » → la barre affiche « Tout y est — -12 m³ à déménager », le bouton s'ouvre, puis le serveur refuse avec un message technique (défaut 7). « 0 » → demande enregistrée avec 0 m³ et **estimation de 750 €** affichée.
- *En cause* : `apps/externe/src/app/demande/volume.tsx:82-85` (`volumeDe` accepte tout nombre) ; `schemas.ts:82` (`volume_m3: z.number().min(0)` accepte 0). Pourtant la page de complétion traite déjà 0 comme « pas de volume ».
- Captures : `captures/100-volume-negatif.png`, `100-volume-nul.png`.

### Mineur

**7. Des messages de refus en anglais technique.**
- n° 99 : nom de 86 caractères → « Too big: expected string to have <=80 characters » ; n° 98 : message de 6 000 caractères → « Too big: expected string to have <=5000 characters » ; n° 100 : volume négatif → « Too small: expected number to be >=0 ». Dans les trois cas, aucune demande n'est créée (le refus lui-même est juste).
- *En cause* : `apps/externe/src/app/api/requests/route.ts:18`, qui n'écarte que les messages commençant par Invalid, Required ou Expected. Côté formulaire, aucun champ n'a de `maxLength`.
- Captures : `captures/099-refus.png`, `098-refus.png`, `100-refus.png`.

**8. « Transport de meubles uniquement » est enregistré comme la formule « Économique ».**
- n° 29 : `requests.formule = "eco"`, et la fiche Créagidem dit « Formule : Économique », alors que le client a choisi le transport seul (sans démontage ni remontage, que l'Économique comprend). Seuls `raw_payload.prestations` et des services à `false` gardent la trace du choix.
- *En cause* : `DemandeForm.tsx:2036-2037`.

**9. Sans distance venue du formulaire, le serveur la calcule deux fois, en parallèle, et peut obtenir deux valeurs.**
- n° 40 : `requests.distance_km = 584` (qui sert à l'estimation), fiche Créagidem `588.00`. Lors d'un passage de mise au point, le n° 41 a donné 914 km pour la demande et 732 km pour la fiche.
- *En cause* : `packages/commun/src/lib/requests.ts:201` (la fiche Créagidem part en parallèle du chiffrage) et `creagidem/index.ts:209` (elle recalcule la distance au lieu d'attendre celle du chiffrage).

**10. Les codes postaux étrangers sont réduits à leurs chiffres dans Créagidem.**
- n° 36 : « SW1A 1AA » devient `"11"` ; n° 39 : « H2X 1Y4 » devient `"214"` : deux autres codes, faux.
- *En cause* : `creagidem/fiche.ts:100` (`replace(/\D/g, "")`).

## Observations à arbitrer (non comptées en échec)

- **Valeur déclarée « > 60 000 € »** (n° 27) : Créagidem reçoit `valeur: 60000.00` (la seule borne de la tranche), mais l'estimation calcule la garantie sur 100 000 € (`pricing/engine.ts`, `VALEUR_MOBILIER`). Les deux chiffres devraient être alignés.
- **Demandes venues d'un e-mail (n8n)** (n° 19, 21) : aucune fiche Créagidem, même après complétion par le client. C'est voulu par le code (`api/requests/route.ts` : « ni Créagidem ni jeton de modification »), mais l'équipe doit alors créer la fiche à la main.
- **Demande « formulaire » arrivée sans volume** (n° 18, 20, créées par l'API comme le fait la batterie) : une fiche part dès la création, sans volume. En production (mode actif), la complétion ne la renverrait pas, car une fiche déjà envoyée ne repart qu'à la main (`creagidem/index.ts:204`). Le formulaire public ne peut pas produire de telles demandes, d'où le classement en observation.
- **« Premium » à l'écran, « Luxe » dans le CRM et Créagidem** (`creagidem/fiche.ts:126`) : nom différent pour la même formule.
- Le repli de l'écran d'estimation (« Votre devis est en cours de finalisation ») s'est vu sur quelques espaces pro et complétions : le montant arrivait après les 12 s de patience de l'écran. Il était juste en base.

## Ce qui a été vérifié et tient

- Les 11 parcours dans le cadre du site officiel (page WordPress simulée avec `data-decalage="80"` et `integration.js`, sur ordinateur et au téléphone) : à chaque étape, le cadre prend la hauteur exacte de son contenu, sans barre de défilement intérieure, et la page revient sur le haut du formulaire. Aucun écart.
- Aucun débordement horizontal au téléphone (49 parcours, mesuré à chaque étape).
- Ni erreur JavaScript, ni réponse 5xx, ni erreur de console dans les 100 parcours.
- Les 25 demandes ouvertes dans le CRM (compte `batterie.equipe`) s'ouvrent sans erreur et montrent nom, e-mail, téléphone, trajet et volume.
- Mutation, petit transfert, projet important, espaces pro (standard, Safran, Carrefour par le lien ; Carrefour reconnu au nom de la société) : la demande, le rappel inscrit (créneau compris), l'absence de devis et la fiche Créagidem sont justes. La demande Carrefour paraît dans l'espace RH de Carrefour.
- Bouton « Retour » du navigateur au milieu du devis complet (n° 31, 32, 60) : l'étape précédente revient, la saisie est intacte.
- « Modifier ma demande » (n° 7) : la même demande est mise à jour, le devis refait, une nouvelle fiche est préparée et aucune n'est envoyée.
- Les rappels, par le bouton et par le lien `/rappel/<id>` (inscrit une seule fois).
- La complétion par le lien `/completer/<jeton>` : volume saisi, liste de meubles ou description du logement, ville manquante, chiffrage, jeton effacé.
- Les photos analysées par Gemini (n° 15, 16, 17, 45, 46) : volume retenu = total affiché, `request_photos` garde l'inventaire, détail Créagidem « (estimé sur photos) ».
- Les suppléments des devis : piano, charges lourdes (au nombre déclaré), garantie standard ou luxe au bon taux de la valeur déclarée.
- Les refus attendus : e-mail sans domaine (bouton fermé), e-mail avec une espace (message clair), nom contenant une adresse web (message clair), société ou nom manquants (bouton fermé). Aucune demande créée.

## Ce que la campagne ne couvre pas

- **La production et le vrai site WordPress** : interdits ici (vrais envois, vraies fiches Créagidem, 5 demandes par jour et par adresse IP). Le cadre est testé sur une copie locale de la page, servie à l'adresse du site officiel.
- **L'envoi réel des e-mails, des SMS et des fiches Créagidem** : coupé par construction. La campagne vérifie ce qui partirait (clé, destinataire, statut au journal, fiche champ par champ), pas la remise ni l'acceptation par Créagidem.
- **La formule imposée par un espace pro** : aucun espace de la recette n'en a. Changer leur réglage aurait modifié des données de recette qui ne sont pas à la campagne.
- **Le comparateur de scénarios**, le mode démo (`?demo=1`), l'option « Ajuster à la carte » et les doublons de photos (une seule photo par analyse, pour tenir le budget Gemini).
- **Safari, Firefox et iPhone** : Chromium seulement (ordinateur et Pixel 7). **Le réseau réel** : la Base Adresse Nationale est servie par le test pour les 74 communes de la table (valeurs relevées sur la vraie base), et interrogée pour de vrai pour toute autre ville. OSRM est simulé (vol d'oiseau + 25 %), sauf vers l'outre-mer (vrai service). Côté serveur, BAN et OSRM sont toujours les vrais.
- **Les limites de débit** (2 demandes par minute, 5 par jour et par adresse IP) : chaque visiteur a sa propre adresse IP ; elles sont testées par la batterie (`formulaire-limite.spec.ts`).

## Relancer la campagne

```
cd tests
node construire.mjs                                   # si le code a changé depuis le dernier build
AVEC_GEMINI=1 node outils/serveurs.mjs --lancer       # autre terminal ; sans AVEC_GEMINI, les 5 scénarios photos sont ignorés
AVEC_GEMINI=1 caffeinate -i node campagne/lancer.mjs  # les 100 scénarios, le nettoyage, puis ce rapport (parties générées)
node campagne/lancer.mjs -g "#038 "                   # un seul scénario
```

`caffeinate` empêche la mise en veille : un poste qui s'endort fait expirer les scénarios en cours. Le budget Gemini (6 analyses) se compte dans `tests/.etat/campagne-gemini.json` : supprimez ce fichier pour le remettre à zéro. `GARDER=1` garde les données en recette (mise au point). `CAMPAGNE_PHOTOS=factice` simule l'analyse des photos sans Gemini. La batterie normale (`node lanceur.mjs`) ne lance pas la campagne.

Relevés bruts : `resultats/scenarios/NNN.json` (un par scénario, avec la fiche Créagidem complète et les réponses de la vraie base d'adresses) ; captures : `captures/` (écran de fin, relecture, CRM, refus, écarts) ; ces deux dossiers sont exclus de Git.

## Les 100 scénarios

<!-- TABLEAU:DEBUT -->
100 scénarios relevés — ✅ 100 réussis · ❌ 0 en échec · ⏭️ 0 ignorés. Téléphone : 49 · cadre du site officiel : 11 · ouverts dans le CRM : 25.

| N° | Parcours | Appareil | Données principales | Résultat | Anomalie(s) |
|---:|---|---|---|:---:|---|
| 1 | Particulier · express | Ordinateur | Camille Durand · Paris → Lyon · 30 m³ saisis · 2027-03-15 · rappel (bouton) *(DEV-2026-0091, 2592 €, 491 km)* | ✅ | — |
| 2 | Particulier · express | Téléphone | Éloïse N'Diaye-Lefèvre · Évry-Courcouronnes → Nantes · 18.5 m³ saisis · « Dès que possible » *(DEV-2026-0122, 1621 €, 418 km)* | ✅ | — |
| 3 | Particulier · express | Ordinateur · cadre | Jean-Baptiste d'Ormesson · Marseille → Lille · 42 m³ saisis · « Courant mars 2027 » *(DEV-2026-0093, 4536 €, 1046 km)* | ✅ | — |
| 4 | Particulier · express | Téléphone | Zoé Œuvrard · Bordeaux → Strasbourg · 12 m³ saisis · sans date *(DEV-2026-0121, 2088 €, 949 km)* | ✅ | — |
| 5 | Particulier · express | Ordinateur | Ngô Thị Hương · L'Haÿ-les-Roses → Montpellier · logement T3 · « Le mois prochain » *(DEV-2026-0092, 3204 €, 733 km)* | ✅ | — |
| 6 | Particulier · express | Téléphone · cadre | Søren Ångström · Nice → Rennes · logement Studio · 2027-01-29 *(DEV-2026-0123, 1980 €, 1058 km)* | ✅ | — |
| 7 | Particulier · express | Ordinateur | Marie-Hélène Lévêque-Bérard · Paris 15e Arrondissement → Bordeaux · 55 m³ saisis · « Dans plus de 3 mois » · modifiée ensuite *(DEV-2026-0095, 5016 €, 618 km)* | ✅ | — |
| 8 | Particulier · express | Téléphone | Maël Le Goff · Brest → Quimper · 8 m³ saisis · « Ce mois-ci » *(DEV-2026-0124, 634 €, 68 km)* | ✅ | — |
| 9 | Particulier · express | Ordinateur | Anaïs Chaïb · Lyon → Ajaccio · 25 m³ saisis · « Dans 2 à 3 mois » · Corse *(DEV-2026-0097, 2460 €, 658 km)* | ✅ | — |
| 10 | Particulier · express | Téléphone | Ilyès Benaïssa · Paris → Fort-de-France · 20 m³ saisis · 2027-06-10 · Martinique | ✅ | — |
| 11 | Particulier · express | Ordinateur | François-Xavier de La Tour du Pin Chambly · Saint-Germain-en-Laye → Annecy · 70 m³ saisis · sans date *(DEV-2026-0096, 5880 €, 565 km)* | ✅ | — |
| 12 | Particulier · express | Téléphone | Léa Hoarau · Saint-Denis → Saint-Denis · 15 m³ saisis · 2027-07-05 · La Réunion → Seine-Saint-Denis (homonymes) | ✅ | — |
| 13 | Particulier · express | Ordinateur | Hugo Petit · Grenoble → Bruxelles · 22 m³ saisis · sans date · arrivée à l'étranger, tapée | ✅ | — |
| 14 | Particulier · express | Téléphone | Chloé Bernard · Toulouse → Londres · 30 m³ saisis · sans date · arrivée à l'étranger, tapée | ✅ | — |
| 15 | Particulier · express | Ordinateur | Nathan Roux · Massy → Tours · 1 photo (Gemini) · « Le mois prochain » *(DEV-2026-0098, 630 €, 236 km)* | ✅ | — |
| 16 | Particulier · express | Téléphone | Inès Fontaine · Corbeil-Essonnes → Caen · 1 photo (Gemini) · sans date *(DEV-2026-0093, 630 €, 272 km)* | ✅ | — |
| 17 | Particulier · express | Ordinateur · cadre | Gabriel Morel · Palaiseau → Dijon · 1 photo (Gemini) · 2027-04-02 *(DEV-2026-0100, 690 €, 324 km)* | ✅ | — |
| 18 | Particulier · express incomplet → /completer | Ordinateur | Julie Garnier · source formulaire · manque : volume · complété : 26 m³ *(DEV-2026-0099, 2246 €, 463 km)* | ✅ | — |
| 19 | Particulier · express incomplet → /completer | Téléphone | Thomas Lambert · source e-mail (n8n) · manque : arrivée, volume · complété : liste *(DEV-2026-0126, 702 €, 127 km)* | ✅ | — |
| 20 | Particulier · express incomplet → /completer | Ordinateur | Manon Lefebvre · source formulaire · manque : volume · complété : logement T4 *(DEV-2026-0101, 2970 €, 242 km)* | ✅ | — |
| 21 | Particulier · express incomplet → /completer | Téléphone | Kévin Da Silva · source e-mail (n8n) · manque : volume · complété : liste *(DEV-2026-0127, 540 €, 57 km)* | ✅ | — |
| 22 | Particulier · express | Ordinateur | Sarah Mercier · Nantes → La Rochelle · 16 m³ saisis · « Dès que possible » · rappel (lien) *(DEV-2026-0102, 1056 €, 155 km)* | ✅ | — |
| 23 | Particulier · express | Téléphone | Lucas Faure · Metz → Nancy · 10 m³ saisis · sans date · rappel (bouton) *(DEV-2026-0128, 792 €, 58 km)* | ✅ | — |
| 24 | Particulier · express | Ordinateur | Emma Rousseau-Vidal · Toulon → Chamonix-Mont-Blanc · 35 m³ saisis · 2027-08-01 · rappel (bouton) *(DEV-2026-0103, 3024 €, 402 km)* | ✅ | — |
| 25 | Particulier · express | Téléphone · cadre | Louis Girard · Perpignan → Pau · 14 m³ saisis · « Ce mois-ci » *(DEV-2026-0129, 1428 €, 341 km)* | ✅ | — |
| 26 | Particulier · complet | Ordinateur | Camille Durand · Lyon 3e Arrondissement → Toulouse · 30 m³ saisis · ét. 3/1+asc · formule standard · standard 10 000 – 30 000 € *(DEV-2026-0104, 3084 €, 452 km)* | ✅ | — |
| 27 | Particulier · complet | Téléphone | Jean-Pierre O'Connor · Paris 11e Arrondissement → Marseille · liste de 8 meubles · ét. 5+asc/0 · formule luxe · luxe > 60 000 € · piano · 2 charge(s) lourde(s) *(DEV-2026-0132, 3877 €, 828 km)* | ✅ | — |
| 28 | Particulier · complet | Ordinateur · cadre | Sophie Lemaire · Lille → Bordeaux · liste de 5 meubles · ét. 2/0 · formule eco *(DEV-2026-0107, 1457 €, 872 km)* | ✅ | — |
| 29 | Particulier · complet | Téléphone | Bastien Guérin · Nantes → Rennes · 12 m³ saisis · ét. 4/2 · formule transport · transport seul, 4e sans ascenseur *(DEV-2026-0130, 861 €, 122 km)* | ✅ | — |
| 30 | Particulier · complet | Ordinateur | Margaux Schneider · Strasbourg → Mulhouse · logement T4 · ét. 1/0 *(DEV-2026-0105, 3348 €, 122 km)* | ✅ | — |
| 31 | Particulier · complet | Téléphone | Yanis Belkacem · Rennes → Caen · liste de 4 meubles · ét. 3+asc/1 · Retour navigateur *(DEV-2026-0133, 570 €, 192 km)* | ✅ | — |
| 32 | Particulier · complet | Ordinateur | Clémence Dubois-Huet · Dijon → Besançon · 22 m³ saisis · ét. 2/4+asc · Retour navigateur *(DEV-2026-0106, 1135 €, 92 km)* | ✅ | — |
| 33 | Particulier · complet | Téléphone · cadre | Théo Vasseur · Clermont-Ferrand → Le Puy-en-Velay · 28 m³ saisis · ét. 6+asc/0 *(DEV-2026-0131, 1821 €, 130 km)* | ✅ | — |
| 34 | Particulier · complet | Ordinateur | Lucie Van den Berghe · Paris → Bruxelles (Belgique) · 25 m³ saisis · ét. 2+asc/3+asc · Belgique | ✅ | — |
| 35 | Particulier · complet | Téléphone | Matthieu Rochat · Lyon → Genève (Suisse) · liste de 3 meubles · ét. 1/2+asc · Suisse | ✅ | — |
| 36 | Particulier · complet | Ordinateur | Emily Thompson · Lille → Londres (Royaume-Uni) · 35 m³ saisis · ét. 0/1 · Royaume-Uni (hors UE) | ✅ | — |
| 37 | Particulier · complet | Téléphone | Lukas Müller · Strasbourg → Berlin (Allemagne) · 40 m³ saisis · ét. 3/4+asc · Allemagne | ✅ | — |
| 38 | Particulier · complet | Ordinateur | Núria Puig i Ferrer · Perpignan → Barcelone (Espagne) · 20 m³ saisis · ét. 1/5+asc · Espagne | ✅ | — |
| 39 | Particulier · complet | Téléphone | Gabrielle Tremblay · Paris → Montréal (Canada) · 45 m³ saisis · ét. 4+asc/2 · Canada (hors UE) | ✅ | — |
| 40 | Particulier · complet | Ordinateur | Youssef El Amrani · Marseille → Marrakech (Maroc) · 30 m³ saisis · ét. 2/0 · Maroc (hors UE) | ✅ | — |
| 41 | Particulier · complet | Téléphone | Nadia Bouzid · Nice → Alger (Algérie) · 18 m³ saisis · ét. 1/3 · Algérie (hors UE) | ✅ | — |
| 42 | Particulier · complet | Ordinateur | Daniel Cohen · New York (États-Unis) → Paris 15e Arrondissement · 50 m³ saisis · ét. 12+asc/3+asc · départ des États-Unis | ✅ | — |
| 43 | Particulier · complet | Ordinateur | Martine Lefort · Paris → Lyon · 15 m³ saisis · ét. 2+asc/1+asc · client entreprise *(DEV-2026-0108, 1710 €, 491 km)* | ✅ | — |
| 44 | Particulier · complet | Téléphone | Romain Castelnau · Toulouse → Nice · 33 m³ saisis · ét. 2+asc/3+asc · mutation déclarée au devis complet *(DEV-2026-0134, 3010 €, 585 km)* | ✅ | — |
| 45 | Particulier · complet | Ordinateur | Pauline Roy · Angers → Le Mans · 1 photo (Gemini) · ét. 1/0 *(DEV-2026-0109, 570 €, 101 km)* | ✅ | — |
| 46 | Particulier · complet | Téléphone | Iñaki Etcheverry · Bayonne → Biarritz · 1 photo (Gemini) · ét. 2/1 *(DEV-2026-0135, 450 €, 9 km)* | ✅ | — |
| 47 | Particulier · complet | Ordinateur | Dominique Santoni · Bastia → Marseille · 24 m³ saisis · ét. 2/7+asc · Corse → continent *(DEV-2026-0110, 2074 €, 418 km)* | ✅ | — |
| 48 | Particulier · complet | Téléphone | Ludovic Jean-Baptiste · Pointe-à-Pitre → Bordeaux · 20 m³ saisis · ét. 1/2+asc · Guadeloupe → métropole | ✅ | — |
| 49 | Particulier · complet | Ordinateur | Agnès Fabre · Avignon → Nîmes · 18 m³ saisis · ét. 1/0 · surfaces inconnues *(DEV-2026-0111, 972 €, 52 km)* | ✅ | — |
| 50 | Particulier · complet | Téléphone | Pierre-Louis N'Guessan · Cherbourg-en-Cotentin → Rouen · liste de 5 meubles · ét. 0/2 · luxe < 10 000 € *(DEV-2026-0137, 726 €, 247 km)* | ✅ | — |
| 51 | Particulier · complet | Ordinateur | Victor Hamon · Le Havre → Amiens · 40 m³ saisis · ét. 10+asc/1 · formule luxe *(DEV-2026-0112, 3312 €, 202 km)* | ✅ | — |
| 52 | Particulier · complet | Téléphone | Alice Perrin · Orléans → Tours · 9.5 m³ saisis · ét. 3/1 · formule eco *(DEV-2026-0136, 797 €, 132 km)* | ✅ | — |
| 53 | Particulier · complet | Ordinateur · cadre | Benoît Lambert · Reims → Châlons-en-Champagne · logement Studio · ét. 0/1 · formule standard *(DEV-2026-0113, 594 €, 50 km)* | ✅ | — |
| 54 | Particulier · complet | Téléphone | Céline Barret · Saint-Étienne → Grenoble · 26 m³ saisis · ét. 2/3+asc · standard 30 000 – 60 000 € · piano · 1 charge(s) lourde(s) *(DEV-2026-0138, 2702 €, 137 km)* | ✅ | — |
| 55 | Particulier · complet | Ordinateur | Jérôme Moulin · Limoges → Poitiers · liste de 12 meubles · ét. 1/0 *(DEV-2026-0115, 1147 €, 131 km)* | ✅ | — |
| 56 | Particulier · complet | Téléphone | Morgane Le Bihan · Vannes → Saint-Malo · 21 m³ saisis · ét. 0/2 *(DEV-2026-0139, 1310 €, 154 km)* | ✅ | — |
| 57 | Particulier · complet | Ordinateur | Frédéric Muller-Koenig · Colmar → Évian-les-Bains · 27 m³ saisis · ét. 3/1+asc *(DEV-2026-0114, 2256 €, 246 km)* | ✅ | — |
| 58 | Particulier · complet | Téléphone | Laetitia Garcia · Troyes → Montélimar · 31 m³ saisis · ét. 1/0 · formule luxe *(DEV-2026-0140, 3251 €, 524 km)* | ✅ | — |
| 59 | Particulier · complet | Ordinateur | Arnaud Delacroix · Villeneuve-d'Ascq → Saint-Jean-de-Luz · 48 m³ saisis · ét. 2+asc/0 · formule standard *(DEV-2026-0116, 5472 €, 1104 km)* | ✅ | — |
| 60 | Particulier · complet | Téléphone | Héloïse Charpentier · Bourg-en-Bresse → Saint-Tropez · 19 m³ saisis · ét. 1/0 · luxe 10 000 – 30 000 € · Retour navigateur *(DEV-2026-0141, 1952 €, 432 km)* | ✅ | — |
| 61 | Entreprise · petit transfert | Ordinateur | Cabinet Dentaire du Parc · Paris 11e Arrondissement → Paris 15e Arrondissement · 3 bureaux, 6 chaises et fauteuils, 2 armoires · sans date | ✅ | — |
| 62 | Entreprise · petit transfert | Téléphone | Agence Immobilière L'Horizon · Lyon → Grenoble · 5 bureaux, 5 caissons, 5 postes informatiques, 1 photocopieurs et imprimantes · « Le mois prochain » | ✅ | — |
| 63 | Entreprise · petit transfert | Ordinateur · cadre | SARL Menuiserie Duval & Fils · Rouen → Caen · 2 tables de réunion, 120 cartons d'archives · 2027-05-03 | ✅ | — |
| 64 | Entreprise · petit transfert | Téléphone | Études Notariales Bérard-Saint-Clair · Montpellier → Nîmes · commentaire seul · sans date | ✅ | — |
| 65 | Entreprise · petit transfert | Ordinateur | Ïlo Technologies SAS · Nantes → Rennes · 25 postes informatiques, 25 chaises et fauteuils, 25 bureaux · « Dans 2 à 3 mois » | ✅ | — |
| 66 | Entreprise · petit transfert | Téléphone | Ô Design Architectes · Nice → Marseille · 4 armoires, 1 tables de réunion · « Un week-end de mars 2027 » | ✅ | — |
| 67 | Entreprise · petit transfert | Ordinateur | Pharmacie de la Gare · Ajaccio → Bastia · 6 armoires, 80 cartons d'archives · sans date | ✅ | — |
| 68 | Entreprise · petit transfert | Téléphone | Association Les Amis du Vieux-Lyon · Lyon 3e Arrondissement → Lyon · 30 cartons d'archives · sans date | ✅ | — |
| 69 | Entreprise · petit transfert | Ordinateur | Laboratoire Bio-Analyses Sud-Ouest · Bordeaux → Toulouse · 2 bureaux, 4 postes informatiques · sans date | ✅ | — |
| 70 | Entreprise · petit transfert | Téléphone | Auto-école Feu Vert · Metz → Strasbourg · 1 bureaux, 8 chaises et fauteuils, 1 photocopieurs et imprimantes · sans date | ✅ | — |
| 71 | Entreprise · projet important | Ordinateur | Groupe Hôtelier Belle-Rive · Paris → Lyon · 120 postes · Une visite sur place · Le matin · sans date | ✅ | — |
| 72 | Entreprise · projet important | Téléphone | Assurances Duroc · Lille → Paris · 45 postes · Une visio · L'après-midi · « Dans 2 à 3 mois » | ✅ | — |
| 73 | Entreprise · projet important | Ordinateur · cadre | Ateliers Mélodie · Toulouse → Bordeaux · Un appel d'abord · Indifférent · sans date | ✅ | — |
| 74 | Entreprise · projet important | Téléphone | Clinique Vétérinaire des Calanques · Marseille → Aix-en-Provence · Une visite sur place · 2027-09-01 | ✅ | — |
| 75 | Entreprise · projet important | Ordinateur | Banque Rhénane · Strasbourg → Metz · 60 postes · Une visio · « Dans plus de 3 mois » | ✅ | — |
| 76 | Entreprise · projet important | Téléphone | Conservatoire privé Allegro · Grenoble → Annecy · Un appel d'abord · Le matin · « Au second semestre 2027 » | ✅ | — |
| 77 | Entreprise · projet important | Ordinateur | Logistique Atlantique SA · Nantes → Angers · 300 postes · Une visite sur place · L'après-midi · sans date | ✅ | — |
| 78 | Entreprise · projet important | Téléphone · cadre | Kerjean & Le Floc'h Avocats · Rennes → Brest · 25 postes · Une visio · sans date | ✅ | — |
| 79 | Entreprise · projet important | Ordinateur | Communauté d'agglomération Grand Paris Sud · Évry-Courcouronnes → Massy · 80 postes · Une visite sur place · Le matin · sans date | ✅ | — |
| 80 | Entreprise · projet important | Téléphone | Caraïbes Import-Export · Fort-de-France → Paris · 12 postes · Un appel d'abord · sans date | ✅ | — |
| 81 | Salarié muté | Ordinateur | Aurélien Marchetti · Thales Alenia Space · Toulouse → Nice · 2027-04-20 · objets lourds | ✅ | — |
| 82 | Salarié muté | Téléphone | Élodie Gourmelon · Naval Group · Bordeaux → Brest · « Le mois prochain » | ✅ | — |
| 83 | Salarié muté | Ordinateur · cadre | Rémi Lefranc · SNCF Réseau · Lille → Reims · « Avant ma prise de poste, le 1er mars 2027 » | ✅ | — |
| 84 | Salarié muté | Téléphone | Christelle Ho-A-Chuck · Centre National d'Études Spatiales · Paris 11e Arrondissement → Cayenne · 2027-08-20 · Guyane | ✅ | — |
| 85 | Salarié muté | Ordinateur | Kevin Mendy · Carrefour · Évry-Courcouronnes → Rennes · « Dans 2 à 3 mois » · société reconnue (espace Carrefour) | ✅ | — |
| 86 | Salarié muté · espace pro | Téléphone | Sandrine Pelletier · Nancy → Dijon · 32 m³ saisis · ét. 2/0 · espace standard · lien de l'espace pro standard *(DEV-2026-0142, 2616 €, 216 km)* | ✅ | — |
| 87 | Salarié muté · espace pro | Ordinateur | Olivier Besnard · Massy → Bordeaux · liste de 3 meubles · ét. 3+asc/1 · espace safran · lien de l'espace Safran *(DEV-2026-0120, 1125 €, 603 km)* | ✅ | — |
| 88 | Salarié muté · espace pro | Téléphone | Fatou Diallo · Lille → Lyon · 35 m³ saisis · ét. 1/2+asc · espace carrefour · lien de l'espace Carrefour, vu par la RH *(DEV-2026-0143, 3444 €, 697 km)* | ✅ | — |
| 89 | Salarié muté | Ordinateur | Marc-Antoine Giudicelli · Corsica Linea · Strasbourg → Ajaccio · 2027-05-15 · vers la Corse | ✅ | — |
| 90 | Salarié muté | Téléphone | Julien Favre · Organisation mondiale de la santé · Lyon → Genève (Suisse) · « Dans plus de 3 mois » · vers la Suisse | ✅ | — |
| 91 | Erreur volontaire | Ordinateur | e-mail sans domaine (…@example) | ✅ | — |
| 92 | Erreur volontaire | Téléphone | e-mail avec une espace | ✅ | — |
| 93 | Erreur volontaire | Ordinateur | téléphone « 06 12 » | ✅ | — |
| 94 | Erreur volontaire | Téléphone | nom « Jean www.promo-demenagement.fr » | ✅ | — |
| 95 | Erreur volontaire | Ordinateur | ville « Zzyzx-sur-Mer » | ✅ | — |
| 96 | Erreur volontaire | Téléphone | mutation sans société, puis sans nom | ✅ | — |
| 97 | Erreur volontaire | Ordinateur | date du 30/06/2025 | ✅ | — |
| 98 | Erreur volontaire | Téléphone | message de 6 000 caractères | ✅ | — |
| 99 | Erreur volontaire | Ordinateur | nom de 87 caractères | ✅ | — |
| 100 | Erreur volontaire | Téléphone | volume -12 m³ puis 0 m³ | ✅ | — |
<!-- TABLEAU:FIN -->

## Écarts relevés, scénario par scénario

<!-- DETAIL:DEBUT -->
#### #018 — Particulier · express incomplet → /completer (Ordinateur) ✅

*Julie Garnier · source formulaire · manque : volume · complété : 26 m³* — demande `5cb9d333-2ba2-4dcc-832c-f5ad9701b78d`, devis DEV-2026-0099, estimation 2246.4 €, distance 463 km.

- *note* : écran replié sans montant (chiffrage plus lent que la patience de l'écran, ou sans distance)
- *note* : chiffrée après complétion : 2246.4 € (distance calculée par le serveur : 463 km)
- *note* : 2 fiches Créagidem préparées : à la création (sans volume : « rien après l'en-tête »), puis après la complétion
- captures : [018-fin.png](captures/018-fin.png) · [018-crm.png](captures/018-crm.png)

#### #019 — Particulier · express incomplet → /completer (Téléphone) ✅

*Thomas Lambert · source e-mail (n8n) · manque : arrivée, volume · complété : liste* — demande `3f0fc58f-183d-4c17-8ba1-47af1f0abf8f`, devis DEV-2026-0126, estimation 702.24 €, distance 127 km.

- *note* : écran replié sans montant (chiffrage plus lent que la patience de l'écran, ou sans distance)
- *note* : chiffrée après complétion : 702.24 € (distance calculée par le serveur : 127 km)
- *note* : demande venue d'un e-mail : 0 fiche(s) Créagidem (le code ne transmet que les demandes du formulaire)
- captures : [019-fin.png](captures/019-fin.png)

#### #020 — Particulier · express incomplet → /completer (Ordinateur) ✅

*Manon Lefebvre · source formulaire · manque : volume · complété : logement T4* — demande `b7c011f7-9e25-4f4e-b589-45eced150579`, devis DEV-2026-0101, estimation 2970 €, distance 242 km.

- *note* : écran replié sans montant (chiffrage plus lent que la patience de l'écran, ou sans distance)
- *note* : chiffrée après complétion : 2970 € (distance calculée par le serveur : 242 km)
- *note* : 2 fiches Créagidem préparées : à la création (sans volume : « rien après l'en-tête »), puis après la complétion
- captures : [020-fin.png](captures/020-fin.png)

#### #021 — Particulier · express incomplet → /completer (Téléphone) ✅

*Kévin Da Silva · source e-mail (n8n) · manque : volume · complété : liste* — demande `aca358a5-711a-4e81-b847-5f43580585d3`, devis DEV-2026-0127, estimation 540 €, distance 57 km.

- *note* : écran replié sans montant (chiffrage plus lent que la patience de l'écran, ou sans distance)
- *note* : chiffrée après complétion : 540 € (distance calculée par le serveur : 57 km)
- *note* : demande venue d'un e-mail : 0 fiche(s) Créagidem (le code ne transmet que les demandes du formulaire)
- captures : [021-fin.png](captures/021-fin.png)

#### #087 — Salarié muté · espace pro (Ordinateur) ✅

*Olivier Besnard · Massy → Bordeaux · liste de 3 meubles · ét. 3+asc/1 · espace safran · lien de l'espace Safran* — demande `0e22e2df-7f74-41a8-aad4-24f7d94b3390`, devis DEV-2026-0120, estimation 1125 €, distance 603 km.

- *note* : écran replié sans montant (chiffrage plus lent que la patience de l'écran, ou sans distance)
- captures : [087-relecture.png](captures/087-relecture.png) · [087-fin.png](captures/087-fin.png)

#### #088 — Salarié muté · espace pro (Téléphone) ✅

*Fatou Diallo · Lille → Lyon · 35 m³ saisis · ét. 1/2+asc · espace carrefour · lien de l'espace Carrefour, vu par la RH* — demande `622f8e67-2572-46ce-a8ec-5323d66333e4`, devis DEV-2026-0143, estimation 3444 €, distance 697 km.

- *note* : écran replié sans montant (chiffrage plus lent que la patience de l'écran, ou sans distance)
- captures : [088-relecture.png](captures/088-relecture.png) · [088-fin.png](captures/088-fin.png) · [088-rh.png](captures/088-rh.png)

#### #095 — Erreur volontaire (Ordinateur) ✅

*ville « Zzyzx-sur-Mer »* — demande `29537f71-ebc1-4903-9e21-67ce3a022692`.

- *note* : demande créée : départ « Zzyzx-sur-Mer », distance null km, estimation null €, Créagidem distance 0.00
- *base d'adresses réelle* : « Zzyzx-sur-Mer » → Vaux-sur-Mer 17640 (score 0.47), Fos-sur-Mer 13270 (score 0.42), Cayeux-sur-Mer 80410 (score 0.42)
- captures : [095-fin.png](captures/095-fin.png)

#### #099 — Erreur volontaire (Ordinateur) ✅

*nom de 87 caractères* — demande `—`.

- *note* : nom de 86 caractères
- captures : [099-refus.png](captures/099-refus.png)

<!-- DETAIL:FIN -->

## Bilan des devis et du nettoyage (passage principal)

<!-- BILAN:DEBUT -->
### Références de devis

3 devis brouillons créés par la campagne ; références en double : aucune ; mal formées : aucune.

### Nettoyage de la recette

Le 18/11/2026 11:15:55 — retiré : envois_evenements 0, envois_liens 13, envois (par référence) 7, crm.alertes_evenements 7, photos (stockage) 1, devis 3, requests 7, emails 7, crm.agents_terrain 1, team_members (désactivés) 1, auth.users 5, auth (équipe bannie) 1. Restes : aucun.
<!-- BILAN:FIN -->

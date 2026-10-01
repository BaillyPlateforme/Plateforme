# Charte graphique — Bailly Déménagement

Relevée sur [demenagements-bailly.com](https://www.demenagements-bailly.com) le 1ᵉʳ octobre 2026
(feuille de style Elementor `post-61.css`, page RGPD pour les fichiers du logo).
Elle fait foi pour la plateforme : tout écart doit être volontaire et noté ici.

## Couleurs

| Rôle | Hex | Où |
|---|---|---|
| **Jaune** | `#F5D033` | La couleur de la marque. Pastille du menu, boutons d'appel, jauges, tuiles, séries de graphiques. 117 occurrences sur le site. |
| **Noir** | `#1B1A18` | Texte, boutons pleins, bandeaux, le carré du logo. 110 occurrences. |
| **Gris** | `#615F68` | Texte secondaire. 34 occurrences. |
| Blanc | `#FFFFFF` | Cartes et surfaces. |

Le jaune **ne se lit pas sur blanc** (contraste 1,6:1). Pour du texte jaune,
utiliser le brun doré `#8A6F00` (5:1 sur blanc) — c'est le jeton `--color-brand-ink`.
Sur fond noir, le jaune pur convient.

Les jetons sont définis dans [`src/app/globals.css`](../src/app/globals.css).

## Typographie

Le site compose en **Roboto**. Les globales Elementor :

| Usage | Famille | Graisse |
|---|---|---|
| Titres | Roboto | 600 |
| Sous-titres | Roboto Slab | 400 |
| Texte courant | Roboto | 400 |
| Liens | Roboto | 500 |

La plateforme charge **Roboto** en 400/500/700/900, déclarée une seule fois dans
[`src/app/layout.tsx`](../src/app/layout.tsx) et servie par la variable
`--font-rail`. Roboto Slab n'est pas chargée : elle ne sert nulle part dans
l'application, et une famille chargée pour rien se paie au premier affichage.

Le mot « BAILLY » du logo est une grotesque grasse qui n'est pas Roboto : elle
appartient au dessin du logo et ne se recompose pas. On utilise le fichier.

## Logo

Trois fichiers, dans [`logo/`](logo/) à l'original et dans
[`public/marque/`](../public/marque/) pour ce que l'application sert.

| Fichier | Quand |
|---|---|
| `bailly-logo.svg` | Fond clair. Carré noir, mot en noir, porteurs en jaune. |
| `bailly-logo-blanc.svg` | Fond sombre ou photo. Mot et sous-titre en blanc. |
| `bailly-symbole.svg` | Le carré seul, quand la place manque — rail, pastille, favicon. |
| `bailly-favicon.png` | L'icône d'onglet, reprise en `src/app/icon.png`. |

Le symbole est découpé du logo complet. Les quatre caches blancs qui
arrondissaient ses angles ont été remplacés par un vrai détourage : ils se
voyaient en blanc dès que le fond n'était pas blanc.

### Règles d'emploi

- Le logo complet demande **130 px de large au minimum** : en dessous, la ligne
  « BD MOVING | GROUP » devient illisible. Préférer alors le symbole.
- Garder autour du logo une marge au moins égale à la hauteur du carré.
- Ne pas recolorer, ne pas déformer, ne pas poser le logo couleur sur un fond
  sombre : il existe une version blanche pour cela.

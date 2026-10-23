# Pop-ups pédagogiques des espaces membres

- `popup.js` : affiche dans un espace membre le pop-up pédagogique prévu pour cet espace, entre sa date de début et son échéance
- `donnees.json` : les pop-ups en cours et programmés, réécrit automatiquement à chaque changement (ne pas modifier à la main)
- `reglages.json` : réglages tenus à la main (espace des aperçus, couleurs, pages témoins des groupes)

Les deux fichiers de données ne contiennent que le texte des pop-ups et des réglages : aucune donnée de membre. Ils sont publics : jamais de lien privé dans un message, ni d'annonce à garder secrète avant sa date.

## Appel dans un espace

Une ligne dans le code d'en-tête de la formation :

```html
<script src="https://cdn.jsdelivr.net/gh/ORGANISATION/DEPOT@1/popup.js" data-donnees="https://raw.githubusercontent.com/ORGANISATION/DEPOT/main/donnees.json" async></script>
```

`reglages.json` est lu à côté de `donnees.json` (même dossier), sauf si `data-reglages` donne une autre adresse.

## Format de donnees.json

```json
{ "v": "2026-10-24T08:00:00Z",
  "popups": [ { "id": "86c1abc", "espaces": ["90727 3C1"], "groupes": [], "titre": "Thé Club du 14/11",
                "message": "Bonjour {prenom},[br]...", "debut": "1793001600000", "fin": "1793606400000", "apercu": false } ] }
```

- `espaces` : liste ou texte séparé par des virgules ; seul le nombre de 4 chiffres ou plus compte ("90727 3C1" = 90727)
- `debut`, `fin` : millisecondes ou date ISO ; `apercu` : vrai pour une demande pas encore validée, montrée sur l'espace des aperçus seulement
- `message` : `**gras**`, `[texte](https://lien)`, `[br]` pour un retour à la ligne, `{prenom}` pour le prénom ; aucun HTML n'est interprété

## Format de reglages.json

```json
{ "apercu": "88132", "couleur": "#C89D2C",
  "couleurs": { "90727": "#68bbdb" },
  "temoins": { "89868": { "Nom du groupe": ["idpage=1234567"] } } }
```

- `couleurs` : couleur d'en-tête par espace, sinon `couleur` ; le texte passe en blanc ou en foncé selon le contraste
- `temoins` : pour chaque espace, chaque groupe et un morceau du lien d'une page que seul ce groupe voit ; un pop-up ciblé sur un groupe absent d'ici n'est montré à personne

## Publier une nouvelle version de popup.js

1. Déposer le nouveau `popup.js` sur `main`
2. Créer une version (release) avec un numéro suivant : `v1.1.0`, `v1.2.0`... (`@1` dans l'appel sert toujours la plus récente des `v1.x.x`)
3. Ouvrir `https://purge.jsdelivr.net/gh/ORGANISATION/DEPOT@1/popup.js` pour vider le cache de jsDelivr

Retour arrière : publier une version suivante avec l'ancien code, puis vider le cache. Un changement qui casse l'appel (nouveaux attributs, autre format) prend `v2.0.0` et une nouvelle ligne d'appel.

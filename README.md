# World Cup 2026

Site personnel pour suivre la Coupe du Monde 2026 : matchs, résultats, groupes, fiches équipes, buteurs, performances joueurs et actualités.

## Fonctionnalités

- Tableau de bord du tournoi.
- Matchs et résultats avec recherche.
- Groupes, classements et équipes suivies.
- Fiches équipes avec effectif, parcours et prochains matchs.
- Stats de tournoi : équipes efficaces, buteurs, performances joueurs.
- Données servies par un proxy PHP avec cache.

## Installation

1. Copier `api/config.example.php` vers `api/config.php`.
2. Créer un fichier `.env` à la racine du projet.
3. Renseigner les variables nécessaires :

```env
FOOTBALL_DATA_TOKEN=
NEWS_API_TOKEN=
THESPORTSDB_API_KEY=
CACHE_DIR=
```

4. Servir le dossier avec PHP/Apache.

## Sécurité

`api/config.php`, `.env`, les caches et les logs sont exclus du dépôt. Ne jamais publier les tokens API.

## Validation

```powershell
node --check "assets/app.js"
php -l "api/data.php"
php -l "config/app.php"
```

## Signature

Built to make public data readable.

[by psyom](https://psyom.eu/)

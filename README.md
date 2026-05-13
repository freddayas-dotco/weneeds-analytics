# Weneeds Analytics Pipeline

[![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10.3-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Power BI](https://img.shields.io/badge/Power%20BI-Desktop-F2C811?logo=powerbi&logoColor=black)](https://powerbi.microsoft.com/)

---

## Contexte

**Weneeds Analytics Pipeline** est un pipeline end-to-end d'analyse des données de visites de la plateforme d'emploi **Weneeds**. Il transforme les exports bruts de tracking (sessions, pages vues, sources de trafic) en un jeu de données propre, exposé via une API REST, et visualisé dans un dashboard Power BI à destination des équipes produit, marketing et direction.

L'objectif est double :

- Donner aux équipes une vision **fiable et homogène** du comportement des visiteurs (recruteurs et candidats).
- Mettre en évidence les **points de friction** du parcours utilisateur (rebond, pages peu engageantes, sources non identifiées) pour prioriser les actions d'amélioration.

---

## Architecture

```
┌────────────────┐    ┌──────────────────┐    ┌──────────────────┐    ┌───────────────┐
│  CSV bruts     │───▶│  Pipeline Python │───▶│   API NestJS     │───▶│   Power BI    │
│  (data/raw)    │    │  pandas / numpy  │    │  endpoints REST  │    │   Dashboard   │
└────────────────┘    └──────────────────┘    └──────────────────┘    └───────────────┘
```

1. **CSV bruts** : exports de l'outil de tracking Weneeds (`visitors.csv`, `page_views.csv`…).
2. **Pipeline Python** (`pipeline_weneeds.py`) : nettoyage, déduplication, exclusion des bots, normalisation des chemins, calcul des métriques par session/page, écriture dans `data/clean/`.
3. **API NestJS** (`weneeds-api/`) : lit les CSV propres et expose des endpoints REST agrégés (résumé, top pages, sources, devices, timeline…).
4. **Power BI** : se connecte aux endpoints REST via le connecteur Web et alimente le dashboard.

---

## Technologies utilisées

| Couche            | Outil             | Version |
| ----------------- | ----------------- | ------- |
| Pipeline          | Python            | 3.11    |
| Pipeline          | pandas            | latest  |
| Pipeline          | numpy             | latest  |
| API               | NestJS            | 10.3    |
| API               | TypeScript        | 5.3     |
| API               | csv-parse         | 5.5     |
| API               | Node.js           | 20.x    |
| Visualisation     | Power BI Desktop  | latest  |

---

## Installation

### Prérequis

- Python ≥ 3.10
- Node.js ≥ 20
- Power BI Desktop (pour ouvrir le `.pbix`)

### 1. Cloner le dépôt

```bash
git clone https://github.com/freddayas-dotco/weneeds-analytics.git
cd weneeds-analytics
```

### 2. Exécuter le pipeline Python

```bash
pip install -r requirements.txt
python pipeline_weneeds.py
```

Les CSV nettoyés sont écrits dans `data/clean/`.

### 3. Lancer l'API NestJS

```bash
cd weneeds-api
npm install
npm run start
```

L'API démarre sur `http://localhost:3000`.

### 4. Brancher Power BI

Dans Power BI Desktop : **Obtenir des données → Web** et utiliser une URL parmi les endpoints listés ci-dessous.

---

## Endpoints API

Toutes les routes acceptent les paramètres optionnels de filtre : `startDate` (`YYYY-MM-DD`), `endDate`, `month` (1–12), `year` (sauf mention contraire).

| Méthode | Endpoint                            | Description                                                                           |
| ------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| GET     | `/analytics/summary`                | KPI globaux : visites, visiteurs uniques, taux de rebond, engagement, durée moyenne. |
| GET     | `/analytics/top-pages`              | Top pages par nombre de vues (agrégeable par mois côté Power BI).                     |
| GET     | `/analytics/top-pages-global`       | Top pages avec **vraies moyennes globales** (filtre uniquement par `year`).           |
| GET     | `/analytics/traffic-sources`        | Répartition du trafic par source.                                                     |
| GET     | `/analytics/devices`                | Sessions et part de marché par device.                                                |
| GET     | `/analytics/browsers`               | Sessions par navigateur.                                                              |
| GET     | `/analytics/timeline`               | Sessions et bounce rate par période (`groupBy=month|day|hour`).                       |
| GET     | `/analytics/sessions`               | Lignes brutes de session (1 ligne = 1 session) pour agrégation côté Power BI.         |
| GET     | `/analytics/countries`              | Répartition factice par pays (en attendant les vraies données géo).                   |
| GET     | `/analytics/pageviews-total`        | Nombre total de pages vues.                                                           |

---

## Résultats clés

Sur la période d'analyse (échantillon brut nettoyé) :

- **1 441 sessions** enregistrées.
- **83 % de taux de rebond** — la grande majorité des visiteurs quittent après une seule page.
- **46 % de trafic non identifié** — près d'un visiteur sur deux arrive sans source attribuée, signal fort pour la stratégie d'acquisition et le tagging.

Ces résultats orientent les recommandations produit (réduire la friction en page d'accueil, améliorer la collecte des UTM) consignées dans le dashboard Power BI.

---

## Structure du projet

```
weneeds-analytics/
├── data/
│   ├── raw/                  # CSV bruts (exports tracking)
│   └── clean/                # CSV nettoyés (sortie du pipeline, gitignorés)
├── docs/                     # Documents projet (specs, bilans, captures)
├── weneeds-api/              # API NestJS
│   ├── src/
│   │   ├── analytics/        # controller / service / module analytics
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── package.json
│   └── tsconfig.json
├── pipeline_weneeds.py       # Pipeline de nettoyage Python
├── api.py                    # Prototype FastAPI (legacy, conservé pour référence)
├── requirements.txt          # Dépendances Python
├── .gitignore
└── README.md
```

---

⚠️ Les données brutes de visites ne sont pas incluses dans ce repo pour des raisons de confidentialité (RGPD).
Pour tester le pipeline, remplace les fichiers dans data/raw/ par vos propres exports.

_Projet réalisé dans le cadre d'un stage analytics chez Weneeds._

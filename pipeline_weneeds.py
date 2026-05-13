"""
pipeline_weneeds.py
-------------------
Pipeline de nettoyage des données Weneeds.
Lit les CSV bruts dans data/raw/ et exporte les CSV propres dans data/clean/.

Usage :
    python pipeline_weneeds.py
"""

import pandas as pd
import numpy as np
from pathlib import Path

# ─── Configuration ────────────────────────────────────────────────────────────

DATA_DIR   = Path("data/raw")
OUTPUT_DIR = Path("data/clean")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

pd.set_option("display.max_columns", None)
pd.set_option("display.float_format", "{:.2f}".format)

# IP identifiée comme bot à exclure
BOT_IP = "90.26.59.45"

# Mapping des chemins normalisés vers des noms lisibles
PAGE_NAMES = {
    "/":                                        "Accueil",
    "/job-offer/[id]":                          "Page Offre d'emploi",
    "/job-offer/edit/[id]":                     "Édition Offre d'emploi",
    "/job-offer/prospects/[id]":                "Gestion Prospects",
    "/user/profile/[id]":                       "Profil Candidat",
    "/user/profile/edit/[id]":                  "Édition Profil Candidat",
    "/company/profile/[id]":                    "Profil Entreprise",
    "/company/profile/edit/[id]":               "Édition Profil Entreprise",
    "/onboarding":                              "Onboarding",
    "/notifications":                           "Notifications",
    "/user/profile/settings/company":           "Paramètres Entreprise",
    "/user/profile/settings/identity":          "Paramètres Identité",
    "/user/profile/settings/notification":      "Paramètres Notifications",
    "/user/profile/settings/security":          "Paramètres Sécurité",
    "/user/profile/settings/calendar":          "Paramètres Calendrier",
    "/politique-de-confidentialite":            "Politique de Confidentialité",
    "/recherche":                               "Recherche",
    "/messages":                                "Messages",
    "/dashboard-company":                       "Dashboard Entreprise",
    "/calendar/connect":                        "Connexion Calendrier",
}


# ─── Fonctions utilitaires ────────────────────────────────────────────────────

def simplify_referer(ref):
    """Catégorise une URL de provenance en source lisible."""
    ref_str = str(ref).lower()
    if ref_str == "nan":                                    return "Direct / Aucun"
    if "google" in ref_str:                                 return "Google"
    if "tiktok" in ref_str:                                 return "TikTok"
    if "facebook" in ref_str or "instagram" in ref_str:    return "Meta (FB/IG)"
    if "linkedin" in ref_str:                               return "LinkedIn"
    if "twitter" in ref_str or "x.com" in ref_str:         return "Twitter/X"
    if "weneeds.com" in ref_str:                            return "Navigation interne"
    if "coming-soon" in ref_str:                            return "Coming Soon"
    return "Autre"


def get_page_name(path):
    """Convertit un chemin normalisé en nom de page lisible."""
    path = str(path).strip("'").strip()

    # Correspondance exacte dans le dictionnaire
    if path in PAGE_NAMES:
        return PAGE_NAMES[path]

    # Artefacts de normalisation
    if path == "/[id]":                     return "Page Offre d'emploi"
    if path == "/[id]/edit/[id]":           return "Édition Offre d'emploi"
    if path == "/[id]/[id]":                return "Détail Offre d'emploi"
    if path == "/[id]/prospects/[id]":      return "Gestion Prospects"
    if path == "/matching":                 return "Page Obsolète"

    # Patterns dynamiques
    if path.startswith("/profile/view/"):   return "Profil Public Partagé"
    if path.startswith("/t/"):              return "Lien de Partage (tracking)"

    return "Autre"


# ─── Étape 1 : Chargement ─────────────────────────────────────────────────────

def charger_donnees():
    """Charge les 5 CSV bruts depuis data/raw/."""
    visitors        = pd.read_csv(DATA_DIR / "visitors.csv")
    page_views      = pd.read_csv(DATA_DIR / "page_views.csv")
    unique_visitors = pd.read_csv(DATA_DIR / "unique_visitors.csv")
    top_pages       = pd.read_csv(DATA_DIR / "top_pages.csv")
    summary         = pd.read_csv(DATA_DIR / "summary.csv")

    print("✅ Fichiers chargés")
    print(f"  visitors        : {visitors.shape}")
    print(f"  page_views      : {page_views.shape}")
    print(f"  unique_visitors : {unique_visitors.shape}")
    print(f"  top_pages       : {top_pages.shape}")
    print(f"  summary         : {summary.shape}")

    return visitors, page_views, unique_visitors, top_pages, summary


# ─── Étape 2 : Nettoyage visitors ────────────────────────────────────────────

def nettoyer_visitors(visitors):
    """
    Nettoyage de visitors :
    - Supprime le bot (BOT_IP)
    - Supprime les sessions > 1h ou négatives
    - Supprime les doublons sur session_id
    - Convertit les colonnes dates
    - Ajoute la colonne source (provenance)
    """
    avant = len(visitors)

    # Suppression bot + sessions aberrantes
    df = visitors[
        (visitors["ip_address"] != BOT_IP) &
        (visitors["session_duration_seconds"] <= 3600) &
        (visitors["session_duration_seconds"] >= 0)
    ].copy()

    # Suppression des doublons sur session_id (on garde la session la plus longue)
    df = df.sort_values("session_duration_seconds", ascending=False) \
           .drop_duplicates(subset=["session_id"], keep="first") \
           .reset_index(drop=True)

    # Conversion des dates
    df["session_started_at"]   = pd.to_datetime(df["session_started_at"], format="ISO8601", utc=True)
    df["session_ended_at"]     = pd.to_datetime(df["session_ended_at"],   format="ISO8601", utc=True)
    df["session_started_date"] = pd.to_datetime(df["session_started_date"])

    # Ajout colonne source
    df["source"] = df["referer"].fillna("Direct / Aucun").apply(simplify_referer)

    print(f"✅ visitors nettoyé : {avant} → {len(df)} lignes "
          f"({avant - len(df)} supprimées)")
    return df


# ─── Étape 3 : Nettoyage page_views ──────────────────────────────────────────

def nettoyer_page_views(page_views, visitors_clean):
    """
    Nettoyage de page_views :
    - Ne garde que les sessions valides (présentes dans visitors_clean)
    - Supprime les referers localhost
    - Convertit les colonnes dates
    - Ajoute referer_source et page_name
    """
    avant = len(page_views)
    sessions_valides = set(visitors_clean["session_id"])

    df = page_views[page_views["session_id"].isin(sessions_valides)].copy()

    # Suppression des lignes localhost
    df = df[~df["referer"].str.contains("localhost", na=False)].copy()

    # Conversion des dates
    df["timestamp"] = pd.to_datetime(df["timestamp"], format="ISO8601", utc=True)
    df["date"]      = pd.to_datetime(df["date"])

    # Ajout colonnes catégorisées
    df["referer_source"] = df["referer"].apply(simplify_referer)
    df["page_name"]      = df["normalized_path"].apply(get_page_name)

    print(f"✅ page_views nettoyé : {avant} → {len(df)} lignes "
          f"({avant - len(df)} supprimées)")
    return df


# ─── Étape 4 : Nettoyage unique_visitors ─────────────────────────────────────

def nettoyer_unique_visitors(unique_visitors):
    """
    Nettoyage de unique_visitors :
    - Supprime le bot (BOT_IP)
    - Convertit les colonnes dates
    """
    avant = len(unique_visitors)

    df = unique_visitors[unique_visitors["ip_address"] != BOT_IP].copy()

    df["first_visit"] = pd.to_datetime(df["first_visit"], format="ISO8601", utc=True)
    df["last_visit"]  = pd.to_datetime(df["last_visit"],  format="ISO8601", utc=True)

    print(f"✅ unique_visitors nettoyé : {avant} → {len(df)} lignes "
          f"({avant - len(df)} supprimées)")
    return df


# ─── Étape 5 : Calcul top_pages ──────────────────────────────────────────────

def calculer_top_pages(page_views_clean):
    """
    Recalcule top_pages depuis page_views_clean :
    - Agrège par normalized_path
    - Calcule vues, sessions uniques, temps moyen, scroll moyen
    - Ajoute page_name
    """
    df = (
        page_views_clean
        .groupby("normalized_path")
        .agg(
            views            = ("session_id", "count"),
            unique_sessions  = ("session_id", "nunique"),
            avg_time_on_page_seconds = ("time_on_page_seconds", "mean"),
            avg_time_on_page_minutes = ("time_on_page_seconds", lambda x: x.mean() / 60),
            avg_scroll_depth = ("scroll_depth_pct", "mean")
        )
        .reset_index()
        .sort_values("views", ascending=False)
    )

    df["page_name"] = df["normalized_path"].apply(get_page_name)

    print(f"✅ top_pages calculé : {len(df)} pages")
    return df


# ─── Étape 6 : Calcul summary ────────────────────────────────────────────────

def calculer_summary(visitors_clean, page_views_clean):
    """Calcule les KPIs globaux en une seule ligne."""
    df = pd.DataFrame([{
        "total_visits": len(visitors_clean),
        "unique_visitors": visitors_clean["ip_address"].nunique(),
        "total_page_views": len(page_views_clean),
        "avg_session_duration_seconds": round(
            visitors_clean[visitors_clean["session_duration_seconds"] > 0]
            ["session_duration_seconds"].mean(), 1
        ),
        "bounce_rate_pct":  round(visitors_clean["is_bounce"].mean() * 100, 1),
        "taux_retour_pct":  round(visitors_clean["is_returning_visitor"].mean() * 100, 1)
    }])

    print(f"✅ summary calculé")
    return df


# ─── Étape 7 : Export CSV ────────────────────────────────────────────────────

def exporter_csv(visitors_clean, page_views_clean, unique_visitors_clean,
                 top_pages_clean, summary_clean):
    """Exporte les 5 DataFrames propres dans data/clean/."""
    visitors_clean.to_csv(       OUTPUT_DIR / "visitors_clean.csv",        index=False)
    page_views_clean.to_csv(     OUTPUT_DIR / "page_views_clean.csv",      index=False)
    unique_visitors_clean.to_csv(OUTPUT_DIR / "unique_visitors_clean.csv", index=False)
    top_pages_clean.to_csv(      OUTPUT_DIR / "top_pages_clean.csv",       index=False)
    summary_clean.to_csv(        OUTPUT_DIR / "summary_clean.csv",         index=False)

    print("\n✅ Export terminé dans data/clean/")
    print(f"  visitors_clean        : {len(visitors_clean)} lignes | {len(visitors_clean.columns)} colonnes")
    print(f"  page_views_clean      : {len(page_views_clean)} lignes | {len(page_views_clean.columns)} colonnes")
    print(f"  unique_visitors_clean : {len(unique_visitors_clean)} lignes | {len(unique_visitors_clean.columns)} colonnes")
    print(f"  top_pages_clean       : {len(top_pages_clean)} lignes | {len(top_pages_clean.columns)} colonnes")
    print(f"  summary_clean         : {len(summary_clean)} ligne | {len(summary_clean.columns)} colonnes")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 50)
    print("  Pipeline Weneeds — Nettoyage des données")
    print("=" * 50)

    # 1. Chargement
    visitors, page_views, unique_visitors, top_pages, summary = charger_donnees()

    # 2. Nettoyage
    visitors_clean        = nettoyer_visitors(visitors)
    page_views_clean      = nettoyer_page_views(page_views, visitors_clean)
    unique_visitors_clean = nettoyer_unique_visitors(unique_visitors)

    # 3. Agrégations
    top_pages_clean = calculer_top_pages(page_views_clean)
    summary_clean   = calculer_summary(visitors_clean, page_views_clean)

    # 4. Export
    exporter_csv(visitors_clean, page_views_clean, unique_visitors_clean,
                 top_pages_clean, summary_clean)

    print("\n🎉 Pipeline terminé avec succès !")


if __name__ == "__main__":
    main()

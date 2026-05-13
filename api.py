"""
api.py
------
API FastAPI exposant le pipeline de nettoyage Weneeds.

Lancement :
    uvicorn api:app --reload
    # puis ouvrir http://127.0.0.1:8000/docs
"""

from pathlib import Path
from typing import Optional

import pandas as pd
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse

from pipeline_weneeds_copy import (
    DATA_DIR,
    OUTPUT_DIR,
    main as run_pipeline,
)

app = FastAPI(
    title="Weneeds Pipeline API",
    description="API pour lancer le pipeline de nettoyage des données Weneeds.",
    version="1.0.0",
)


# ─── Endpoints utilitaires ────────────────────────────────────────────────────

@app.get("/", tags=["Info"])
def root():
    """Page d'accueil de l'API."""
    return {
        "name": "Weneeds Pipeline API",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": {
            "POST /pipeline/run":           "Lance le pipeline complet",
            "GET  /data/raw":               "Liste les fichiers CSV bruts",
            "GET  /data/clean":             "Liste les fichiers CSV nettoyés",
            "GET  /data/summary":           "Récupère le summary nettoyé (JSON)",
            "GET  /data/top-pages":         "Récupère le top_pages nettoyé (JSON)",
            "GET  /data/{name}/download":   "Télécharge un CSV nettoyé",
            "POST /data/upload/{name}":     "Upload un CSV brut (visitors, page_views, ...)",
        },
    }


@app.get("/health", tags=["Info"])
def health():
    """Endpoint de health check."""
    return {"status": "ok"}


# ─── Pipeline ─────────────────────────────────────────────────────────────────

@app.post("/pipeline/run", tags=["Pipeline"])
def pipeline_run(
    data_dir: Optional[str] = None,
    output_dir: Optional[str] = None,
):
    """
    Lance le pipeline de nettoyage complet.

    - **data_dir** : dossier des CSV bruts (défaut : data/raw)
    - **output_dir** : dossier de sortie (défaut : data/clean)
    """
    in_dir  = Path(data_dir)   if data_dir   else DATA_DIR
    out_dir = Path(output_dir) if output_dir else OUTPUT_DIR

    if not in_dir.exists():
        raise HTTPException(status_code=404, detail=f"Dossier introuvable : {in_dir}")

    try:
        result = run_pipeline(in_dir, out_dir)
        return JSONResponse(content=result)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=f"Fichier manquant : {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur pipeline : {e}")


# ─── Lecture des données ──────────────────────────────────────────────────────

@app.get("/data/raw", tags=["Data"])
def list_raw():
    """Liste les CSV bruts présents dans data/raw."""
    if not DATA_DIR.exists():
        return {"files": []}
    return {"files": [f.name for f in DATA_DIR.glob("*.csv")]}


@app.get("/data/clean", tags=["Data"])
def list_clean():
    """Liste les CSV nettoyés présents dans data/clean."""
    if not OUTPUT_DIR.exists():
        return {"files": []}
    return {"files": [f.name for f in OUTPUT_DIR.glob("*.csv")]}


@app.get("/data/summary", tags=["Data"])
def get_summary():
    """Retourne le summary nettoyé en JSON."""
    file = OUTPUT_DIR / "summary_clean.csv"
    if not file.exists():
        raise HTTPException(
            status_code=404,
            detail="summary_clean.csv introuvable. Lance d'abord POST /pipeline/run.",
        )
    return pd.read_csv(file).to_dict(orient="records")


@app.get("/data/top-pages", tags=["Data"])
def get_top_pages(limit: int = 20):
    """Retourne les top_pages nettoyées (limitées à `limit` lignes)."""
    file = OUTPUT_DIR / "top_pages_clean.csv"
    if not file.exists():
        raise HTTPException(
            status_code=404,
            detail="top_pages_clean.csv introuvable. Lance d'abord POST /pipeline/run.",
        )
    return pd.read_csv(file).head(limit).to_dict(orient="records")


@app.get("/data/{name}/download", tags=["Data"])
def download_clean(name: str):
    """
    Télécharge un fichier CSV nettoyé.

    `name` doit être l'un de :
    visitors, page_views, unique_visitors, top_pages, summary.
    """
    allowed = {"visitors", "page_views", "unique_visitors", "top_pages", "summary"}
    if name not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Nom invalide. Valeurs acceptées : {sorted(allowed)}",
        )

    file = OUTPUT_DIR / f"{name}_clean.csv"
    if not file.exists():
        raise HTTPException(
            status_code=404,
            detail=f"{file.name} introuvable. Lance d'abord POST /pipeline/run.",
        )
    return FileResponse(file, media_type="text/csv", filename=file.name)


# ─── Upload de CSV bruts ──────────────────────────────────────────────────────

@app.post("/data/upload/{name}", tags=["Data"])
async def upload_raw(name: str, file: UploadFile = File(...)):
    """
    Upload un CSV brut dans data/raw/.

    `name` doit être l'un de :
    visitors, page_views, unique_visitors, top_pages, summary.
    """
    allowed = {"visitors", "page_views", "unique_visitors", "top_pages", "summary"}
    if name not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Nom invalide. Valeurs acceptées : {sorted(allowed)}",
        )

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    target = DATA_DIR / f"{name}.csv"
    content = await file.read()
    target.write_bytes(content)

    return {
        "status": "uploaded",
        "file": str(target),
        "size_bytes": len(content),
    }

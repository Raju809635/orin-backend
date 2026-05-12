from __future__ import annotations

import os
from pathlib import Path


ENGINE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ENGINE_ROOT.parent
BACKEND_ROOT = REPO_ROOT / "orin-backend"

ACADEMIC_DATASET_DIR = Path(
    os.getenv("ORIN_ACADEMIC_DATASET_DIR", BACKEND_ROOT / "data" / "academics" / "final_dataset")
)
AGGREGATE_DATASET_PATH = Path(
    os.getenv("ORIN_AGGREGATE_DATASET_PATH", BACKEND_ROOT / "data" / "academics" / "orin_academic_dataset.json")
)

STORAGE_DIR = Path(os.getenv("ORIN_AI_STORAGE_DIR", ENGINE_ROOT / "storage"))
CHROMA_DIR = STORAGE_DIR / "chroma"
FAISS_DIR = STORAGE_DIR / "faiss"
GRAPH_DIR = STORAGE_DIR / "graphs"

DEFAULT_EMBEDDING_MODEL = os.getenv("ORIN_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
DEFAULT_COLLECTION = os.getenv("ORIN_CHROMA_COLLECTION", "orin_academic_chunks")


def ensure_storage_dirs() -> None:
    for directory in (STORAGE_DIR, CHROMA_DIR, FAISS_DIR, GRAPH_DIR):
        directory.mkdir(parents=True, exist_ok=True)

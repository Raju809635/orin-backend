from __future__ import annotations

from typing import Any

import chromadb
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .config import (
    ACADEMIC_DATASET_DIR,
    AGGREGATE_DATASET_PATH,
    CHROMA_DIR,
    DEFAULT_COLLECTION,
    DEFAULT_EMBEDDING_MODEL,
    STORAGE_DIR,
)
from .retrieval import retrieve


app = FastAPI(
    title="ORIN AI Engine",
    description="Adaptive academic intelligence service for ORIN.",
    version="0.1.0",
)


class RetrievalRequest(BaseModel):
    query: str = Field(..., min_length=2)
    board: str | None = "SSC"
    classLevel: int | None = 10
    subject: str | None = None
    chapter: str | None = None
    topK: int = Field(8, ge=1, le=20)


class RetrievalResponse(BaseModel):
    results: list[dict[str, Any]]
    count: int


def _collection_count() -> int | None:
    if not CHROMA_DIR.exists():
        return None
    try:
        client = chromadb.PersistentClient(path=str(CHROMA_DIR))
        collection = client.get_collection(name=DEFAULT_COLLECTION)
        return collection.count()
    except Exception:
        return None


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "orin-ai-engine", "status": "ok"}


@app.get("/health")
def health() -> dict[str, Any]:
    chunk_count = _collection_count()
    return {
        "status": "ok" if chunk_count else "not_ready",
        "storageDir": str(STORAGE_DIR),
        "chromaDir": str(CHROMA_DIR),
        "collection": DEFAULT_COLLECTION,
        "embeddingModel": DEFAULT_EMBEDDING_MODEL,
        "chunkCount": chunk_count or 0,
        "academicDatasetDirExists": ACADEMIC_DATASET_DIR.exists(),
        "aggregateDatasetExists": AGGREGATE_DATASET_PATH.exists(),
    }


@app.post("/retrieve", response_model=RetrievalResponse)
def retrieve_context(payload: RetrievalRequest) -> RetrievalResponse:
    chunk_count = _collection_count()
    if not chunk_count:
        raise HTTPException(
            status_code=503,
            detail="Academic vector index is not ready. Build or attach storage before retrieval.",
        )

    try:
        results = retrieve(
            query=payload.query,
            board=payload.board,
            class_level=payload.classLevel,
            subject=payload.subject,
            chapter=payload.chapter,
            top_k=payload.topK,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Retrieval engine is unavailable: {exc}",
        ) from exc
    return RetrievalResponse(results=results, count=len(results))

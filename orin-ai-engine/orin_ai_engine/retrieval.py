from __future__ import annotations

import argparse
import json
import sys
from functools import lru_cache
from typing import Any

import chromadb
from sentence_transformers import SentenceTransformer

from .config import CHROMA_DIR, DEFAULT_COLLECTION, DEFAULT_EMBEDDING_MODEL
from .text_utils import clean_text


def _where(board: str | None, class_level: int | None, subject: str | None, chapter: str | None) -> dict[str, Any] | None:
    clauses = []
    if board:
        clauses.append({"board": board.upper()})
    if class_level:
        clauses.append({"class_level": int(class_level)})
    if subject:
        clauses.append({"subject": subject})
    if chapter:
        clauses.append({"chapter": chapter})
    if not clauses:
        return None
    if len(clauses) == 1:
        return clauses[0]
    return {"$and": clauses}


@lru_cache(maxsize=2)
def get_embedding_model(model_name: str = DEFAULT_EMBEDDING_MODEL) -> SentenceTransformer:
    return SentenceTransformer(model_name)


def retrieve(
    query: str,
    board: str | None = "SSC",
    class_level: int | None = 10,
    subject: str | None = None,
    chapter: str | None = None,
    top_k: int = 8,
    model_name: str = DEFAULT_EMBEDDING_MODEL,
    collection_name: str = DEFAULT_COLLECTION,
) -> list[dict[str, Any]]:
    model = get_embedding_model(model_name)
    embedding = model.encode([query], normalize_embeddings=True, show_progress_bar=False)[0].tolist()
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    collection = client.get_or_create_collection(name=collection_name)
    result = collection.query(
        query_embeddings=[embedding],
        n_results=max(top_k, 24),
        where=_where(board, class_level, subject, chapter),
        include=["documents", "metadatas", "distances"],
    )
    query_terms = set(clean_text(query).lower().split())
    output = []
    for index, chunk_id in enumerate(result.get("ids", [[]])[0]):
      metadata = result.get("metadatas", [[]])[0][index] or {}
      text = result.get("documents", [[]])[0][index]
      concepts = set(clean_text(metadata.get("concepts", "")).lower().replace(",", " ").split())
      concept_overlap = len(query_terms.intersection(concepts))
      path_bonus = 0.0
      if subject and clean_text(subject).lower() == clean_text(metadata.get("subject", "")).lower():
          path_bonus += 0.08
      if chapter and clean_text(chapter).lower() == clean_text(metadata.get("chapter", "")).lower():
          path_bonus += 0.12
      if metadata.get("chunk_type") in {"textbook_question", "definition", "topic"}:
          path_bonus += 0.03
      semantic_score = 1 - float(result.get("distances", [[]])[0][index] or 0)
      output.append({
          "id": chunk_id,
          "score": round(semantic_score + min(0.14, concept_overlap * 0.035) + path_bonus, 6),
          "semanticScore": round(semantic_score, 6),
          "conceptOverlap": concept_overlap,
          "text": text,
          "metadata": metadata,
      })
    output.sort(key=lambda item: item["score"], reverse=True)
    return output[:top_k]


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Query ORIN academic vector index.")
    parser.add_argument("--query", required=True)
    parser.add_argument("--board", default="SSC")
    parser.add_argument("--class", dest="class_level", type=int, default=10)
    parser.add_argument("--subject")
    parser.add_argument("--chapter")
    parser.add_argument("--top-k", type=int, default=8)
    args = parser.parse_args()

    rows = retrieve(args.query, args.board, args.class_level, args.subject, args.chapter, args.top_k)
    print(json.dumps(rows, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

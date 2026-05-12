from __future__ import annotations

import argparse
import json
from pathlib import Path

import chromadb
import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

from .academic_loader import AcademicChunk, load_academic_chunks
from .config import CHROMA_DIR, DEFAULT_COLLECTION, DEFAULT_EMBEDDING_MODEL, FAISS_DIR, ensure_storage_dirs


def _batched(values: list[AcademicChunk], size: int = 128):
    for index in range(0, len(values), size):
        yield values[index:index + size]


def build_indexes(board: str, class_level: int, model_name: str = DEFAULT_EMBEDDING_MODEL, collection_name: str = DEFAULT_COLLECTION) -> dict:
    ensure_storage_dirs()
    chunks = load_academic_chunks(board, class_level)
    if not chunks:
        raise RuntimeError(f"No academic chunks found for {board} Class {class_level}")

    model = SentenceTransformer(model_name)
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    collection = client.get_or_create_collection(name=collection_name, metadata={"hnsw:space": "cosine"})

    all_embeddings: list[np.ndarray] = []
    all_metadata: list[dict] = []
    all_ids: list[str] = []

    for batch in _batched(chunks):
        texts = [chunk.text for chunk in batch]
        embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
        ids = [chunk.chunk_id for chunk in batch]
        metadata = [chunk.metadata() for chunk in batch]
        collection.upsert(ids=ids, documents=texts, embeddings=embeddings.tolist(), metadatas=metadata)
        all_embeddings.append(np.asarray(embeddings, dtype="float32"))
        all_metadata.extend([{**chunk.metadata(), "text": chunk.text} for chunk in batch])
        all_ids.extend(ids)

    matrix = np.vstack(all_embeddings).astype("float32")
    index = faiss.IndexFlatIP(matrix.shape[1])
    index.add(matrix)
    faiss_path = FAISS_DIR / f"{board.lower()}_class_{class_level}.faiss"
    meta_path = FAISS_DIR / f"{board.lower()}_class_{class_level}_metadata.json"
    faiss.write_index(index, str(faiss_path))
    meta_path.write_text(json.dumps({"ids": all_ids, "chunks": all_metadata}, ensure_ascii=False, indent=2), encoding="utf-8")

    return {
        "board": board,
        "classLevel": class_level,
        "chunkCount": len(chunks),
        "collection": collection_name,
        "faissPath": str(faiss_path),
        "metadataPath": str(meta_path),
    }


def build_many(board: str, classes: list[int], model_name: str = DEFAULT_EMBEDDING_MODEL, collection_name: str = DEFAULT_COLLECTION) -> list[dict]:
    results = []
    for class_level in classes:
        results.append(build_indexes(board, class_level, model_name, collection_name))
    manifest_path = Path(FAISS_DIR) / f"{board.lower()}_index_manifest.json"
    manifest_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Build ORIN academic embedding indexes.")
    parser.add_argument("--board", default="SSC")
    parser.add_argument("--class", dest="class_level", type=int, default=10)
    parser.add_argument("--classes", default="", help="Comma-separated class list, e.g. 6,7,8,9,10")
    parser.add_argument("--model", default=DEFAULT_EMBEDDING_MODEL)
    parser.add_argument("--collection", default=DEFAULT_COLLECTION)
    args = parser.parse_args()

    if args.classes:
        class_values = [int(item.strip()) for item in args.classes.split(",") if item.strip()]
        result = build_many(args.board, class_values, args.model, args.collection)
    else:
        result = build_indexes(args.board, args.class_level, args.model, args.collection)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

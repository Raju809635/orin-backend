from __future__ import annotations

import json
from pathlib import Path

import networkx as nx

from .academic_loader import AcademicChunk, load_academic_chunks
from .config import GRAPH_DIR, ensure_storage_dirs


def build_concept_graph(chunks: list[AcademicChunk]) -> nx.DiGraph:
    graph = nx.DiGraph()
    for chunk in chunks:
        subject_node = f"subject::{chunk.board}::{chunk.class_level}::{chunk.subject}"
        chapter_node = f"chapter::{chunk.board}::{chunk.class_level}::{chunk.subject}::{chunk.chapter}"
        topic_node = f"topic::{chunk.board}::{chunk.class_level}::{chunk.subject}::{chunk.chapter}::{chunk.topic}"
        graph.add_node(subject_node, type="subject", subject=chunk.subject, board=chunk.board, class_level=chunk.class_level)
        graph.add_node(chapter_node, type="chapter", chapter=chunk.chapter, subject=chunk.subject)
        graph.add_node(topic_node, type="topic", topic=chunk.topic, chapter=chunk.chapter, subject=chunk.subject, difficulty=chunk.difficulty)
        graph.add_edge(subject_node, chapter_node, relation="contains")
        graph.add_edge(chapter_node, topic_node, relation="contains")
        for concept in chunk.concepts or []:
            concept_node = f"concept::{chunk.board}::{chunk.class_level}::{chunk.subject}::{concept.lower()}"
            graph.add_node(concept_node, type="concept", concept=concept, subject=chunk.subject)
            graph.add_edge(topic_node, concept_node, relation="uses_concept")
        for prerequisite in chunk.prerequisites or []:
            prerequisite_node = f"concept::{chunk.board}::{chunk.class_level}::{chunk.subject}::{prerequisite.lower()}"
            graph.add_node(prerequisite_node, type="concept", concept=prerequisite, subject=chunk.subject)
            graph.add_edge(prerequisite_node, topic_node, relation="prerequisite_for")
        if chunk.chunk_type in {"definition", "textbook_question", "diagram"}:
            evidence_node = f"{chunk.chunk_type}::{chunk.chunk_id}"
            graph.add_node(evidence_node, type=chunk.chunk_type, text=chunk.text[:500], question_category=chunk.question_category or "")
            graph.add_edge(topic_node, evidence_node, relation="evidence")
    return graph


def save_graph_summary(graph: nx.DiGraph, output_path: Path) -> None:
    payload = {
        "nodeCount": graph.number_of_nodes(),
        "edgeCount": graph.number_of_edges(),
        "nodes": [
            {"id": node, **data}
            for node, data in list(graph.nodes(data=True))[:5000]
        ],
        "edges": [
            {"source": source, "target": target, **data}
            for source, target, data in list(graph.edges(data=True))[:10000]
        ],
    }
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Build ORIN academic concept graph.")
    parser.add_argument("--board", default="SSC")
    parser.add_argument("--class", dest="class_level", type=int, default=10)
    args = parser.parse_args()

    ensure_storage_dirs()
    chunks = load_academic_chunks(args.board, args.class_level)
    graph = build_concept_graph(chunks)
    output_path = GRAPH_DIR / f"{args.board.lower()}_class_{args.class_level}_concept_graph.json"
    save_graph_summary(graph, output_path)
    print(f"Wrote graph: {output_path}")
    print(f"Nodes: {graph.number_of_nodes()} Edges: {graph.number_of_edges()}")


if __name__ == "__main__":
    main()

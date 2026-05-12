from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Iterable

from .config import ACADEMIC_DATASET_DIR, AGGREGATE_DATASET_PATH
from .concept_extractor import classify_question_text, extract_concepts
from .text_utils import clean_text, is_useful_text, semantic_windows, unique_strings


@dataclass
class AcademicChunk:
    chunk_id: str
    text: str
    board: str
    class_level: int
    subject: str
    chapter: str
    topic: str
    chunk_type: str
    difficulty: str = "medium"
    page: int | None = None
    source: str = "academic_dataset"
    concepts: list[str] | None = None
    prerequisites: list[str] | None = None
    question_category: str | None = None
    syllabus_path: str | None = None

    def metadata(self) -> dict[str, Any]:
        data = asdict(self)
        data.pop("text", None)
        data["concepts"] = ", ".join(self.concepts or [])
        data["prerequisites"] = ", ".join(self.prerequisites or [])
        data["question_category"] = self.question_category or ""
        data["syllabus_path"] = self.syllabus_path or f"{self.board} / Class {self.class_level} / {self.subject} / {self.chapter} / {self.topic}"
        return data


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def iter_subject_records(board: str | None = None, class_level: int | None = None) -> Iterable[tuple[str, int, str, dict[str, Any]]]:
    if ACADEMIC_DATASET_DIR.exists():
        for board_dir in ACADEMIC_DATASET_DIR.iterdir():
            if not board_dir.is_dir():
                continue
            board_name = board_dir.name.upper()
            if board and board_name != board.upper():
                continue
            for class_dir in board_dir.iterdir():
                if not class_dir.is_dir() or not class_dir.name.startswith("class_"):
                    continue
                detected_class = int(class_dir.name.replace("class_", ""))
                if class_level and detected_class != int(class_level):
                    continue
                for file_path in class_dir.glob("*.json"):
                    record = load_json(file_path)
                    subject = record.get("metadata", {}).get("subject") or file_path.stem.replace("_", " ").title()
                    yield board_name, detected_class, subject, record
        return

    if AGGREGATE_DATASET_PATH.exists():
        aggregate = load_json(AGGREGATE_DATASET_PATH)
        for board_name, classes in aggregate.items():
            if board and board_name.upper() != board.upper():
                continue
            for class_key, subjects in classes.items():
                detected_class = int(str(class_key).replace("class_", ""))
                if class_level and detected_class != int(class_level):
                    continue
                for subject_slug, record in subjects.items():
                    subject = record.get("metadata", {}).get("subject") or subject_slug.replace("_", " ").title()
                    yield board_name.upper(), detected_class, subject, record


def _chapter_title(chapter: dict[str, Any]) -> str:
    return clean_text(chapter.get("chapter_name") or chapter.get("title") or chapter.get("name"))


def _topic_title(topic: Any) -> str:
    if isinstance(topic, dict):
        return clean_text(topic.get("topic_name") or topic.get("title") or topic.get("name"))
    return clean_text(topic)


def _page_from_item(item: dict[str, Any]) -> int | None:
    value = item.get("page") or item.get("page_no") or item.get("source_page")
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _prerequisites_from_item(item: Any) -> list[str]:
    if not isinstance(item, dict):
        return []
    values = item.get("prerequisites") or item.get("prerequisiteTopics") or item.get("dependsOn") or []
    if isinstance(values, str):
        values = [values]
    return unique_strings(values, limit=12)


def _chunk(
    *,
    chunk_id: str,
    text: str,
    board: str,
    class_level: int,
    subject: str,
    chapter: str,
    topic: str,
    chunk_type: str,
    difficulty: str,
    page: int | None = None,
    seed_terms: list[str] | None = None,
    prerequisites: list[str] | None = None,
    question_category: str | None = None,
) -> AcademicChunk:
    concepts = extract_concepts(text, subject=subject, seed_terms=seed_terms, limit=14)
    return AcademicChunk(
        chunk_id=chunk_id,
        text=text,
        board=board,
        class_level=class_level,
        subject=subject,
        chapter=chapter,
        topic=topic,
        chunk_type=chunk_type,
        difficulty=difficulty,
        page=page,
        concepts=concepts,
        prerequisites=prerequisites or [],
        question_category=question_category,
        syllabus_path=f"{board} / Class {class_level} / {subject} / {chapter} / {topic}",
    )


def chunks_from_subject(board: str, class_level: int, subject: str, record: dict[str, Any]) -> list[AcademicChunk]:
    chunks: list[AcademicChunk] = []
    chapters = record.get("chapters") or record.get("subject", {}).get("chapters") or []
    for chapter_index, chapter in enumerate(chapters, start=1):
        chapter_name = _chapter_title(chapter) or f"Chapter {chapter_index}"
        difficulty = clean_text(chapter.get("difficulty") or record.get("metadata", {}).get("difficulty") or "medium").lower()

        for topic_index, topic in enumerate(chapter.get("topics") or [], start=1):
            topic_name = _topic_title(topic) or chapter_name
            subtopics = topic.get("subtopics") if isinstance(topic, dict) else []
            topic_text = " ".join(unique_strings([topic_name, *(subtopics or [])], limit=20))
            if is_useful_text(topic_text):
                chunks.append(_chunk(
                    chunk_id=f"{board}-{class_level}-{subject}-{chapter_index}-{topic_index}-topic",
                    text=topic_text,
                    board=board,
                    class_level=class_level,
                    subject=subject,
                    chapter=chapter_name,
                    topic=topic_name,
                    chunk_type="topic",
                    difficulty=difficulty,
                    seed_terms=[topic_name, *(subtopics or [])],
                    prerequisites=_prerequisites_from_item(topic),
                ))

        lesson_sections = chapter.get("lessonSections") or chapter.get("lesson_sections") or chapter.get("sections") or []
        for section_index, section in enumerate(lesson_sections, start=1):
            heading = clean_text(section.get("heading") or section.get("title") or section.get("name"))
            body_parts = [
                heading,
                section.get("description"),
                section.get("text"),
                section.get("summary"),
                " ".join(section.get("keyPoints") or section.get("key_points") or []),
            ]
            text = " ".join(unique_strings(body_parts, limit=20))
            for window_index, window in enumerate(semantic_windows(text), start=1):
                if is_useful_text(window):
                    chunks.append(_chunk(
                        chunk_id=f"{board}-{class_level}-{subject}-{chapter_index}-{section_index}-{window_index}-lesson",
                        text=window,
                        board=board,
                        class_level=class_level,
                        subject=subject,
                        chapter=chapter_name,
                        topic=heading or chapter_name,
                        chunk_type="lesson",
                        difficulty=difficulty,
                        page=_page_from_item(section),
                        seed_terms=[heading, chapter_name],
                        prerequisites=_prerequisites_from_item(section),
                    ))

        for key, chunk_type in (
            ("definitions", "definition"),
            ("diagrams", "diagram"),
            ("activities", "activity"),
            ("textbookQuestions", "textbook_question"),
            ("textbook_questions", "textbook_question"),
            ("questions", "question"),
        ):
            values = chapter.get(key) or []
            for item_index, item in enumerate(values, start=1):
                if isinstance(item, dict):
                    text = " ".join(unique_strings([
                        item.get("term"),
                        item.get("meaning"),
                        item.get("title"),
                        item.get("question"),
                        item.get("answer"),
                        item.get("whatToLearn"),
                        item.get("text"),
                    ], limit=10))
                    page = _page_from_item(item)
                else:
                    text = clean_text(item)
                    page = None
                if is_useful_text(text):
                    chunks.append(_chunk(
                        chunk_id=f"{board}-{class_level}-{subject}-{chapter_index}-{item_index}-{chunk_type}",
                        text=text,
                        board=board,
                        class_level=class_level,
                        subject=subject,
                        chapter=chapter_name,
                        topic=chapter_name,
                        chunk_type=chunk_type,
                        difficulty=difficulty,
                        page=page,
                        seed_terms=[chapter_name],
                        prerequisites=_prerequisites_from_item(item),
                        question_category=classify_question_text(text) if "question" in chunk_type else None,
                    ))
    return chunks


def load_academic_chunks(board: str | None = None, class_level: int | None = None) -> list[AcademicChunk]:
    chunks: list[AcademicChunk] = []
    for board_name, detected_class, subject, record in iter_subject_records(board, class_level):
        chunks.extend(chunks_from_subject(board_name, detected_class, subject, record))
    return chunks

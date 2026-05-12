from __future__ import annotations

import re
from typing import Iterable


NOISE_PATTERNS = [
    r"^\s*page\s+\d+\s*$",
    r"^\s*\d+\s*$",
    r"^\s*(unit|chapter)\s*$",
    r"^[xmtfepd\s\d:;./\\-]{20,}$",
]


def clean_text(value: object) -> str:
    text = str(value or "").replace("\u0000", " ")
    text = re.sub(r"[\uf0b4\u00d7]", " x ", text)
    text = re.sub(r"([A-Za-z])\1{3,}", r"\1", text)
    text = re.sub(r"\b(?:pdf|final|em)\b", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\b\d{2,}[-/:]\d{2,}[-/:]\d{2,}\b", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def is_useful_text(value: object, min_chars: int = 24) -> bool:
    text = clean_text(value)
    if len(text) < min_chars:
        return False
    lower = text.lower()
    return not any(re.match(pattern, lower) for pattern in NOISE_PATTERNS)


def unique_strings(values: Iterable[object], limit: int = 100) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for value in values:
        text = clean_text(value)
        key = text.lower()
        if not text or key in seen:
            continue
        seen.add(key)
        output.append(text)
        if len(output) >= limit:
            break
    return output


def split_sentences(text: str) -> list[str]:
    clean = clean_text(text)
    if not clean:
        return []
    return [part.strip() for part in re.split(r"(?<=[.!?])\s+", clean) if part.strip()]


def semantic_windows(text: str, max_chars: int = 850, overlap_sentences: int = 1) -> list[str]:
    sentences = [sentence for sentence in split_sentences(text) if is_useful_text(sentence, min_chars=18)]
    if not sentences:
        return [clean_text(text)] if is_useful_text(text) else []

    windows: list[str] = []
    index = 0
    while index < len(sentences):
        current: list[str] = []
        length = 0
        start = index
        while index < len(sentences):
            sentence = sentences[index]
            if current and length + len(sentence) > max_chars:
                break
            current.append(sentence)
            length += len(sentence) + 1
            index += 1
        if current:
            windows.append(clean_text(" ".join(current)))
        if index >= len(sentences):
            break
        index = max(start + 1, index - overlap_sentences)
    return unique_strings(windows, limit=1000)

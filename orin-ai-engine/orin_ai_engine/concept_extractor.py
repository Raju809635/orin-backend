from __future__ import annotations

import re
from functools import lru_cache

import spacy

from .text_utils import clean_text, unique_strings


ACADEMIC_STOP_TERMS = {
    "chapter",
    "exercise",
    "example",
    "question",
    "answer",
    "page",
    "student",
    "teacher",
    "activity",
    "practice",
    "revision",
}


SUBJECT_HINTS = {
    "Mathematics": [
        "hcf", "lcm", "integer", "prime", "factor", "lemma", "theorem", "proof", "equation",
        "polynomial", "triangle", "trigonometry", "probability", "statistics", "coordinate"
    ],
    "Physics": [
        "force", "motion", "current", "voltage", "resistance", "reflection", "refraction",
        "lens", "mirror", "magnet", "energy", "electric"
    ],
    "Biology": [
        "nutrition", "respiration", "circulation", "excretion", "neuron", "hormone",
        "photosynthesis", "digestion", "blood", "heart"
    ],
    "Social Science": [
        "map", "climate", "economy", "constitution", "movement", "resource", "population",
        "democracy", "rights", "agriculture"
    ],
}


@lru_cache(maxsize=1)
def _nlp():
    try:
        return spacy.load("en_core_web_sm", disable=["parser", "lemmatizer"])
    except OSError:
        return None


def _clean_concept(value: str) -> str:
    value = clean_text(value)
    value = re.sub(r"^[^A-Za-z0-9]+|[^A-Za-z0-9]+$", "", value)
    return value


def extract_concepts(text: str, subject: str = "", seed_terms: list[str] | None = None, limit: int = 12) -> list[str]:
    clean = clean_text(text)
    seeds = seed_terms or []
    hints = []
    for name, terms in SUBJECT_HINTS.items():
        if name.lower() in subject.lower():
            hints.extend([term for term in terms if re.search(rf"\b{re.escape(term)}\b", clean, re.IGNORECASE)])

    candidates: list[str] = []
    candidates.extend(seeds)
    candidates.extend(hints)

    nlp = _nlp()
    if nlp:
        doc = nlp(clean[:3000])
        candidates.extend(ent.text for ent in doc.ents if 2 <= len(ent.text) <= 64)
        tokens = [token.text for token in doc if token.pos_ in {"NOUN", "PROPN", "ADJ", "NUM"} and not token.is_stop]
        candidates.extend(" ".join(tokens[index:index + size]) for size in (1, 2, 3) for index in range(max(0, len(tokens) - size + 1)))
    else:
        candidates.extend(re.findall(r"\b[A-Za-z][A-Za-z0-9 -]{3,48}\b", clean))

    candidates.extend(re.findall(r"\b[A-Z]?[a-z]+(?:\s+[A-Z]?[a-z]+){0,3}\b", clean))

    cleaned = []
    for item in candidates:
        concept = _clean_concept(item)
        key = concept.lower()
        if len(concept) < 3 or key in ACADEMIC_STOP_TERMS:
            continue
        if sum(ch.isalpha() for ch in concept) < 3:
            continue
        cleaned.append(concept)
    return unique_strings(cleaned, limit=limit)


def classify_question_text(text: str) -> str:
    lower = clean_text(text).lower()
    if any(token in lower for token in ["prove", "show that", "justify", "derive"]):
        return "analytical"
    if any(token in lower for token in ["calculate", "find", "solve", "construct", "draw"]):
        return "application_based"
    if any(token in lower for token in ["why", "how", "explain", "reason"]):
        return "conceptual"
    if any(token in lower for token in ["define", "name", "state", "write"]):
        return "memory_based"
    if len(lower.split()) > 24:
        return "multi_step_reasoning"
    return "conceptual"

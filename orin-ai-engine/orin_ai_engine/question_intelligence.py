from __future__ import annotations

from dataclasses import dataclass, asdict


@dataclass
class QuestionAnalysis:
    reasoning_type: str
    concepts: list[str]
    mistake_type: str | None = None
    missing_prerequisites: list[str] | None = None
    recommendation: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


def classify_question(question: str, topic_context: list[str] | None = None) -> QuestionAnalysis:
    text = question.lower()
    context = topic_context or []
    if any(token in text for token in ["prove", "show that", "derive", "why"]):
        reasoning_type = "analytical"
    elif any(token in text for token in ["calculate", "solve", "find", "value"]):
        reasoning_type = "application_based"
    elif any(token in text for token in ["define", "what is", "name"]):
        reasoning_type = "memory_based"
    elif len(text.split()) > 22:
        reasoning_type = "multi_step_reasoning"
    else:
        reasoning_type = "conceptual"

    concepts = [item for item in context if item and item.lower() in text][:8]
    return QuestionAnalysis(reasoning_type=reasoning_type, concepts=concepts)


def analyze_wrong_answer(question: str, correct_answer: str, student_answer: str, topic_context: list[str] | None = None) -> dict:
    base = classify_question(question, topic_context)
    correct = correct_answer.strip().lower()
    student = student_answer.strip().lower()
    if not student:
        base.mistake_type = "no_attempt"
    elif student in correct or correct in student:
        base.mistake_type = "partial_understanding"
    elif base.reasoning_type == "application_based":
        base.mistake_type = "procedure_confusion"
    elif base.reasoning_type == "memory_based":
        base.mistake_type = "recall_gap"
    else:
        base.mistake_type = "concept_confusion"
    base.recommendation = "Review the concept explanation, then retry with one easier and one similar question."
    return base.to_dict()


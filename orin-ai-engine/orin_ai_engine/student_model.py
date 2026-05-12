from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from math import exp


@dataclass
class TopicMastery:
    topic: str
    attempts: int
    accuracy: float
    average_time_seconds: float
    confidence: float
    last_seen_iso: str | None = None

    def mastery_score(self) -> float:
        speed_factor = max(0.2, min(1.0, 90 / max(self.average_time_seconds, 1)))
        return round((self.accuracy * 0.62 + self.confidence * 0.28 + speed_factor * 0.10) * 100, 2)

    def retention_score(self) -> float:
        if not self.last_seen_iso:
            return self.mastery_score()
        last_seen = datetime.fromisoformat(self.last_seen_iso.replace("Z", "+00:00"))
        days = (datetime.now(timezone.utc) - last_seen).total_seconds() / 86400
        decay = exp(-days / 21)
        return round(self.mastery_score() * decay, 2)

    def readiness(self) -> str:
        score = self.retention_score()
        if score >= 80:
            return "ready"
        if score >= 55:
            return "needs_revision"
        return "foundation_recovery"

    def to_dict(self) -> dict:
        data = asdict(self)
        data["masteryScore"] = self.mastery_score()
        data["retentionScore"] = self.retention_score()
        data["readiness"] = self.readiness()
        return data


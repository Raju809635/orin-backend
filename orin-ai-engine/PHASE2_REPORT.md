# ORIN AI Engine Phase 2 Report

## Completed

- Added concept extraction with spaCy + academic phrase extraction.
- Added semantic window chunking so long lesson text becomes smaller retrievable chunks.
- Added chunk metadata:
  - board
  - class
  - subject
  - chapter
  - topic
  - syllabus path
  - concepts
  - prerequisites when present
  - question category
  - difficulty
  - page where available
- Added hybrid retrieval scoring:
  - embedding similarity
  - subject/chapter path bonus
  - concept overlap bonus
  - evidence-type bonus for topic, definition, and textbook-question chunks
- Expanded concept graph:
  - subject -> chapter
  - chapter -> topic
  - topic -> concept
  - prerequisite concept -> topic
  - topic -> evidence
- Built Phase 2 semantic indexes for SSC Classes 6-10.
- Built Phase 2 concept graph summaries for SSC Classes 6-10.

## Built Indexes

| Board | Class | Semantic Chunks |
| --- | ---: | ---: |
| SSC | 6 | 2,749 |
| SSC | 7 | 2,246 |
| SSC | 8 | 3,303 |
| SSC | 9 | 2,917 |
| SSC | 10 | 5,154 |

## Built Graphs

| Board | Class | Nodes | Edges |
| --- | ---: | ---: | ---: |
| SSC | 6 | 15,723 | 24,338 |
| SSC | 7 | 11,760 | 19,431 |
| SSC | 8 | 19,895 | 29,670 |
| SSC | 9 | 16,931 | 25,811 |
| SSC | 10 | 27,176 | 43,199 |

## Verification

- Python compile check passed.
- SSC Class 10 Mathematics / Real Numbers retrieval returned HCF, Euclid algorithm, prime factorization, and textbook exercise context.
- SSC Class 8 Physics retrieval returned plane mirror, reflection, ray diagram, and image formation context.
- Question intelligence scaffold classified HCF wrong-answer behavior.
- Student model scaffold produced mastery, retention, and readiness scoring.
- `pip check` passed with no broken dependencies.

## Notes

- Generated storage is intentionally ignored by git:
  - ChromaDB index
  - FAISS index
  - graph summaries
- The current engine is offline/local. Production integration should expose a backend endpoint or background worker next.
- Some source textbook text still contains OCR/PDF noise. Phase 3 should add a stronger cleanup and reranker layer before connecting user-facing AI responses.


"""Read only the agent's saved document; never repair or save it for the agent."""
import json
import sys
from pathlib import Path
from docx import Document
from document_metrics import (compare_docx_files, is_first_line_centered,
    compare_font_names, compare_subscript_contains, evaluate_strike_through_last_paragraph)

ROOT = Path(__file__).resolve().parent

def text(document):
    return {
        "paragraphs": [p.text for p in document.paragraphs],
        "tables": [[[cell.text for cell in row.cells] for row in table.rows] for table in document.tables],
    }

def paragraphs(document):
    return list(document.paragraphs) + [p for t in document.tables for r in t.rows for c in r.cells for p in c.paragraphs]

def character_format(document, attribute):
    # Run splitting is a serialization choice, not a user-visible outcome.
    # Compare the formatting of each character, including table text.
    return [[bool(getattr(r.font, attribute)) for r in p.runs for _ in r.text] for p in paragraphs(document)]

def score(task_id, output):
    task = next(t for t in json.loads((ROOT / "manifest.json").read_text())["tasks"] if t["id"] == task_id)
    if task["evaluator"] not in ["is_first_line_centered", "compare_docx_files", "compare_font_names", ["compare_docx_files", "compare_subscript_contains"], "evaluate_strike_through_last_paragraph"]:
        raise ValueError("Unsupported evaluator; do not dispatch or score this task")
    source = ROOT / task_id / task["inputFile"]
    try:
        actual = Document(output)
        format_matches = True
        gold = source.with_name(source.stem + "_Gold.docx")
        if task["evaluator"] == "is_first_line_centered":
            upstream = is_first_line_centered(str(output))
            preserved = text(actual) == text(Document(source))
        elif task["evaluator"] == "compare_docx_files":
            upstream = compare_docx_files(str(output), str(gold))
            # Upstream ignores table text; the user's all-text request includes it.
            preserved = text(actual) == text(Document(gold))
        elif task["evaluator"] == "compare_font_names":
            upstream = compare_font_names(str(output), {"font_name": "Times New Roman"})
            preserved = text(actual) == text(Document(source))
            # Upstream does not inspect table fonts. Select-all must cover them.
            runs = [r for p in paragraphs(actual) for r in p.runs if r.text.strip()]
            format_matches = bool(runs) and all(r.font.name == "Times New Roman" for r in runs)
        elif task["evaluator"] == ["compare_docx_files", "compare_subscript_contains"]:
            upstream = compare_docx_files(str(output), str(gold)) * compare_subscript_contains(str(output), str(gold))
            preserved = text(actual) == text(Document(source))
            # Upstream accepts a single matching run; require every expected 2.
            format_matches = character_format(actual, "subscript") == character_format(Document(gold), "subscript")
        elif task["evaluator"] == "evaluate_strike_through_last_paragraph":
            upstream = evaluate_strike_through_last_paragraph(str(output), str(gold))
            preserved = text(actual) == text(Document(source))
            format_matches = character_format(actual, "strike") == character_format(Document(gold), "strike")
        else:
            raise ValueError("Unsupported evaluator; do not score this task")
        return {"upstreamScore": upstream, "completeDocumentTextMatches": preserved, "formatMatches": format_matches, "taskSuccess": upstream == 1 and preserved and format_matches}
    except Exception as error:
        return {"upstreamScore": 0, "completeDocumentTextMatches": False, "taskSuccess": False, "error": str(error)}

if __name__ == "__main__":
    print(json.dumps(score(sys.argv[1], Path(sys.argv[2]))))

# Extracted without body changes from OSWorld desktop_env/evaluators/metrics/docs.py
# Commit fc31a9049664292fcb35d6e501ee1dc839f2cf6d. Apache-2.0; see LICENSE.
# Only dependencies of these selected functions are imported; unrelated OCR/model code is not loaded.
import logging
from typing import Any, Dict, List
import re
from docx import Document
from docx.enum.text import WD_PARAGRAPH_ALIGNMENT
from odf.opendocument import load
from odf.text import P
from rapidfuzz import fuzz
logger = logging.getLogger(__name__)

def compare_docx_files(file1, file2, **options):
    ignore_blanks = options.get('ignore_blanks', True)
    ignore_case = options.get('ignore_case', False)
    ignore_order = options.get('ignore_order', False)
    content_only = options.get('content_only', False)
    fuzzy_match = options.get('fuzzy_match', False)
    delete_empty_lines = options.get('delete_empty_lines', False)

    if not file1 or not file2:
        return 0

    def get_paragraph_texts_odt(document):
        paragraphs = document.getElementsByType(P)
        paragraph_texts = []
        for paragraph in paragraphs:
            text_parts = []
            for node in paragraph.childNodes:
                if node.nodeType == node.TEXT_NODE:
                    text_parts.append(node.data)
                elif node.nodeType == node.ELEMENT_NODE and node.tagName == 'text:span':
                    # Assuming direct text content in <text:span>, for simplicity
                    for child in node.childNodes:
                        if child.nodeType == child.TEXT_NODE:
                            text_parts.append(child.data)
            paragraph_texts.append(''.join(text_parts))
        return paragraph_texts

    # Determine file types and load documents
    if file1.endswith('.docx') and file2.endswith('.docx'):
        try:
            doc1 = Document(file1)
            doc2 = Document(file2)
        except Exception as e:
            logger.error(f"Error: {e}")
            return 0
        doc1_paragraphs = [p.text for p in doc1.paragraphs]
        doc2_paragraphs = [p.text for p in doc2.paragraphs]
        if ignore_order:
            doc1_paragraphs = sorted(doc1_paragraphs)
            doc2_paragraphs = sorted(doc2_paragraphs)
        if delete_empty_lines:
            doc1_paragraphs = [p for p in doc1_paragraphs if p.strip()]
            doc2_paragraphs = [p for p in doc2_paragraphs if p.strip()]
    elif file1.endswith('.odt') and file2.endswith('.odt'):
        try:
            doc1 = load(file1)
            doc2 = load(file2)
        except Exception as e:
            logger.error(f"Error: {e}")
            return 0
        doc1_paragraphs = get_paragraph_texts_odt(doc1)
        doc2_paragraphs = get_paragraph_texts_odt(doc2)
        if ignore_order:
            doc1_paragraphs = sorted(doc1_paragraphs)
            doc2_paragraphs = sorted(doc2_paragraphs)
        if delete_empty_lines:
            doc1_paragraphs = [p for p in doc1_paragraphs if p.strip()]
            doc2_paragraphs = [p for p in doc2_paragraphs if p.strip()]
    else:
        # Unsupported file types or mismatch
        print("Unsupported file types or mismatch between file types.")
        return 0

    if content_only:
        # Compare the content of the documents
        text1 = re.sub(r'\s+', ' ', '\n'.join(doc1_paragraphs)).strip()
        text2 = re.sub(r'\s+', ' ', '\n'.join(doc2_paragraphs)).strip()
        if ignore_case:
            text1, text2 = text1.lower(), text2.lower()
        similarity = fuzz.ratio(text1, text2) / 100.0
        return similarity

    # Process and compare documents
    if ignore_blanks:
        text1 = re.sub(r'\s+', ' ', '\n'.join(doc1_paragraphs)).strip()
        text2 = re.sub(r'\s+', ' ', '\n'.join(doc2_paragraphs)).strip()
        if ignore_case:
            text1, text2 = text1.lower(), text2.lower()

        if fuzzy_match:
            similarity = fuzz.ratio(text1, text2) / 100.0
            return similarity
        else:
            if text1 != text2:
                return 0
    else:
        if len(doc1_paragraphs) != len(doc2_paragraphs):
            print(doc1_paragraphs)
            print(doc2_paragraphs)
            print(len(doc1_paragraphs))
            print(len(doc2_paragraphs))
            return 0

        if fuzzy_match:
            total_similarity = 0
            if not doc1_paragraphs:
                return 1.0
            for p1, p2 in zip(doc1_paragraphs, doc2_paragraphs):
                if ignore_case:
                    p1, p2 = p1.lower(), p2.lower()
                total_similarity += fuzz.ratio(p1, p2) / 100.0

            if len(doc1_paragraphs) == 0:
                return 1.0 if len(doc2_paragraphs) == 0 else 0.0

            avg_similarity = total_similarity / len(doc1_paragraphs)
            return avg_similarity
        else:
            # Compare each paragraph
            for p1, p2 in zip(doc1_paragraphs, doc2_paragraphs):
                if ignore_case:
                    p1, p2 = p1.lower(), p2.lower()
                if p1 != p2:
                    # show the difference
                    print("=== First Paragraph ===")
                    print(f"\033[92m{repr(p1)}\033[0m")  # Green color for p1, repr() shows hidden chars
                    print("=== Second Paragraph ===")
                    print(f"\033[91m{repr(p2)}\033[0m")  # Red color for p2, repr() shows hidden chars
                    print("=" * 50)  # Clear boundary
                    return 0

    return 1

def is_first_line_centered(docx_file):
    if not docx_file:
        return 0

    try:
        doc = Document(docx_file)
    except Exception as e:
        logger.error(f"Error: {e}")
        return 0

    first_paragraph = doc.paragraphs[0]

    # check if the first line is center justified
    return 1 if first_paragraph.paragraph_format.alignment == WD_PARAGRAPH_ALIGNMENT.CENTER else 0


def compare_font_names(docx_file, rules: List[Dict[str, Any]]):
    if not docx_file:
        return 0

    try:
        doc = Document(docx_file)
    except Exception as e:
        logger.error(f"Error: {e}")
        return 0

    expected_font = rules["font_name"]

    for paragraph in doc.paragraphs:
        for run in paragraph.runs:
            font_name = run.font.name
            if font_name != expected_font:
                return 0
    return 1


def compare_subscript_contains(docx_file1, docx_file2):
    if not docx_file1 or not docx_file2:
        return 0

    try:
        doc1 = Document(docx_file1)
        doc2 = Document(docx_file2)
    except Exception as e:
        logger.error(f"Error: {e}")
        return 0

    for para1, para2 in zip(doc1.paragraphs, doc2.paragraphs):
        for run1, run2 in zip(para1.runs, para2.runs):
            # check if two paras both contain subscript
            if run1.font.subscript and run2.font.subscript:
                return 1
    return 0


def evaluate_strike_through_last_paragraph(file_path1, file_path2):
    if not file_path1 or not file_path2:
        return 0

    if not compare_docx_files(file_path1, file_path2):
        return 0

    try:
        document = Document(file_path1)
    except Exception as e:
        logger.error(f"Error: {e}")
        return 0

    # Get the last paragraph
    last_paragraph = document.paragraphs[-1]

    # Check if any run in the last paragraph has strike-through formatting
    for run in last_paragraph.runs:
        if not run.font.strike:
            return 0  # At least one word does not have strike-through formatting

    return 1

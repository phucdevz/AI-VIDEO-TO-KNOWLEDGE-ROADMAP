from __future__ import annotations

import io
import re
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from app.api.deps import get_database_service
from app.services.database_service import DatabaseService

router = APIRouter()


def _fmt_time(seconds: float) -> str:
    try:
        s = float(seconds)
    except Exception:
        s = 0.0
    if s < 0:
        s = 0.0
    m = int(s // 60)
    r = int(s % 60)
    return f"{m:02d}:{r:02d}"


def _safe_filename(name: str) -> str:
    n = (name or "").strip() or "quiz"
    n = re.sub(r'[<>:"/\\\\|?*]+', "", n).strip()
    return n[:120] or "quiz"


def _pick_quiz(row: dict[str, Any]) -> dict[str, Any] | None:
    q = row.get("quiz")
    if isinstance(q, dict):
        return q
    q2 = row.get("quiz_data")
    if isinstance(q2, dict):
        return q2
    return None


@router.get(
    "/pdf",
    summary="Export quiz as PDF (Times New Roman, Unicode)",
    status_code=status.HTTP_200_OK,
)
async def export_quiz_pdf(
    lecture_id: str,
    db: Annotated[DatabaseService, Depends(get_database_service)],
) -> StreamingResponse:
    if not db.is_configured:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Supabase not configured")
    lookup = db.find_lecture_by_id(lecture_id)
    if not lookup.found or not isinstance(lookup.row, dict):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lecture not found")

    row = lookup.row
    quiz = _pick_quiz(row)
    if not isinstance(quiz, dict):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found on lecture")
    questions = quiz.get("questions")
    if not isinstance(questions, list) or len(questions) == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz has no questions")

    title = str(row.get("title") or quiz.get("title") or "Quiz")

    # Server-side PDF avoids jsPDF font issues for Vietnamese.
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"reportlab missing: {e}") from e

    # Register Times New Roman from Windows if available; fallback to Helvetica.
    font_name = "Helvetica"
    try:
        pdfmetrics.registerFont(TTFont("TimesNewRoman", r"C:\Windows\Fonts\times.ttf"))
        pdfmetrics.registerFont(TTFont("TimesNewRoman-Bold", r"C:\Windows\Fonts\timesbd.ttf"))
        font_name = "TimesNewRoman"
    except Exception:
        font_name = "Helvetica"

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=40,
        rightMargin=40,
        topMargin=40,
        bottomMargin=40,
        title=title,
    )

    styles = getSampleStyleSheet()
    h = ParagraphStyle("h", parent=styles["Heading2"], fontName=f"{font_name}-Bold" if font_name != "Helvetica" else "Helvetica-Bold", fontSize=14, leading=18)
    p = ParagraphStyle("p", parent=styles["BodyText"], fontName=font_name, fontSize=11, leading=15)
    small = ParagraphStyle("small", parent=styles["BodyText"], fontName=font_name, fontSize=10, leading=13, textColor="#586174")

    story: list[Any] = []
    story.append(Paragraph(title, h))
    story.append(Spacer(1, 10))

    for idx, q in enumerate(questions):
        if not isinstance(q, dict):
            continue
        question = str(q.get("question") or "").strip()
        choices = q.get("choices")
        if not question or not isinstance(choices, list) or len(choices) != 4:
            continue
        correct_index = q.get("correct_index")
        try:
            ci = int(correct_index)
        except Exception:
            ci = -1

        story.append(Paragraph(f"<b>{idx+1}. {question}</b>", p))
        story.append(Spacer(1, 4))
        for i, c in enumerate(choices):
            label = chr(65 + i)
            text = str(c or "").strip()
            mark = "✓ " if i == ci else ""
            story.append(Paragraph(f"{mark}{label}. {text}", p))
        exp = str(q.get("explanation") or "").strip()
        if exp:
            story.append(Spacer(1, 4))
            story.append(Paragraph(f"<b>Giải thích:</b> {exp}", small))

        ev = q.get("evidence")
        if isinstance(ev, list) and len(ev) > 0:
            for e in ev[:2]:
                if not isinstance(e, dict):
                    continue
                st = e.get("start", 0)
                en = e.get("end", 0)
                txt = str(e.get("text") or "").strip()
                if not txt:
                    continue
                story.append(Paragraph(f"<b>Nguồn:</b> [{_fmt_time(st)}–{_fmt_time(en)}] {txt}", small))

        story.append(Spacer(1, 12))

    doc.build(story)
    buf.seek(0)

    filename = _safe_filename(title) + ".pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


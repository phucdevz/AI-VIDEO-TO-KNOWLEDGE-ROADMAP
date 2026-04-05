from __future__ import annotations

import html
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


def _xml_escape(s: str) -> str:
    """ReportLab Paragraph dùng mini-HTML; ký tự <>& trong nội dung quiz làm lỗi parse → 500."""
    return html.escape(str(s), quote=False)


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

    # Unicode: ưu tiên Times New Roman (Windows); Linux/macOS thường có DejaVu trong reportlab.
    font_name = "Helvetica"
    try:
        import os
        import sys

        if sys.platform == "win32":
            windir = os.environ.get("WINDIR", r"C:\Windows")
            t_regular = os.path.join(windir, "Fonts", "times.ttf")
            t_bold = os.path.join(windir, "Fonts", "timesbd.ttf")
            if os.path.isfile(t_regular) and os.path.isfile(t_bold):
                pdfmetrics.registerFont(TTFont("TimesNewRoman", t_regular))
                pdfmetrics.registerFont(TTFont("TimesNewRoman-Bold", t_bold))
                font_name = "TimesNewRoman"
        else:
            try:
                from pathlib import Path

                for sub in (
                    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                    "/usr/share/fonts/TTF/DejaVuSans.ttf",
                ):
                    if Path(sub).is_file():
                        pdfmetrics.registerFont(TTFont("DejaVuSans", sub))
                        b = sub.replace("DejaVuSans.ttf", "DejaVuSans-Bold.ttf")
                        if Path(b).is_file():
                            pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", b))
                        font_name = "DejaVuSans"
                        break
            except Exception:
                pass
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
    bold_suffix = (
        "Helvetica-Bold"
        if font_name == "Helvetica"
        else f"{font_name}-Bold"
    )
    h = ParagraphStyle(
        "h",
        parent=styles["Heading2"],
        fontName=bold_suffix,
        fontSize=14,
        leading=18,
    )
    p = ParagraphStyle("p", parent=styles["BodyText"], fontName=font_name, fontSize=11, leading=15)
    small = ParagraphStyle("small", parent=styles["BodyText"], fontName=font_name, fontSize=10, leading=13, textColor="#586174")

    story: list[Any] = []
    story.append(Paragraph(_xml_escape(title), h))
    story.append(Spacer(1, 10))

    used = 0
    for q in questions:
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

        used += 1
        story.append(Paragraph(f"<b>{used}. {_xml_escape(question)}</b>", p))
        story.append(Spacer(1, 4))
        for i, c in enumerate(choices):
            label = chr(65 + i)
            text = str(c or "").strip()
            mark = "✓ " if i == ci else ""
            story.append(Paragraph(f"{mark}{label}. {_xml_escape(text)}", p))
        exp = str(q.get("explanation") or "").strip()
        if exp:
            story.append(Spacer(1, 4))
            story.append(Paragraph(f"<b>Giải thích:</b> {_xml_escape(exp)}", small))

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
                story.append(
                    Paragraph(
                        f"<b>Nguồn:</b> [{_xml_escape(_fmt_time(st))}–{_xml_escape(_fmt_time(en))}] {_xml_escape(txt)}",
                        small,
                    )
                )

        story.append(Spacer(1, 12))

    if used == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No valid quiz questions to export")

    doc.build(story)
    buf.seek(0)

    filename = _safe_filename(title) + ".pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


from __future__ import annotations

from pydantic import BaseModel, Field


class TutorSegmentSchema(BaseModel):
    start: float = Field(..., description="segment start time in seconds")
    end: float = Field(..., description="segment end time in seconds")
    text: str = Field(..., description="segment text")


class TutorAskRequest(BaseModel):
    question: str = Field(..., min_length=1, description="User question")
    lecture_id: str | None = Field(None, description="Supabase lectures.id (optional)")
    video_url: str | None = Field(None, description="Lecture video_url (optional)")
    user_id: str | None = Field(None, description="Supabase auth user id (optional, for per-user API keys)")
    segments: list[TutorSegmentSchema] = Field(
        default_factory=list,
        description="Optional transcript segments; if empty, backend will try to load from Supabase lecture row",
    )
    max_citations: int = Field(3, ge=0, le=8, description="Max citations to return")


class TutorCitationSchema(BaseModel):
    start: float
    end: float
    text: str


class TutorAskResponse(BaseModel):
    answer: str
    citations: list[TutorCitationSchema] = Field(default_factory=list)


from pydantic import BaseModel, Field, HttpUrl


class AudioExtractionRequest(BaseModel):
    url: HttpUrl = Field(..., description="YouTube (or yt-dlp supported) URL")


class AudioExtractionResponse(BaseModel):
    video_id: str
    title: str | None
    duration_seconds: float | None
    audio_filename: str
    audio_path: str = Field(..., description="Absolute path to downloaded audio on the API server")
    extractor: str = "yt-dlp"

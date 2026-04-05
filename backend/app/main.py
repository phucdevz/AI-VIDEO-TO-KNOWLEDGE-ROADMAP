import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.admin_ui import mount_admin_app
from app.api.routes import api_router
from app.config import get_settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class _SuppressGradioQueuePollAccessFilter(logging.Filter):
    """
    Gradio polls /admin/gradio_api/queue/* vài lần/giây — spam log uvicorn.access.
    Giữ log cho mọi request khác (API, /admin trang, static…).
    """

    _needle = "/gradio_api/queue/"

    def filter(self, record: logging.LogRecord) -> bool:
        return self._needle not in record.getMessage()


def _quiet_gradio_queue_access_logs() -> None:
    f = _SuppressGradioQueuePollAccessFilter()
    logging.getLogger("uvicorn.access").addFilter(f)


_quiet_gradio_queue_access_logs()

settings = get_settings()

app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_v1_prefix)

app = mount_admin_app(app)


@app.get("/", tags=["root"])
def root() -> dict[str, str]:
    return {
        "service": settings.app_name,
        "docs": "/docs",
        "health": "/api/v1/health",
        "admin": "/admin",
    }

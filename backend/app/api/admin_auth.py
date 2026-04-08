from __future__ import annotations

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

from app.api.deps import get_settings_dep
from app.config import Settings


def _parse_roles(raw: str) -> set[str]:
    return {x.strip() for x in raw.split(",") if x.strip()}


def require_admin_roles(*allowed: str) -> Callable[..., str]:
    allowed_set = set(allowed)

    def _guard(
        settings: Annotated[Settings, Depends(get_settings_dep)],
        x_admin_token: Annotated[str | None, Header()] = None,
        x_admin_role: Annotated[str | None, Header()] = None,
    ) -> str:
        expected_token = (settings.admin_api_token or "").strip()
        if expected_token and x_admin_token != expected_token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin token")

        role = (x_admin_role or "").strip().lower()
        if not role:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing admin role")

        registered_roles = _parse_roles(settings.admin_api_roles)
        if role not in registered_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Role not allowed")
        if allowed_set and role not in allowed_set:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role for action")
        return role

    return _guard

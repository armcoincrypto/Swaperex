"""Browser monitoring / telemetry ingestion (append-only, no signing)."""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from swaperex.ledger.database import get_db
from swaperex.ledger.models import MonitoringIngestBatch

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/monitoring", tags=["Monitoring"])

MAX_EVENTS_PER_BATCH = 200
MAX_ENVELOPE_BYTES = 512_000


class MonitoringBatchBody(BaseModel):
    """Matches frontend `MonitoringBatchEnvelope` (camelCase JSON)."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    schema_version: int = Field(..., alias="schemaVersion", ge=1, le=8)
    client_session_id: str = Field(..., alias="clientSessionId", max_length=80)
    exported_at: int = Field(..., alias="exportedAt")
    events: list[dict[str, Any]] = Field(default_factory=list)

    @field_validator("events")
    @classmethod
    def limit_events(cls, v: list) -> list:
        if len(v) > MAX_EVENTS_PER_BATCH:
            raise ValueError(f"events: at most {MAX_EVENTS_PER_BATCH} items")
        return v


@router.post(
    "/events",
    status_code=status.HTTP_201_CREATED,
    summary="Ingest monitoring event batch from the web client",
)
async def post_monitoring_events(
    body: MonitoringBatchBody,
    x_swaperex_monitoring_key: str | None = Header(None, alias="X-Swaperex-Monitoring-Key"),
) -> dict[str, Any]:
    """Store one batch row. Optional shared secret via MONITORING_INGEST_SECRET + header."""
    expected = os.environ.get("MONITORING_INGEST_SECRET", "").strip()
    if expected and (not x_swaperex_monitoring_key or x_swaperex_monitoring_key != expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    envelope_dict = body.model_dump(mode="json", by_alias=True)

    raw = json.dumps(envelope_dict, separators=(",", ":"), default=str)
    if len(raw.encode("utf-8")) > MAX_ENVELOPE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Batch too large",
        )

    async with get_db() as session:
        row = MonitoringIngestBatch(
            schema_version=body.schema_version,
            client_session_id=body.client_session_id,
            exported_at_ms=body.exported_at,
            event_count=len(body.events),
            envelope=envelope_dict,
        )
        session.add(row)

    logger.info(
        "monitoring_ingest client_session=%s events=%s schema=%s",
        body.client_session_id[:12] + "…",
        len(body.events),
        body.schema_version,
    )
    return {"ok": True, "stored": len(body.events)}

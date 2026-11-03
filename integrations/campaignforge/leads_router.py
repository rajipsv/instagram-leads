"""Proposed CampaignForge router: backend/src/agency/routers/leads.py

A sketch. Wire it to CampaignForge's real DB session, tenant middleware, API-key
auth and SQLAlchemy models (models/tables.py) before use. Lines marked TODO are
assumptions about CampaignForge internals.
"""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

# TODO: replace with CampaignForge's real dependencies
from agency.deps import get_db, get_tenant, require_api_key_or_user  # type: ignore

router = APIRouter(prefix="/api/v1/leads", tags=["leads"])

Status = Literal["new", "qualified", "contacted", "replied", "demo_booked", "won", "lost", "do_not_contact"]
HUMAN_STATUSES = {"contacted", "replied", "demo_booked", "won", "lost", "do_not_contact"}


class LeadIn(BaseModel):
    platform: str = "instagram"
    username: str
    full_name: str | None = None
    profile_url: str | None = None
    bio: str | None = None
    followers: int | None = None
    segment: str | None = None
    city: str | None = None
    score: float = 0
    tier: Literal["A", "B", "C", "X"] | None = None
    score_reasons: list[str] = Field(default_factory=list)
    challenges: list[dict] = Field(default_factory=list)
    primary_challenge: str | None = None
    campaign: str | None = None
    status: Status = "new"
    notes: str | None = None


class BulkUpsert(BaseModel):
    client_slug: str  # Growth Intelligence business slug == CampaignForge client slug
    leads: list[LeadIn]


class LeadPatch(BaseModel):
    status: Status | None = None
    note: str | None = None
    owner_user_id: str | None = None
    campaign_id: str | None = None


@router.post("/bulk-upsert")
async def bulk_upsert(body: BulkUpsert, db=Depends(get_db), tenant=Depends(get_tenant),
                      _auth=Depends(require_api_key_or_user)):
    """Idempotent on (client_id, platform, username). Never overwrites a status a person set."""
    client = await db.clients.get_by_slug(tenant.id, body.client_slug)  # TODO
    if not client:
        raise HTTPException(404, f"client '{body.client_slug}' not found in this workspace")
    for lead in body.leads:
        await db.leads.upsert(tenant.id, client.id, lead.model_dump(), protect_statuses=HUMAN_STATUSES)  # TODO
    return {"upserted": len(body.leads)}


@router.get("")
async def list_leads(client_id: str, tier: str | None = None, status: Status | None = None,
                     db=Depends(get_db), tenant=Depends(get_tenant)):
    return await db.leads.list(tenant.id, client_id, tier=tier, status=status)  # TODO


@router.patch("/{lead_id}")
async def patch_lead(lead_id: int, body: LeadPatch, db=Depends(get_db), tenant=Depends(get_tenant)):
    """Status changes are written to lead_events, which feeds the feedback loop."""
    return await db.leads.patch(tenant.id, lead_id, body.model_dump(exclude_none=True))  # TODO


@router.post("/{lead_id}/outreach")
async def add_outreach_draft(lead_id: int, step: int, body: str, db=Depends(get_db), tenant=Depends(get_tenant)):
    """Stores a draft and runs moderation on it. Never sends anything to Instagram."""
    # TODO: reuse services/moderation (brain tier + excluded vocabulary) as Posts > Queue approval does
    return await db.outreach.create(tenant.id, lead_id, step=step, body=body)  # TODO


@router.get("/funnel")
async def funnel(client_id: str, db=Depends(get_db), tenant=Depends(get_tenant)):
    """Counts per status per week, plus reply rate per campaign and primary_challenge."""
    return await db.leads.funnel(tenant.id, client_id)  # TODO

"""Loopback/tailnet-only gateway between Cashlog and a private model worker."""

from collections.abc import AsyncIterator
import os
import secrets

import httpx
from fastapi import FastAPI, Header, HTTPException, Request, status
from fastapi.responses import Response


MODEL_BASE_URL = os.getenv("MODEL_BASE_URL", "http://127.0.0.1:18010").rstrip("/")
API_KEY = os.getenv("PUBLIC_API_KEY")
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(11 * 1024 * 1024)))
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
ALLOW_PUBLIC_HEALTH = os.getenv("ALLOW_PUBLIC_HEALTH", "false").lower() == "true"

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


class UploadTooLarge(Exception):
    pass


def verify_api_key(value: str | None) -> None:
    if not API_KEY:
        raise RuntimeError("PUBLIC_API_KEY is not configured")
    if value is None or not secrets.compare_digest(value, API_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized",
        )


def validate_content_length(request: Request) -> None:
    raw = request.headers.get("content-length")
    if raw is None:
        return
    try:
        declared_size = int(raw)
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Invalid Content-Length") from error
    if declared_size < 0:
        raise HTTPException(status_code=400, detail="Invalid Content-Length")
    if declared_size > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Upload too large")


def forwarded_content_type(request: Request) -> str:
    content_type = request.headers.get("content-type", "")
    if not (
        content_type.startswith("multipart/form-data;")
        or content_type == "application/json"
    ):
        raise HTTPException(status_code=415, detail="Unsupported media type")
    return content_type


async def limited_body(request: Request) -> AsyncIterator[bytes]:
    received = 0
    async for chunk in request.stream():
        received += len(chunk)
        if received > MAX_UPLOAD_BYTES:
            raise UploadTooLarge
        yield chunk


async def upstream_request(
    method: str,
    path: str,
    *,
    content: AsyncIterator[bytes] | None = None,
    content_type: str | None = None,
) -> Response:
    headers = {"accept": "application/json"}
    if content_type:
        headers["content-type"] = content_type

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(60.0, connect=5.0),
            follow_redirects=False,
        ) as client:
            async with client.stream(
                method,
                f"{MODEL_BASE_URL}{path}",
                content=content,
                headers=headers,
            ) as upstream:
                payload = await upstream.aread()
                if len(payload) > MAX_RESPONSE_BYTES:
                    raise HTTPException(status_code=502, detail="Model response too large")
                upstream_status = upstream.status_code
                upstream_content_type = upstream.headers.get("content-type", "application/json")
    except UploadTooLarge as error:
        raise HTTPException(status_code=413, detail="Upload too large") from error
    except httpx.ConnectError as error:
        raise HTTPException(status_code=503, detail="Model worker unavailable") from error
    except httpx.TimeoutException as error:
        raise HTTPException(status_code=504, detail="Model worker timed out") from error
    except httpx.RequestError as error:
        raise HTTPException(status_code=502, detail="Model worker request failed") from error

    safe_content_type = (
        upstream_content_type
        if upstream_content_type.lower().startswith("application/json")
        else "application/json"
    )
    return Response(
        content=payload,
        status_code=upstream_status,
        headers={"Content-Type": safe_content_type},
    )


@app.get("/health")
async def health(x_api_key: str | None = Header(default=None)) -> Response:
    if not ALLOW_PUBLIC_HEALTH:
        verify_api_key(x_api_key)
    return await upstream_request("GET", "/health")


@app.post("/analyze-image")
async def analyze_image(
    request: Request,
    x_api_key: str | None = Header(default=None),
) -> Response:
    verify_api_key(x_api_key)
    validate_content_length(request)
    content_type = forwarded_content_type(request)
    return await upstream_request(
        "POST",
        "/analyze-image",
        content=limited_body(request),
        content_type=content_type,
    )

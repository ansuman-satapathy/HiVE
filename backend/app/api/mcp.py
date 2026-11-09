"""
HiVE MCP Server — exposes document search as a Model Context Protocol endpoint.

Implements the MCP 2024-11-05 spec over HTTP+SSE:
  GET  /mcp          — SSE stream for server-sent messages (server -> client)
  POST /mcp/message  — client messages (initialize, tools/list, tools/call)

External agents (Claude Desktop, Cursor, any MCP client) can add HiVE to their
mcp_servers config and query indexed documents without opening the web UI.

MCP spec reference: https://modelcontextprotocol.io/specification
"""
import json
import uuid
import logging
from datetime import datetime, timezone
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, Request, HTTPException, status
from fastapi.responses import StreamingResponse, JSONResponse
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.services.agent_tools import ToolDispatcher

logger = logging.getLogger("mcp_server")

router = APIRouter(prefix="/mcp", tags=["MCP"])

# ── MCP protocol constants ────────────────────────────────────────────────────

MCP_PROTOCOL_VERSION = "2024-11-05"

SERVER_INFO = {
    "name": "hive-knowledge-base",
    "version": "1.0.0",
}

# Single exposed tool — the same search_knowledge_base that powers the chat agent
TOOL_DEFINITIONS = [
    {
        "name": "search_knowledge_base",
        "description": (
            "Search through documents indexed in this HiVE workspace using hybrid "
            "BM25 + dense vector retrieval, cross-encoder reranking, and context "
            "window expansion. Returns the most relevant excerpts with citation metadata."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query or question to answer from the documents.",
                },
                "top_k": {
                    "type": "integer",
                    "description": "Number of chunks to retrieve (default: 5, max: 20).",
                    "default": 5,
                    "minimum": 1,
                    "maximum": 20,
                },
                "document_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional list of document UUIDs to scope the search to.",
                },
                "window_size": {
                    "type": "integer",
                    "description": "Number of surrounding chunks to include for context expansion (default: 1).",
                    "default": 1,
                    "minimum": 0,
                    "maximum": 3,
                },
            },
            "required": ["query"],
        },
    }
]

# ── SSE helpers ───────────────────────────────────────────────────────────────

def _mcp_event(event_type: str, data: dict) -> str:
    """Format a single SSE frame in MCP envelope format."""
    payload = json.dumps({
        "jsonrpc": "2.0",
        "method": f"notifications/{event_type}",
        "params": data,
    })
    return f"event: message\ndata: {payload}\n\n"


async def _sse_keepalive() -> AsyncGenerator[str, None]:
    """Yields a comment keepalive ping — MCP clients expect the SSE connection to stay open."""
    yield ": hive-mcp-keepalive\n\n"


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get(
    "",
    summary="MCP SSE stream (server -> client channel)",
    description=(
        "Open a persistent SSE connection. The server uses this channel to push "
        "tool results and notifications back to the MCP client. "
        "Authentication: Bearer token in Authorization header."
    ),
)
async def mcp_sse_stream(
    current_user: User = Depends(get_current_user),
):
    """
    MCP SSE channel (server -> client).

    Per spec, the client opens this connection first, then sends JSON-RPC
    messages to POST /mcp/message. The server pushes responses here.

    For the stateless HTTP transport variant, this endpoint sends the
    server capabilities immediately on connect.
    """
    async def stream() -> AsyncGenerator[str, None]:
        # Immediately announce server capabilities on connect
        capabilities_event = _mcp_event("initialized", {
            "protocolVersion": MCP_PROTOCOL_VERSION,
            "serverInfo": SERVER_INFO,
            "capabilities": {
                "tools": {"listChanged": False},
            },
        })
        yield capabilities_event
        # Keepalive comment to maintain connection
        yield ": ping\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post(
    "/message",
    summary="MCP JSON-RPC message handler (client -> server)",
    description=(
        "Accepts MCP JSON-RPC 2.0 messages: initialize, tools/list, tools/call. "
        "Authentication: Bearer token in Authorization header."
    ),
)
async def mcp_message(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Stateless MCP message handler.

    Accepts JSON-RPC 2.0 requests and returns JSON-RPC 2.0 responses.
    This covers the three methods any MCP client will call:

      - initialize       — handshake, returns server capabilities
      - tools/list       — returns the tool catalogue
      - tools/call       — executes a tool and returns the result
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    rpc_id = body.get("id")
    method = body.get("method", "")
    params = body.get("params", {})

    # ── initialize ───────────────────────────────────────────────────────────
    if method == "initialize":
        return JSONResponse({
            "jsonrpc": "2.0",
            "id": rpc_id,
            "result": {
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "serverInfo": SERVER_INFO,
                "capabilities": {
                    "tools": {"listChanged": False},
                },
            },
        })

    # ── tools/list ───────────────────────────────────────────────────────────
    if method == "tools/list":
        return JSONResponse({
            "jsonrpc": "2.0",
            "id": rpc_id,
            "result": {"tools": TOOL_DEFINITIONS},
        })

    # ── tools/call ───────────────────────────────────────────────────────────
    if method == "tools/call":
        tool_name = params.get("name", "")
        tool_args = params.get("arguments", {})

        if tool_name != "search_knowledge_base":
            return JSONResponse({
                "jsonrpc": "2.0",
                "id": rpc_id,
                "error": {
                    "code": -32601,
                    "message": f"Tool not found: '{tool_name}'",
                },
            })

        query = tool_args.get("query", "").strip()
        if not query:
            return JSONResponse({
                "jsonrpc": "2.0",
                "id": rpc_id,
                "error": {
                    "code": -32602,
                    "message": "Missing required argument: 'query'",
                },
            })

        top_k = min(int(tool_args.get("top_k", 5)), 20)
        window_size = min(int(tool_args.get("window_size", 1)), 3)
        document_ids = tool_args.get("document_ids") or None
        if document_ids:
            document_ids = [str(d).strip() for d in document_ids if str(d).strip()]

        try:
            dispatcher = ToolDispatcher()
            result = await dispatcher.execute_tool(
                name="search_knowledge_base",
                db=db,
                user_id=current_user.id,
                tool_input={
                    "query": query,
                    "document_ids": document_ids,
                    "top_k": top_k,
                    "window_size": window_size,
                },
            )
        except Exception as exc:
            logger.error(f"MCP tool execution error: {exc}", exc_info=True)
            return JSONResponse({
                "jsonrpc": "2.0",
                "id": rpc_id,
                "error": {
                    "code": -32603,
                    "message": f"Tool execution failed: {exc}",
                },
            })

        # Format result as MCP content blocks
        citations = result.get("citations", [])
        context_text = result.get("context_text", "")
        summary = result.get("summary", "")

        # Build a human-readable text block + structured JSON block
        text_parts = [f"**{summary}**\n"]
        for i, cite in enumerate(citations, 1):
            heading = cite.get("active_heading") or ""
            heading_str = f" — {heading}" if heading else ""
            text_parts.append(
                f"\n---\n**[{i}] {cite.get('document_title', 'Document')}"
                f"{heading_str} (Chunk #{cite.get('chunk_index', i - 1)})**\n"
                f"{cite.get('content', '')}"
            )

        content_blocks = [
            {
                "type": "text",
                "text": "\n".join(text_parts) if text_parts else "No results found.",
            },
            {
                "type": "text",
                "text": json.dumps({
                    "citations": citations,
                    "total_chunks": len(citations),
                    "query": query,
                }, indent=2),
                "annotations": {"role": "structured_data"},
            },
        ]

        return JSONResponse({
            "jsonrpc": "2.0",
            "id": rpc_id,
            "result": {
                "content": content_blocks,
                "isError": False,
            },
        })

    # ── Unknown method ────────────────────────────────────────────────────────
    return JSONResponse({
        "jsonrpc": "2.0",
        "id": rpc_id,
        "error": {
            "code": -32601,
            "message": f"Method not found: '{method}'",
        },
    })


# ── Health / discovery endpoint ───────────────────────────────────────────────

@router.get(
    "/info",
    summary="MCP server info (unauthenticated)",
    description="Returns server metadata for MCP client discovery. No auth required.",
)
async def mcp_info():
    """
    Unauthenticated endpoint that MCP clients can use to discover this server.
    Returns the same info that initialize returns, without needing a token.
    """
    return {
        "protocol": "MCP",
        "version": MCP_PROTOCOL_VERSION,
        "server": SERVER_INFO,
        "tools": [t["name"] for t in TOOL_DEFINITIONS],
        "auth": "Bearer token required for /mcp and /mcp/message",
        "endpoints": {
            "sse": "GET /mcp",
            "message": "POST /mcp/message",
            "info": "GET /mcp/info",
        },
    }


#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


OPENCLAW_ROOT = Path.home() / ".openclaw"
DEFAULT_TRACE_PATH = OPENCLAW_ROOT / "logs" / "cache-trace.jsonl"
DEFAULT_AGENTS_ROOT = OPENCLAW_ROOT / "agents"


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Show the latest fully-expanded OpenClaw model input and output "
            "for a session from cache-trace.jsonl."
        )
    )
    parser.add_argument(
        "session",
        help=(
            "Session identifier. Supports session key "
            "(for example agent:player-agent:agentbox-background-runner), "
            "session id, or the trailing session label/key suffix "
            "(for example agentbox-background-runner)."
        ),
    )
    parser.add_argument(
        "--trace-file",
        type=Path,
        default=DEFAULT_TRACE_PATH,
        help=f"Path to cache-trace.jsonl. Default: {DEFAULT_TRACE_PATH}",
    )
    parser.add_argument(
        "--agents-root",
        type=Path,
        default=DEFAULT_AGENTS_ROOT,
        help=f"Path to the OpenClaw agents directory. Default: {DEFAULT_AGENTS_ROOT}",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print a machine-readable JSON object instead of a text report.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Write the report to a file instead of stdout.",
    )
    parser.add_argument(
        "--max-text-chars",
        type=int,
        default=4000,
        help="When printing text output, truncate long sections to this many characters. Default: 4000",
    )
    return parser.parse_args()


def _load_sessions(agents_root: Path) -> dict[str, dict[str, Any]]:
    sessions: dict[str, dict[str, Any]] = {}
    if not agents_root.exists():
        return sessions
    for sessions_json in agents_root.glob("*/sessions/sessions.json"):
        try:
            payload = json.loads(sessions_json.read_text())
        except Exception:
            continue
        if not isinstance(payload, dict):
            continue
        for session_key, meta in payload.items():
            if isinstance(meta, dict):
                sessions[session_key] = meta
    return sessions


def _resolve_session(query: str, sessions: dict[str, dict[str, Any]]) -> tuple[str | None, str | None]:
    query = query.strip()
    if not query:
        return None, None

    exact_key = sessions.get(query)
    if exact_key:
        return query, str(exact_key.get("sessionId") or "") or None

    key_matches: list[tuple[str, dict[str, Any]]] = []
    id_matches: list[tuple[str, dict[str, Any]]] = []
    suffix_matches: list[tuple[str, dict[str, Any]]] = []

    for session_key, meta in sessions.items():
        session_id = str(meta.get("sessionId") or "")
        if session_id == query:
            id_matches.append((session_key, meta))
        if session_key.endswith(f":{query}") or session_key == query:
            suffix_matches.append((session_key, meta))
        elif query in session_key:
            key_matches.append((session_key, meta))

    for matches in (id_matches, suffix_matches, key_matches):
        if len(matches) == 1:
            key, meta = matches[0]
            return key, str(meta.get("sessionId") or "") or None

    return None, None


def _load_trace_rows(trace_file: Path) -> list[dict[str, Any]]:
    if not trace_file.exists():
        raise FileNotFoundError(f"Trace file not found: {trace_file}")
    rows: list[dict[str, Any]] = []
    for line in trace_file.read_text().splitlines():
        if not line.strip():
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            rows.append(payload)
    return rows


def _split_trace_blocks(rows: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    blocks: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    for row in rows:
        if row.get("stage") == "session:loaded" and current:
            blocks.append(current)
            current = []
        current.append(row)
    if current:
        blocks.append(current)
    return blocks


def _find_latest_run(rows: list[dict[str, Any]], session_key: str, session_id: str | None) -> tuple[str, list[dict[str, Any]]]:
    matching = [
        row for row in rows
        if row.get("sessionKey") == session_key
        or (session_id and row.get("sessionId") == session_id)
    ]
    if not matching:
        raise ValueError(f"No trace rows found for session {session_key!r}")

    blocks = _split_trace_blocks(matching)
    selected_block = None
    for block in reversed(blocks):
        if any(row.get("stage") == "stream:context" for row in block):
            selected_block = block
            break
    if selected_block is None:
        raise ValueError(
            f"No stream:context row found yet for session {session_key!r}. "
            "Wait for one model call to complete after cacheTrace is enabled."
        )

    latest_stream = _last_stage(selected_block, "stream:context")
    run_id = str(latest_stream.get("runId") or "") if latest_stream else ""
    if not run_id:
        run_id = str(selected_block[0].get("runId") or "")
    if not run_id:
        run_id = "<unknown>"
    return run_id, selected_block


def _last_stage(rows: list[dict[str, Any]], stage: str) -> dict[str, Any] | None:
    for row in reversed(rows):
        if row.get("stage") == stage:
            return row
    return None


def _truncate(value: str | None, max_chars: int) -> str:
    text = value or ""
    if max_chars <= 0 or len(text) <= max_chars:
        return text
    omitted = len(text) - max_chars
    return f"{text[:max_chars]}\n\n... [truncated {omitted} chars]"


def _extract_assistant_output(session_after: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not session_after:
        return []
    messages = session_after.get("messages")
    if not isinstance(messages, list):
        return []
    assistants = [
        message for message in messages
        if isinstance(message, dict) and message.get("role") == "assistant"
    ]
    if not assistants:
        return []
    return [assistants[-1]]


def _build_report(
    session_query: str,
    session_key: str,
    session_id: str | None,
    run_id: str,
    run_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    prompt_before = _last_stage(run_rows, "prompt:before")
    stream_context = _last_stage(run_rows, "stream:context")
    session_after = _last_stage(run_rows, "session:after")

    system_prompt = stream_context.get("system") if stream_context else None
    final_messages = stream_context.get("messages") if stream_context else None
    output_messages = _extract_assistant_output(session_after)

    return {
        "query": session_query,
        "sessionKey": session_key,
        "sessionId": session_id,
        "runId": run_id,
        "traceStages": [row.get("stage") for row in run_rows],
        "promptBefore": prompt_before.get("prompt") if prompt_before else None,
        "systemPrompt": system_prompt,
        "messages": final_messages if isinstance(final_messages, list) else [],
        "assistantMessages": output_messages,
        "raw": {
            "promptBefore": prompt_before,
            "streamContext": stream_context,
            "sessionAfter": session_after,
        },
    }


def _print_text_report(report: dict[str, Any], max_text_chars: int) -> None:
    lines = [
        f"Session query: {report['query']}",
        f"Session key: {report['sessionKey']}",
        f"Session id: {report['sessionId'] or '<unknown>'}",
        f"Run id: {report['runId']}",
        f"Stages: {', '.join(str(stage) for stage in report['traceStages'])}",
        "",
        "=== PROMPT BEFORE ===",
        _truncate(report.get("promptBefore"), max_text_chars),
        "",
        "=== FINAL SYSTEM PROMPT ===",
        _truncate(report.get("systemPrompt"), max_text_chars),
        "",
        "=== FINAL MESSAGES ===",
        _truncate(
            json.dumps(report.get("messages", []), ensure_ascii=False, indent=2),
            max_text_chars,
        ),
        "",
        "=== ASSISTANT OUTPUT ===",
        _truncate(
            json.dumps(report.get("assistantMessages", []), ensure_ascii=False, indent=2),
            max_text_chars,
        ),
    ]
    return "\n".join(lines) + "\n"


def main() -> int:
    args = _parse_args()
    sessions = _load_sessions(args.agents_root)
    session_key, session_id = _resolve_session(args.session, sessions)
    if not session_key:
        print(
            f"Could not resolve session {args.session!r} from {args.agents_root}.",
            file=sys.stderr,
        )
        return 1

    try:
        rows = _load_trace_rows(args.trace_file)
        run_id, run_rows = _find_latest_run(rows, session_key, session_id)
    except (FileNotFoundError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1

    report = _build_report(args.session, session_key, session_id, run_id, run_rows)
    if args.json:
        output = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    else:
        output = _print_text_report(report, args.max_text_chars)

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output)
    else:
        sys.stdout.write(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

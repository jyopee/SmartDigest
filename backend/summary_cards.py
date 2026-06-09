"""Summary card JSON parsing, layout helpers, and markdown fallbacks."""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

SUMMARY_VERSION = 3
GRID_COLS = 12

VALID_CARD_TYPES = {"main", "detail", "question"}
TYPE_ALIASES = {"details": "detail", "main_topic": "main"}

CARD_JSON_INSTRUCTION = """
반드시 아래 JSON 형식만 출력하세요. 코드펜스나 추가 설명 없이 순수 JSON만 반환하세요.
{"cards": [{"id": "고유-id", "type": "main", "weight": 8, "title": "제목", "content": "마크다운 본문", "page_number": 1}]}

규칙:
- type은 "main", "detail", "question" 중 하나
  - main: 핵심 주제·한 줄 요약·섹션 제목
  - detail: 상세 설명·불릿·수치·근거
  - question: 학습자가 궁금해할 만한 질문·탐구 포인트(원문 근거가 있을 때만)
- weight: 1~10 정수. 중요도·화면 크기에 반영 (main은 보통 7~10, detail은 4~8, question은 3~6)
- 원문에 없는 내용은 추가하지 마세요.
- id는 영문·숫자·하이픈으로 고유하게 작성하세요.
- content는 마크다운(불릿·짧은 문단)으로 작성하세요.
"""

TYPE_SORT_ORDER = {"main": 0, "detail": 1, "question": 2}


def _strip_code_fence(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def normalize_card_type(raw_type: str | None, index: int = 0) -> str:
    value = str(raw_type or "").strip().lower()
    value = TYPE_ALIASES.get(value, value)
    if value in VALID_CARD_TYPES:
        return value
    return "main" if index == 0 else "detail"


def normalize_weight(raw_weight: Any, card_type: str) -> int:
    try:
        weight = int(raw_weight)
    except (TypeError, ValueError):
        weight = 0
    if weight < 1 or weight > 10:
        defaults = {"main": 8, "detail": 5, "question": 4}
        return defaults.get(card_type, 5)
    return weight


def normalize_card(card: dict[str, Any], index: int = 0) -> dict[str, Any] | None:
    title = str(card.get("title") or "").strip()
    content = str(card.get("content") or "").strip()
    if not title and not content:
        return None

    card_type = normalize_card_type(card.get("type"), index)
    weight = normalize_weight(card.get("weight"), card_type)

    normalized = {
        "id": str(card.get("id") or f"card-{uuid.uuid4().hex[:8]}"),
        "type": card_type,
        "weight": weight,
        "title": title or "요약",
        "content": content,
        "page_number": int(card.get("page_number") or 1),
    }
    source = str(card.get("source") or "").strip().lower()
    if source in {"note", "chat"}:
        normalized["source"] = source
        try:
            normalized["source_id"] = int(card.get("source_id"))
        except (TypeError, ValueError):
            pass
        selected_text = str(card.get("selected_text") or "").strip()
        if selected_text:
            normalized["selected_text"] = selected_text
    return normalized


def parse_cards_json(text: str) -> list[dict[str, Any]]:
    if not text or not str(text).strip():
        return []

    raw = _strip_code_fence(str(text))
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return markdown_to_cards(raw)

    cards = payload.get("cards") if isinstance(payload, dict) else payload
    if not isinstance(cards, list):
        return markdown_to_cards(raw)

    normalized: list[dict[str, Any]] = []
    for index, card in enumerate(cards):
        if not isinstance(card, dict):
            continue
        item = normalize_card(card, index)
        if item:
            normalized.append(item)
    return normalized


def markdown_to_cards(markdown: str) -> list[dict[str, Any]]:
    text = (markdown or "").strip()
    if not text:
        return []

    sections = re.split(r"(?=^## )", text, flags=re.MULTILINE)
    sections = [part.strip() for part in sections if part.strip()]
    if len(sections) <= 1 and not text.startswith("##"):
        return [
            {
                "id": "legacy-detail-1",
                "type": "detail",
                "weight": 5,
                "title": "요약",
                "content": text,
                "page_number": 1,
            }
        ]

    cards: list[dict[str, Any]] = []
    for index, section in enumerate(sections):
        lines = section.splitlines()
        title = lines[0].lstrip("#").strip() if lines else f"섹션 {index + 1}"
        body = "\n".join(lines[1:]).strip() if len(lines) > 1 else ""
        lowered = title.lower()
        if any(key in lowered for key in ("질문", "question", "q&a")):
            card_type = "question"
            weight = 4
        elif index == 0 or any(
            key in lowered for key in ("핵심", "주제", "개요", "main", "topic")
        ):
            card_type = "main"
            weight = 8
        else:
            card_type = "detail"
            weight = 5

        cards.append(
            {
                "id": f"legacy-{card_type}-{index + 1}",
                "type": card_type,
                "weight": weight,
                "title": title,
                "content": body or section,
                "page_number": 1,
            }
        )
    return cards


def parse_digest_content(content: str | None) -> dict[str, Any]:
    text = (content or "").strip()
    if not text:
        return {"version": 1, "cards": [], "markdown": ""}

    if text.startswith("{"):
        try:
            payload = json.loads(text)
            if isinstance(payload, dict) and isinstance(payload.get("cards"), list):
                cards = parse_cards_json(text)
                for card in cards:
                    card["type"] = normalize_card_type(card.get("type"))
                    card["weight"] = normalize_weight(
                        card.get("weight"), card["type"]
                    )
                return {
                    "version": payload.get("version", SUMMARY_VERSION),
                    "cards": cards,
                    "markdown": cards_to_markdown(cards),
                }
        except json.JSONDecodeError:
            pass

    cards = markdown_to_cards(text)
    return {"version": 1, "cards": cards, "markdown": text}


def cards_to_markdown(cards: list[dict[str, Any]]) -> str:
    if not cards:
        return ""
    parts: list[str] = []
    for card in cards:
        title = str(card.get("title") or "요약").strip()
        content = str(card.get("content") or "").strip()
        parts.append(f"## {title}\n\n{content}" if content else f"## {title}")
    return "\n\n".join(parts)


def build_storage_payload(cards: list[dict[str, Any]]) -> str:
    return json.dumps({"version": SUMMARY_VERSION, "cards": cards}, ensure_ascii=False)


def card_grid_dimensions(card: dict[str, Any]) -> dict[str, int]:
    card_type = normalize_card_type(card.get("type"))
    weight = normalize_weight(card.get("weight"), card_type)

    if card_type == "main":
        if weight >= 9:
            return {"w": 12, "h": 4, "minW": 4, "minH": 2}
        if weight >= 7:
            return {"w": 8, "h": 3, "minW": 4, "minH": 2}
        if weight >= 5:
            return {"w": 6, "h": 3, "minW": 3, "minH": 2}
        return {"w": 6, "h": 2, "minW": 3, "minH": 2}

    if card_type == "question":
        return {"w": 5, "h": 2, "minW": 3, "minH": 2}

    if weight >= 8:
        return {"w": 6, "h": 3, "minW": 3, "minH": 2}
    if weight >= 5:
        return {"w": 4, "h": 2, "minW": 3, "minH": 2}
    return {"w": 4, "h": 2, "minW": 3, "minH": 2}


def build_smart_layout(cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not cards:
        return []

    sorted_cards = sorted(
        cards,
        key=lambda card: (
            -normalize_weight(card.get("weight"), normalize_card_type(card.get("type"))),
            TYPE_SORT_ORDER.get(normalize_card_type(card.get("type")), 9),
            str(card.get("title") or ""),
        ),
    )

    layout: list[dict[str, Any]] = []
    x = 0
    y = 0
    row_height = 0

    for card in sorted_cards:
        dims = card_grid_dimensions(card)
        width = min(dims["w"], GRID_COLS)

        if x > 0 and x + width > GRID_COLS:
            y += row_height
            x = 0
            row_height = 0

        layout.append(
            {
                "i": card["id"],
                "x": x,
                "y": y,
                "w": width,
                "h": dims["h"],
                "minW": dims["minW"],
                "minH": dims["minH"],
            }
        )

        x += width
        row_height = max(row_height, dims["h"])

        if x >= GRID_COLS:
            y += row_height
            x = 0
            row_height = 0

    return layout


def build_default_layout(cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Backward-compatible alias for smart layout."""
    return build_smart_layout(cards)


def _truncate_title(text: str, max_len: int = 48) -> str:
    cleaned = str(text or "").strip()
    if len(cleaned) <= max_len:
        return cleaned or "학습 카드"
    return f"{cleaned[: max_len - 1]}…"


def find_card_by_source(
    cards: list[dict[str, Any]], source: str, source_id: int
) -> dict[str, Any] | None:
    for card in cards:
        if (
            str(card.get("source") or "").lower() == source
            and card.get("source_id") == source_id
        ):
            return card
    return None


def card_from_note(note: dict[str, Any]) -> dict[str, Any]:
    selected = str(note.get("selected_text") or "").strip()
    content = str(note.get("content") or "").strip()
    title_source = selected or content
    body_parts: list[str] = []
    if selected:
        body_parts.append(f"> {selected}")
    if content:
        body_parts.append(content)
    return {
        "id": f"note-{note['id']}",
        "type": "detail",
        "weight": 5,
        "title": _truncate_title(title_source, 40),
        "content": "\n\n".join(body_parts) or content,
        "page_number": int(note.get("page_number") or 1),
        "source": "note",
        "source_id": int(note["id"]),
        "selected_text": selected,
    }


def card_from_chat(chat: dict[str, Any]) -> dict[str, Any]:
    question = str(chat.get("question") or "").strip()
    answer = str(chat.get("answer") or "").strip()
    selected = str(chat.get("selected_text") or "").strip()
    body_parts: list[str] = []
    if selected:
        body_parts.append(f"> {selected}")
    if question:
        body_parts.append(f"**질문:** {question}")
    if answer:
        body_parts.append(f"**답변:** {answer}")
    return {
        "id": f"chat-{chat['id']}",
        "type": "question",
        "weight": 5,
        "title": _truncate_title(question, 40),
        "content": "\n\n".join(body_parts) or question,
        "page_number": int(chat.get("page_number") or 1),
        "source": "chat",
        "source_id": int(chat["id"]),
        "selected_text": selected,
    }


MINDMAP_ENGINE = "mindmap"
MINDMAP_PADDING_X = 96
MINDMAP_PADDING_Y = 96
MINDMAP_STEP_X = 380
MINDMAP_STEP_Y = 240


def is_mindmap_layout(layout: Any) -> bool:
    return (
        isinstance(layout, dict)
        and str(layout.get("engine") or "") == MINDMAP_ENGINE
    )


def build_default_mindmap_layout(cards: list[dict[str, Any]]) -> dict[str, Any]:
    if not cards:
        return {"engine": MINDMAP_ENGINE, "nodes": [], "edges": []}

    sorted_cards = sorted(
        cards,
        key=lambda card: (
            -normalize_weight(card.get("weight"), normalize_card_type(card.get("type"))),
            TYPE_SORT_ORDER.get(normalize_card_type(card.get("type")), 9),
            str(card.get("title") or ""),
        ),
    )

    nodes: list[dict[str, Any]] = []
    col = 0
    row = 0
    for card in sorted_cards:
        nodes.append(
            {
                "id": card["id"],
                "x": MINDMAP_PADDING_X + col * MINDMAP_STEP_X,
                "y": MINDMAP_PADDING_Y + row * MINDMAP_STEP_Y,
            }
        )
        col += 1
        if col >= 3:
            col = 0
            row += 1

    return {"engine": MINDMAP_ENGINE, "nodes": nodes, "edges": []}


def normalize_layout_for_cards(
    layout: Any, cards: list[dict[str, Any]]
) -> dict[str, Any] | list[dict[str, Any]]:
    if is_mindmap_layout(layout):
        return ensure_mindmap_layout_for_cards(layout, cards)
    if isinstance(layout, list) and layout:
        return layout
    if cards:
        return build_default_mindmap_layout(cards)
    return build_default_mindmap_layout([])


def ensure_mindmap_layout_for_cards(
    layout: dict[str, Any], cards: list[dict[str, Any]]
) -> dict[str, Any]:
    card_ids = {str(card.get("id")) for card in cards}
    seen: set[str] = set()
    nodes: list[dict[str, Any]] = []

    for node in layout.get("nodes") or []:
        node_id = str(node.get("id") or "")
        if not node_id or node_id not in card_ids or node_id in seen:
            continue
        seen.add(node_id)
        nodes.append(
            {
                "id": node_id,
                "x": int(node.get("x") or 0),
                "y": int(node.get("y") or 0),
            }
        )

    missing = [card for card in cards if str(card.get("id")) not in seen]
    if missing:
        max_y = max((node.get("y", 0) for node in nodes), default=0)
        for index, card in enumerate(missing):
            nodes.append(
                {
                    "id": str(card["id"]),
                    "x": MINDMAP_PADDING_X,
                    "y": max_y + MINDMAP_STEP_Y + index * MINDMAP_STEP_Y,
                }
            )

    edges: list[dict[str, Any]] = []
    for index, edge in enumerate(layout.get("edges") or []):
        source = str(edge.get("source") or "")
        target = str(edge.get("target") or "")
        if not source or not target:
            continue
        if source not in card_ids or target not in card_ids:
            continue
        edges.append(
            {
                "id": str(edge.get("id") or f"edge-{source}-{target}-{index}"),
                "source": source,
                "target": target,
                "label": str(edge.get("label") or "").strip(),
                "sourceHandle": str(edge.get("sourceHandle") or "").strip(),
                "targetHandle": str(edge.get("targetHandle") or "").strip(),
            }
        )

    return {"engine": MINDMAP_ENGINE, "nodes": nodes, "edges": edges}


def append_layout_item(
    layout: list[dict[str, Any]] | dict[str, Any] | None, card: dict[str, Any]
) -> list[dict[str, Any]] | dict[str, Any]:
    if is_mindmap_layout(layout):
        base = ensure_mindmap_layout_for_cards(layout, [])
        nodes = list(base.get("nodes") or [])
        max_y = max((node.get("y", 0) for node in nodes), default=0)
        nodes.append(
            {
                "id": card["id"],
                "x": MINDMAP_PADDING_X,
                "y": max_y + MINDMAP_STEP_Y,
            }
        )
        return {
            "engine": MINDMAP_ENGINE,
            "nodes": nodes,
            "edges": list(base.get("edges") or []),
        }

    dims = card_grid_dimensions(card)
    base_layout = list(layout or [])
    max_y = max((item.get("y", 0) + item.get("h", 0)) for item in base_layout) if base_layout else 0
    base_layout.append(
        {
            "i": card["id"],
            "x": 0,
            "y": max_y,
            "w": dims["w"],
            "h": dims["h"],
            "minW": dims["minW"],
            "minH": dims["minH"],
        }
    )
    return base_layout


def remove_card_from_grid(
    cards: list[dict[str, Any]],
    layout: list[dict[str, Any]] | dict[str, Any] | None,
    card_id: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]] | dict[str, Any]]:
    card_key = str(card_id or "").strip()
    if not card_key:
        raise ValueError("카드 ID가 필요합니다.")

    next_cards = [card for card in cards if str(card.get("id")) != card_key]
    if len(next_cards) == len(cards):
        raise ValueError("카드를 찾을 수 없습니다.")

    if is_mindmap_layout(layout):
        base = layout or {"engine": MINDMAP_ENGINE, "nodes": [], "edges": []}
        next_nodes = [
            node
            for node in (base.get("nodes") or [])
            if str(node.get("id")) != card_key
        ]
        next_edges = [
            edge
            for edge in (base.get("edges") or [])
            if str(edge.get("source")) != card_key and str(edge.get("target")) != card_key
        ]
        return next_cards, {
            "engine": MINDMAP_ENGINE,
            "nodes": next_nodes,
            "edges": next_edges,
        }

    next_layout = [
        item for item in (layout or []) if str(item.get("i")) != card_key
    ]
    return next_cards, next_layout


def add_card_from_source(
    cards: list[dict[str, Any]],
    layout: list[dict[str, Any]] | None,
    source: str,
    payload: dict[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]], bool]:
    source_key = str(source or "").strip().lower()
    if source_key not in {"note", "chat"}:
        raise ValueError("지원하지 않는 카드 소스입니다.")

    source_id = int(payload["id"])
    existing = find_card_by_source(cards, source_key, source_id)
    if existing:
        return existing, list(layout or []), cards, True

    card = card_from_note(payload) if source_key == "note" else card_from_chat(payload)
    next_cards = [*cards, card]
    next_layout = append_layout_item(layout, card)
    return card, next_layout, next_cards, False


def merge_partial_card_lists(partials: list[list[dict[str, Any]]]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen_titles: set[str] = set()
    for chunk_index, cards in enumerate(partials, start=1):
        for card in cards:
            title_key = str(card.get("title") or "").strip().lower()
            if title_key and title_key in seen_titles:
                continue
            if title_key:
                seen_titles.add(title_key)
            merged.append({**card, "page_number": chunk_index})
    return merged

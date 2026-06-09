import json
import re
import sqlite3
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).resolve().parent / "smart_digest.db"


def _connect():
    return sqlite3.connect(DB_PATH)


# DB 초기화: 테이블 생성 및 컬럼 확인
def init_db():
    conn = _connect()
    c = conn.cursor()
    # 사용자 테이블
    c.execute('''CREATE TABLE IF NOT EXISTS users 
                 (userid TEXT PRIMARY KEY, password TEXT)''')
    # 지식 테이블 (userid 컬럼 필수!)
    c.execute('''CREATE TABLE IF NOT EXISTS digests 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                  userid TEXT, 
                  filename TEXT, 
                  content TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS annotations
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  digest_id INTEGER,
                  sentence_idx INTEGER,
                  selected_text TEXT,
                  comment TEXT)''')
    c.execute(
        """CREATE TABLE IF NOT EXISTS digest_pages
           (id INTEGER PRIMARY KEY AUTOINCREMENT,
            digest_id INTEGER NOT NULL,
            page_number INTEGER NOT NULL,
            content TEXT NOT NULL,
            UNIQUE(digest_id, page_number))"""
    )
    c.execute(
        """CREATE TABLE IF NOT EXISTS notes
           (id INTEGER PRIMARY KEY AUTOINCREMENT,
            digest_id INTEGER NOT NULL,
            selected_text TEXT,
            content TEXT NOT NULL,
            page_number INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')))"""
    )
    c.execute(
        """CREATE TABLE IF NOT EXISTS chat_history
           (id INTEGER PRIMARY KEY AUTOINCREMENT,
            digest_id INTEGER NOT NULL,
            page_number INTEGER DEFAULT 1,
            selected_text TEXT,
            question TEXT NOT NULL,
            answer TEXT,
            created_at TEXT DEFAULT (datetime('now')))"""
    )
    c.execute(
        """CREATE TABLE IF NOT EXISTS usage_log
           (id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            user_id TEXT NOT NULL,
            tokens_used INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')))"""
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_usage_log_user_date ON usage_log (user_id, date)"
    )
    c.execute(
        """CREATE TABLE IF NOT EXISTS digest_grid_layouts
           (digest_id INTEGER PRIMARY KEY,
            layout_json TEXT NOT NULL)"""
    )
    c.execute(
        """CREATE TABLE IF NOT EXISTS layout_snapshots
           (id INTEGER PRIMARY KEY AUTOINCREMENT,
            digest_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            layout_json TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')))"""
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_layout_snapshots_digest ON layout_snapshots (digest_id, id DESC)"
    )
    c.execute("PRAGMA table_info(annotations)")
    columns = [row[1] for row in c.fetchall()]
    if "selected_text" not in columns:
        c.execute("ALTER TABLE annotations ADD COLUMN selected_text TEXT")
    if "page_number" not in columns:
        c.execute("ALTER TABLE annotations ADD COLUMN page_number INTEGER DEFAULT 1")
    c.execute("PRAGMA table_info(digest_pages)")
    page_columns = [row[1] for row in c.fetchall()]
    if "split_points_json" not in page_columns:
        c.execute("ALTER TABLE digest_pages ADD COLUMN split_points_json TEXT")
    c.execute("PRAGMA table_info(chat_history)")
    chat_columns = [row[1] for row in c.fetchall()]
    if "sources_json" not in chat_columns:
        c.execute("ALTER TABLE chat_history ADD COLUMN sources_json TEXT")
    if "is_verified" not in chat_columns:
        c.execute("ALTER TABLE chat_history ADD COLUMN is_verified INTEGER DEFAULT 0")
    c.execute("PRAGMA table_info(layout_snapshots)")
    snapshot_columns = [row[1] for row in c.fetchall()]
    if "is_original" not in snapshot_columns:
        c.execute(
            "ALTER TABLE layout_snapshots ADD COLUMN is_original INTEGER DEFAULT 0"
        )
    conn.commit()
    conn.close()
    _migrate_legacy_annotations_to_notes()


def _migrate_legacy_annotations_to_notes() -> None:
    conn = _connect()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM notes")
    if c.fetchone()[0] > 0:
        conn.close()
        return
    c.execute(
        """
        INSERT INTO notes (digest_id, selected_text, content, page_number)
        SELECT digest_id, selected_text, comment, COALESCE(page_number, 1)
        FROM annotations
        WHERE selected_text IS NOT NULL AND TRIM(selected_text) != ''
          AND comment IS NOT NULL AND TRIM(comment) != ''
        """
    )
    conn.commit()
    conn.close()

# 회원가입
def add_user(userid, password):
    try:
        conn = _connect()
        c = conn.cursor()
        c.execute("INSERT INTO users (userid, password) VALUES (?, ?)", (userid, password))
        conn.commit()
        conn.close()
        return True
    except:
        return False

# 로그인 확인
def check_user(userid, password):
    conn = _connect()
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE userid = ? AND password = ?", (userid, password))
    user = c.fetchone()
    conn.close()
    return user is not None

# 데이터 저장 (userid 포함)
def save_digest(userid, filename, content):
    conn = _connect()
    c = conn.cursor()
    c.execute("INSERT INTO digests (userid, filename, content) VALUES (?, ?, ?)", (userid, filename, content))
    digest_id = c.lastrowid
    conn.commit()
    conn.close()
    return digest_id


def save_digest_with_pages(userid, filename, content, pages: list[str]):
    digest_id = save_digest(userid, filename, content)
    save_digest_pages(digest_id, pages)
    return digest_id


ORIGINAL_SNAPSHOT_NAME = "원본"


def save_digest_with_pages_and_layout(
    userid: str,
    filename: str,
    content: str,
    pages: list[str],
    layout: list[dict] | None = None,
    cards: list | None = None,
) -> int:
    digest_id = save_digest_with_pages(userid, filename, content, pages)
    if layout:
        save_digest_grid_layout(digest_id, layout)
        ensure_original_layout_snapshot(digest_id, layout, cards=cards)
    return digest_id


def _parse_layout_json(raw: str | None) -> Any | None:
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if isinstance(parsed, (list, dict)):
        return parsed
    return None


def _pack_snapshot_payload(layout: Any, cards: list | None = None) -> dict:
    payload: dict[str, Any] = {"layout": layout}
    if cards is not None:
        payload["cards"] = cards
    return payload


def _snapshot_counts(raw: Any) -> tuple[int, int]:
    layout, cards = _unpack_snapshot_payload(raw)
    if isinstance(cards, list):
        card_count = len(cards)
    else:
        card_count = 0
    if isinstance(layout, dict):
        node_count = len(layout.get("nodes") or [])
    elif isinstance(layout, list):
        node_count = len(layout)
    else:
        node_count = 0
    if not card_count and node_count:
        card_count = node_count
    return card_count, node_count


def _unpack_snapshot_payload(raw: Any) -> tuple[Any, list | None]:
    if isinstance(raw, dict) and "layout" in raw:
        layout = raw.get("layout")
        cards = raw.get("cards")
        if isinstance(cards, list):
            return layout, cards
        return layout, None
    return raw, None


def get_digest_grid_layout(digest_id: int) -> Any | None:
    conn = _connect()
    c = conn.cursor()
    c.execute(
        "SELECT layout_json FROM digest_grid_layouts WHERE digest_id = ?",
        (digest_id,),
    )
    row = c.fetchone()
    conn.close()
    if not row:
        return None
    return _parse_layout_json(row[0])


def save_digest_grid_layout(digest_id: int, layout: Any) -> None:
    conn = _connect()
    c = conn.cursor()
    c.execute(
        """
        INSERT INTO digest_grid_layouts (digest_id, layout_json)
        VALUES (?, ?)
        ON CONFLICT(digest_id) DO UPDATE SET layout_json = excluded.layout_json
        """,
        (digest_id, json.dumps(layout, ensure_ascii=False)),
    )
    conn.commit()
    conn.close()


def has_original_layout_snapshot(digest_id: int) -> bool:
    conn = _connect()
    c = conn.cursor()
    c.execute(
        """
        SELECT 1
        FROM layout_snapshots
        WHERE digest_id = ? AND COALESCE(is_original, 0) = 1
        LIMIT 1
        """,
        (digest_id,),
    )
    exists = c.fetchone() is not None
    conn.close()
    return exists


def ensure_original_layout_snapshot(
    digest_id: int,
    layout: Any | None = None,
    *,
    cards: list | None = None,
) -> dict | None:
    if has_original_layout_snapshot(digest_id):
        return None

    target_layout = layout if layout is not None else get_digest_grid_layout(digest_id)
    if not target_layout:
        return None

    return create_layout_snapshot(
        digest_id,
        ORIGINAL_SNAPSHOT_NAME,
        target_layout,
        is_original=True,
        cards=cards,
    )


def list_layout_snapshots(digest_id: int) -> list[dict]:
    ensure_original_layout_snapshot(digest_id)
    conn = _connect()
    c = conn.cursor()
    c.execute(
        """
        SELECT id, name, created_at, COALESCE(is_original, 0), layout_json
        FROM layout_snapshots
        WHERE digest_id = ?
        ORDER BY COALESCE(is_original, 0) DESC, id DESC
        """,
        (digest_id,),
    )
    rows = []
    for row in c.fetchall():
        raw_payload = _parse_layout_json(row[4])
        card_count, node_count = _snapshot_counts(raw_payload)
        rows.append(
            {
                "id": row[0],
                "name": row[1],
                "created_at": row[2],
                "is_original": bool(row[3]),
                "card_count": card_count,
                "node_count": node_count,
                "has_cards": isinstance(
                    (raw_payload or {}).get("cards")
                    if isinstance(raw_payload, dict)
                    else None,
                    list,
                ),
            }
        )
    conn.close()
    return rows


def get_layout_snapshot(digest_id: int, snapshot_id: int) -> dict | None:
    conn = _connect()
    c = conn.cursor()
    c.execute(
        """
        SELECT id, digest_id, name, layout_json, created_at, COALESCE(is_original, 0)
        FROM layout_snapshots
        WHERE id = ? AND digest_id = ?
        """,
        (snapshot_id, digest_id),
    )
    row = c.fetchone()
    conn.close()
    if not row:
        return None
    raw_payload = _parse_layout_json(row[3])
    if raw_payload is None:
        raw_payload = []
    layout, cards = _unpack_snapshot_payload(raw_payload)
    if layout is None:
        layout = []
    return {
        "id": row[0],
        "digest_id": row[1],
        "name": row[2],
        "layout": layout,
        "cards": cards,
        "created_at": row[4],
        "is_original": bool(row[5]),
    }


def refresh_original_layout_snapshot(
    digest_id: int,
    layout: Any,
    *,
    cards: list | None = None,
) -> dict | None:
    if not layout:
        return None

    ensure_original_layout_snapshot(digest_id, layout, cards=cards)
    payload = _pack_snapshot_payload(layout, cards)

    conn = _connect()
    c = conn.cursor()
    c.execute(
        """
        UPDATE layout_snapshots
        SET layout_json = ?, created_at = datetime('now')
        WHERE digest_id = ? AND COALESCE(is_original, 0) = 1
        """,
        (json.dumps(payload, ensure_ascii=False), digest_id),
    )
    if c.rowcount == 0:
        conn.close()
        return create_layout_snapshot(
            digest_id,
            ORIGINAL_SNAPSHOT_NAME,
            layout,
            is_original=True,
            cards=cards,
        )

    c.execute(
        """
        SELECT id, name, created_at, COALESCE(is_original, 0)
        FROM layout_snapshots
        WHERE digest_id = ? AND COALESCE(is_original, 0) = 1
        LIMIT 1
        """,
        (digest_id,),
    )
    row = c.fetchone()
    conn.commit()
    conn.close()
    if not row:
        return None
    return {
        "id": row[0],
        "digest_id": digest_id,
        "name": row[1],
        "layout": layout,
        "cards": cards,
        "created_at": row[2],
        "is_original": bool(row[3]),
    }


def create_layout_snapshot(
    digest_id: int,
    name: str,
    layout: Any,
    *,
    is_original: bool = False,
    cards: list | None = None,
) -> dict:
    payload = _pack_snapshot_payload(layout, cards)
    conn = _connect()
    c = conn.cursor()
    c.execute(
        """
        INSERT INTO layout_snapshots (digest_id, name, layout_json, is_original)
        VALUES (?, ?, ?, ?)
        """,
        (
            digest_id,
            name,
            json.dumps(payload, ensure_ascii=False),
            1 if is_original else 0,
        ),
    )
    snapshot_id = c.lastrowid
    c.execute(
        "SELECT created_at FROM layout_snapshots WHERE id = ?",
        (snapshot_id,),
    )
    created_at = c.fetchone()[0]
    conn.commit()
    conn.close()
    return {
        "id": snapshot_id,
        "digest_id": digest_id,
        "name": name,
        "layout": layout,
        "cards": cards,
        "created_at": created_at,
        "is_original": is_original,
    }


def delete_layout_snapshot(digest_id: int, snapshot_id: int) -> bool:
    snapshot = get_layout_snapshot(digest_id, snapshot_id)
    if not snapshot or snapshot.get("is_original"):
        return False

    conn = _connect()
    c = conn.cursor()
    c.execute(
        """
        DELETE FROM layout_snapshots
        WHERE id = ? AND digest_id = ? AND COALESCE(is_original, 0) = 0
        """,
        (snapshot_id, digest_id),
    )
    deleted = c.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


def restore_layout_snapshot(digest_id: int, snapshot_id: int) -> dict | None:
    snapshot = get_layout_snapshot(digest_id, snapshot_id)
    if not snapshot:
        return None
    save_digest_grid_layout(digest_id, snapshot["layout"])
    return snapshot

# [중요!] 내 데이터만 가져오기
def get_my_digests(userid):
    conn = _connect()
    c = conn.cursor()
    c.execute("SELECT id, filename, content FROM digests WHERE userid = ? ORDER BY id DESC", (userid,))
    data = c.fetchall()
    conn.close()
    return data

# [중요!] 내 데이터 안에서 검색하기
def search_my_digests(userid, keyword):
    conn = _connect()
    c = conn.cursor()
    query = "SELECT id, filename, content FROM digests WHERE userid = ? AND (filename LIKE ? OR content LIKE ?) ORDER BY id DESC"
    c.execute(query, (userid, f'%{keyword}%', f'%{keyword}%'))
    data = c.fetchall()
    conn.close()
    return data

# 이름 변경
def update_filename(userid, old_name, new_name):
    conn = _connect()
    c = conn.cursor()
    c.execute("UPDATE digests SET filename = ? WHERE userid = ? AND filename = ?", (new_name, userid, old_name))
    conn.commit()
    conn.close()

# 문서 삭제 (파일명 기준)
def delete_digest(userid, filename):
    conn = _connect()
    c = conn.cursor()
    c.execute("SELECT id FROM digests WHERE userid = ? AND filename = ?", (userid, filename))
    row = c.fetchone()
    if row:
        c.execute("DELETE FROM annotations WHERE digest_id = ?", (row[0],))
        c.execute("DELETE FROM notes WHERE digest_id = ?", (row[0],))
        c.execute("DELETE FROM chat_history WHERE digest_id = ?", (row[0],))
        c.execute("DELETE FROM digest_pages WHERE digest_id = ?", (row[0],))
        c.execute("DELETE FROM digest_grid_layouts WHERE digest_id = ?", (row[0],))
        c.execute("DELETE FROM layout_snapshots WHERE digest_id = ?", (row[0],))
    c.execute("DELETE FROM digests WHERE userid = ? AND filename = ?", (userid, filename))
    conn.commit()
    conn.close()


def delete_digest_by_id(userid, digest_id):
    conn = _connect()
    c = conn.cursor()
    c.execute(
        "SELECT id FROM digests WHERE id = ? AND userid = ?",
        (digest_id, userid),
    )
    row = c.fetchone()
    if not row:
        conn.close()
        return False
    c.execute("DELETE FROM annotations WHERE digest_id = ?", (digest_id,))
    c.execute("DELETE FROM notes WHERE digest_id = ?", (digest_id,))
    c.execute("DELETE FROM chat_history WHERE digest_id = ?", (digest_id,))
    c.execute("DELETE FROM digest_pages WHERE digest_id = ?", (digest_id,))
    c.execute("DELETE FROM digest_grid_layouts WHERE digest_id = ?", (digest_id,))
    c.execute("DELETE FROM layout_snapshots WHERE digest_id = ?", (digest_id,))
    c.execute("DELETE FROM digests WHERE id = ? AND userid = ?", (digest_id, userid))
    conn.commit()
    conn.close()
    return True

# 문장별 주석 저장 (동일 문장이면 갱신)
def save_comment(digest_id, sentence_idx, comment):
    conn = _connect()
    c = conn.cursor()
    c.execute(
        "SELECT id FROM annotations WHERE digest_id = ? AND sentence_idx = ?",
        (digest_id, sentence_idx),
    )
    row = c.fetchone()
    if row:
        c.execute("UPDATE annotations SET comment = ? WHERE id = ?", (comment, row[0]))
    else:
        c.execute(
            "INSERT INTO annotations (digest_id, sentence_idx, comment) VALUES (?, ?, ?)",
            (digest_id, sentence_idx, comment),
        )
    conn.commit()
    conn.close()


def save_selection_comment(digest_id, selected_text, comment, page_number=1):
    conn = _connect()
    c = conn.cursor()
    c.execute(
        """
        INSERT INTO annotations (digest_id, sentence_idx, selected_text, comment, page_number)
        VALUES (?, NULL, ?, ?, ?)
        """,
        (digest_id, selected_text, comment, page_number),
    )
    conn.commit()
    conn.close()

# 문장별 주석 삭제
def delete_comment(digest_id, sentence_idx):
    conn = _connect()
    c = conn.cursor()
    c.execute(
        "DELETE FROM annotations WHERE digest_id = ? AND sentence_idx = ?",
        (digest_id, sentence_idx),
    )
    conn.commit()
    conn.close()

# 문서별 주석 목록 조회
def get_comments(digest_id):
    conn = _connect()
    c = conn.cursor()
    c.execute(
        "SELECT sentence_idx, comment FROM annotations WHERE digest_id = ?",
        (digest_id,),
    )
    rows = c.fetchall()
    conn.close()
    return {idx: comment for idx, comment in rows}


def get_digest_by_filename(userid: str, filename: str):
    conn = _connect()
    c = conn.cursor()
    c.execute(
        """
        SELECT id, filename, content
        FROM digests
        WHERE userid = ? AND filename = ?
        ORDER BY id DESC
        LIMIT 1
        """,
        (userid, filename),
    )
    row = c.fetchone()
    conn.close()
    if not row or not row[2] or not str(row[2]).strip():
        return None
    return {"id": row[0], "filename": row[1], "content": row[2]}


def get_digest_by_id(userid, digest_id):
    conn = _connect()
    c = conn.cursor()
    c.execute(
        "SELECT id, filename, content FROM digests WHERE id = ? AND userid = ?",
        (digest_id, userid),
    )
    row = c.fetchone()
    conn.close()
    if not row:
        return None
    return {"id": row[0], "filename": row[1], "content": row[2]}


def get_digest_by_id_for_export(digest_id: int):
    conn = _connect()
    c = conn.cursor()
    c.execute("SELECT id, filename FROM digests WHERE id = ?", (digest_id,))
    row = c.fetchone()
    conn.close()
    if not row:
        return None
    return {"id": row[0], "filename": row[1]}


def get_selection_comments(digest_id, page_number=None):
    conn = _connect()
    c = conn.cursor()
    query = """
        SELECT id, selected_text, comment, page_number
        FROM annotations
        WHERE digest_id = ? AND selected_text IS NOT NULL AND TRIM(selected_text) != ''
    """
    params = [digest_id]
    if page_number is not None:
        query += " AND page_number = ?"
        params.append(page_number)
    query += " ORDER BY id ASC"
    c.execute(query, params)
    rows = c.fetchall()
    conn.close()
    return [
        {
            "id": row_id,
            "selected_text": selected_text,
            "comment": comment,
            "page_number": page_number or 1,
        }
        for row_id, selected_text, comment, page_number in rows
    ]


def update_annotation_by_id(annotation_id, comment):
    conn = _connect()
    c = conn.cursor()
    c.execute("SELECT digest_id FROM annotations WHERE id = ?", (annotation_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        return None
    digest_id = row[0]
    c.execute(
        "UPDATE annotations SET comment = ? WHERE id = ?",
        (comment, annotation_id),
    )
    conn.commit()
    conn.close()
    return digest_id


def delete_annotation_by_id(annotation_id):
    conn = _connect()
    c = conn.cursor()
    c.execute("SELECT digest_id FROM annotations WHERE id = ?", (annotation_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        return None
    digest_id = row[0]
    c.execute("DELETE FROM annotations WHERE id = ?", (annotation_id,))
    conn.commit()
    conn.close()
    return digest_id


def _split_content_to_pages(content: str, max_chars: int = 2400) -> list[str]:
    text = (content or "").strip()
    if not text:
        return [""]

    heading_parts = re.split(r"(?=^## )", text, flags=re.MULTILINE)
    heading_parts = [part.strip() for part in heading_parts if part.strip()]
    if len(heading_parts) > 1:
        return heading_parts

    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    if not paragraphs:
        return [text]

    pages: list[str] = []
    current: list[str] = []
    current_len = 0

    for paragraph in paragraphs:
        paragraph_len = len(paragraph)
        if current and current_len + paragraph_len > max_chars:
            pages.append("\n\n".join(current))
            current = [paragraph]
            current_len = paragraph_len
        else:
            current.append(paragraph)
            current_len += paragraph_len

    if current:
        pages.append("\n\n".join(current))

    return pages or [text]


def save_digest_pages(digest_id: int, pages: list[str]) -> None:
    conn = _connect()
    c = conn.cursor()
    c.execute("DELETE FROM digest_pages WHERE digest_id = ?", (digest_id,))
    for index, page_content in enumerate(pages, start=1):
        c.execute(
            """
            INSERT INTO digest_pages (digest_id, page_number, content)
            VALUES (?, ?, ?)
            """,
            (digest_id, index, page_content),
        )
    conn.commit()
    conn.close()


def get_digest_page_count(digest_id: int) -> int:
    conn = _connect()
    c = conn.cursor()
    c.execute(
        "SELECT COUNT(*) FROM digest_pages WHERE digest_id = ?",
        (digest_id,),
    )
    count = c.fetchone()[0]
    conn.close()
    return count


def get_digest_content_by_id(digest_id: int) -> str | None:
    conn = _connect()
    c = conn.cursor()
    c.execute("SELECT content FROM digests WHERE id = ?", (digest_id,))
    row = c.fetchone()
    conn.close()
    if not row:
        return None
    return row[0]


def ensure_digest_pages(digest_id: int) -> int:
    count = get_digest_page_count(digest_id)
    if count > 0:
        return count

    content = get_digest_content_by_id(digest_id)
    if content is None:
        return 0

    from summary_cards import parse_digest_content

    parsed = parse_digest_content(content)
    pages = _split_content_to_pages(parsed["markdown"] or content)
    save_digest_pages(digest_id, pages)
    return len(pages)


def get_digest_pages_meta(digest_id: int) -> dict:
    ensure_digest_pages(digest_id)
    conn = _connect()
    c = conn.cursor()
    c.execute(
        """
        SELECT page_number, LENGTH(content) AS content_length
        FROM digest_pages
        WHERE digest_id = ?
        ORDER BY page_number ASC
        """,
        (digest_id,),
    )
    rows = c.fetchall()
    conn.close()
    pages = [
        {"page_number": page_number, "content_length": content_length}
        for page_number, content_length in rows
    ]
    return {"total_pages": len(pages), "pages": pages}


def _parse_split_points_json(raw: str | None) -> list[dict]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []

    points: list[dict] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        anchor = str(item.get("anchor") or "").strip()
        try:
            block_index = int(item.get("block_index", -1))
        except (TypeError, ValueError):
            block_index = -1
        if not anchor and block_index < 0:
            continue
        points.append({"anchor": anchor, "block_index": block_index})
    return points


def _serialize_split_points(split_points: list[dict] | None) -> str | None:
    if not split_points:
        return None
    cleaned: list[dict] = []
    for item in split_points:
        if not isinstance(item, dict):
            continue
        anchor = str(item.get("anchor") or "").strip()
        try:
            block_index = int(item.get("block_index", -1))
        except (TypeError, ValueError):
            block_index = -1
        if not anchor and block_index < 0:
            continue
        cleaned.append({"anchor": anchor, "block_index": block_index})
    if not cleaned:
        return None
    return json.dumps(cleaned, ensure_ascii=False)


def list_digest_page_contents(digest_id: int) -> list[dict]:
    ensure_digest_pages(digest_id)
    conn = _connect()
    c = conn.cursor()
    c.execute(
        """
        SELECT page_number, content
        FROM digest_pages
        WHERE digest_id = ?
        ORDER BY page_number ASC
        """,
        (digest_id,),
    )
    rows = c.fetchall()
    conn.close()
    return [
        {"page_number": page_number, "content": content or ""}
        for page_number, content in rows
    ]


def get_digest_page(digest_id: int, page_number: int) -> dict | None:
    ensure_digest_pages(digest_id)
    conn = _connect()
    c = conn.cursor()
    c.execute(
        """
        SELECT page_number, content, split_points_json
        FROM digest_pages
        WHERE digest_id = ? AND page_number = ?
        """,
        (digest_id, page_number),
    )
    row = c.fetchone()
    conn.close()
    if not row:
        return None
    return {
        "page_number": row[0],
        "content": row[1],
        "split_points": _parse_split_points_json(row[2]),
    }


def log_usage(user_id: str, tokens_used: int = 0, usage_date: str | None = None) -> None:
    from datetime import date

    log_date = usage_date or date.today().isoformat()
    conn = _connect()
    c = conn.cursor()
    c.execute(
        """
        INSERT INTO usage_log (date, user_id, tokens_used)
        VALUES (?, ?, ?)
        """,
        (log_date, user_id, max(0, int(tokens_used))),
    )
    conn.commit()
    conn.close()


def get_usage_summary(user_id: str, usage_date: str) -> dict[str, int]:
    conn = _connect()
    c = conn.cursor()
    c.execute(
        """
        SELECT COUNT(*), COALESCE(SUM(tokens_used), 0)
        FROM usage_log
        WHERE user_id = ? AND date = ?
        """,
        (user_id, usage_date),
    )
    row = c.fetchone()
    conn.close()
    return {
        "call_count": int(row[0] or 0),
        "tokens_used": int(row[1] or 0),
    }


def save_note(digest_id: int, selected_text: str, content: str, page_number: int = 1) -> None:
    conn = _connect()
    c = conn.cursor()
    c.execute(
        """
        INSERT INTO notes (digest_id, selected_text, content, page_number)
        VALUES (?, ?, ?, ?)
        """,
        (digest_id, selected_text, content, page_number),
    )
    conn.commit()
    conn.close()


def get_notes(digest_id: int, page_number=None):
    conn = _connect()
    c = conn.cursor()
    query = """
        SELECT id, selected_text, content, page_number, created_at
        FROM notes
        WHERE digest_id = ?
    """
    params: list = [digest_id]
    if page_number is not None:
        query += " AND page_number = ?"
        params.append(page_number)
    query += " ORDER BY id ASC"
    c.execute(query, params)
    rows = c.fetchall()
    conn.close()
    return [
        {
            "id": row_id,
            "selected_text": selected_text or "",
            "content": content,
            "page_number": page_number or 1,
            "created_at": created_at,
        }
        for row_id, selected_text, content, page_number, created_at in rows
    ]


def update_note_by_id(note_id: int, content: str):
    conn = _connect()
    c = conn.cursor()
    c.execute("SELECT digest_id FROM notes WHERE id = ?", (note_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        return None
    digest_id = row[0]
    c.execute("UPDATE notes SET content = ? WHERE id = ?", (content, note_id))
    conn.commit()
    conn.close()
    return digest_id


def get_note_by_id(note_id: int) -> dict | None:
    conn = _connect()
    c = conn.cursor()
    c.execute(
        """
        SELECT id, digest_id, selected_text, content, page_number, created_at
        FROM notes
        WHERE id = ?
        """,
        (note_id,),
    )
    row = c.fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id": row[0],
        "digest_id": row[1],
        "selected_text": row[2] or "",
        "content": row[3],
        "page_number": row[4] or 1,
        "created_at": row[5],
    }


def delete_note_by_id(note_id: int):
    conn = _connect()
    c = conn.cursor()
    c.execute("SELECT digest_id FROM notes WHERE id = ?", (note_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        return None
    digest_id = row[0]
    c.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    conn.commit()
    conn.close()
    return digest_id


def _serialize_chat_sources(sources: list[dict] | None) -> str | None:
    if not sources:
        return None
    cleaned = []
    for item in sources:
        if not isinstance(item, dict):
            continue
        url = str(item.get("url") or "").strip()
        if not url:
            continue
        cleaned.append(
            {
                "title": str(item.get("title") or url).strip() or url,
                "url": url,
            }
        )
    if not cleaned:
        return None
    return json.dumps(cleaned, ensure_ascii=False)


def _parse_chat_sources(raw: str | None) -> list[dict]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []

    sources = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        url = str(item.get("url") or "").strip()
        if not url:
            continue
        sources.append(
            {
                "title": str(item.get("title") or url).strip() or url,
                "url": url,
            }
        )
    return sources


def save_chat_exchange(
    digest_id: int,
    question: str,
    answer: str,
    selected_text: str = "",
    page_number: int = 1,
    sources: list[dict] | None = None,
    verified: bool = False,
) -> int:
    conn = _connect()
    c = conn.cursor()
    c.execute(
        """
        INSERT INTO chat_history
            (digest_id, page_number, selected_text, question, answer, sources_json, is_verified)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            digest_id,
            page_number,
            selected_text,
            question,
            answer,
            _serialize_chat_sources(sources),
            1 if verified else 0,
        ),
    )
    chat_id = c.lastrowid
    conn.commit()
    conn.close()
    return chat_id


def get_chat_history(digest_id: int, page_number=None):
    conn = _connect()
    c = conn.cursor()
    query = """
        SELECT id, selected_text, question, answer, page_number, created_at,
               sources_json, is_verified
        FROM chat_history
        WHERE digest_id = ?
    """
    params: list = [digest_id]
    if page_number is not None:
        query += " AND page_number = ?"
        params.append(page_number)
    query += " ORDER BY id ASC"
    c.execute(query, params)
    rows = c.fetchall()
    conn.close()
    return [
        {
            "id": row_id,
            "selected_text": selected_text or "",
            "question": question,
            "answer": answer or "",
            "page_number": page_number or 1,
            "created_at": created_at,
            "sources": _parse_chat_sources(sources_json),
            "is_verified": bool(is_verified),
        }
        for (
            row_id,
            selected_text,
            question,
            answer,
            page_number,
            created_at,
            sources_json,
            is_verified,
        ) in rows
    ]


def get_chat_by_id(chat_id: int) -> dict | None:
    conn = _connect()
    c = conn.cursor()
    c.execute(
        """
        SELECT id, digest_id, selected_text, question, answer, page_number, created_at,
               sources_json, is_verified
        FROM chat_history
        WHERE id = ?
        """,
        (chat_id,),
    )
    row = c.fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id": row[0],
        "digest_id": row[1],
        "selected_text": row[2] or "",
        "question": row[3],
        "answer": row[4] or "",
        "page_number": row[5] or 1,
        "created_at": row[6],
        "sources": _parse_chat_sources(row[7]),
        "is_verified": bool(row[8]),
    }


def update_digest_content(digest_id: int, content: str) -> None:
    conn = _connect()
    c = conn.cursor()
    c.execute(
        "UPDATE digests SET content = ? WHERE id = ?",
        (content, digest_id),
    )
    conn.commit()
    conn.close()


def delete_chat_by_id(chat_id: int):
    conn = _connect()
    c = conn.cursor()
    c.execute("SELECT digest_id FROM chat_history WHERE id = ?", (chat_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        return None
    digest_id = row[0]
    c.execute("DELETE FROM chat_history WHERE id = ?", (chat_id,))
    conn.commit()
    conn.close()
    return digest_id


def update_digest_page(digest_id: int, page_number: int, content: str) -> bool:
    ensure_digest_pages(digest_id)
    conn = _connect()
    c = conn.cursor()
    c.execute(
        """
        UPDATE digest_pages
        SET content = ?
        WHERE digest_id = ? AND page_number = ?
        """,
        (content, digest_id, page_number),
    )
    updated = c.rowcount > 0
    conn.commit()
    conn.close()
    return updated


def update_digest_page_split_points(
    digest_id: int,
    page_number: int,
    split_points: list[dict] | None,
) -> bool:
    ensure_digest_pages(digest_id)
    conn = _connect()
    c = conn.cursor()
    c.execute(
        """
        UPDATE digest_pages
        SET split_points_json = ?
        WHERE digest_id = ? AND page_number = ?
        """,
        (_serialize_split_points(split_points), digest_id, page_number),
    )
    updated = c.rowcount > 0
    conn.commit()
    conn.close()
    return updated
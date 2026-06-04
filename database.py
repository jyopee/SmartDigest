import sqlite3

# DB 초기화: 테이블 생성 및 컬럼 확인
def init_db():
    conn = sqlite3.connect('smart_digest.db')
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
    c.execute("PRAGMA table_info(annotations)")
    columns = [row[1] for row in c.fetchall()]
    if "selected_text" not in columns:
        c.execute("ALTER TABLE annotations ADD COLUMN selected_text TEXT")
    conn.commit()
    conn.close()

# 회원가입
def add_user(userid, password):
    try:
        conn = sqlite3.connect('smart_digest.db')
        c = conn.cursor()
        c.execute("INSERT INTO users (userid, password) VALUES (?, ?)", (userid, password))
        conn.commit()
        conn.close()
        return True
    except:
        return False

# 로그인 확인
def check_user(userid, password):
    conn = sqlite3.connect('smart_digest.db')
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE userid = ? AND password = ?", (userid, password))
    user = c.fetchone()
    conn.close()
    return user is not None

# 데이터 저장 (userid 포함)
def save_digest(userid, filename, content):
    conn = sqlite3.connect('smart_digest.db')
    c = conn.cursor()
    c.execute("INSERT INTO digests (userid, filename, content) VALUES (?, ?, ?)", (userid, filename, content))
    conn.commit()
    conn.close()

# [중요!] 내 데이터만 가져오기
def get_my_digests(userid):
    conn = sqlite3.connect('smart_digest.db')
    c = conn.cursor()
    c.execute("SELECT id, filename, content FROM digests WHERE userid = ? ORDER BY id DESC", (userid,))
    data = c.fetchall()
    conn.close()
    return data

# [중요!] 내 데이터 안에서 검색하기
def search_my_digests(userid, keyword):
    conn = sqlite3.connect('smart_digest.db')
    c = conn.cursor()
    query = "SELECT id, filename, content FROM digests WHERE userid = ? AND (filename LIKE ? OR content LIKE ?) ORDER BY id DESC"
    c.execute(query, (userid, f'%{keyword}%', f'%{keyword}%'))
    data = c.fetchall()
    conn.close()
    return data

# 이름 변경
def update_filename(userid, old_name, new_name):
    conn = sqlite3.connect('smart_digest.db')
    c = conn.cursor()
    c.execute("UPDATE digests SET filename = ? WHERE userid = ? AND filename = ?", (new_name, userid, old_name))
    conn.commit()
    conn.close()

# 문서 삭제
def delete_digest(userid, filename):
    conn = sqlite3.connect('smart_digest.db')
    c = conn.cursor()
    c.execute("SELECT id FROM digests WHERE userid = ? AND filename = ?", (userid, filename))
    row = c.fetchone()
    if row:
        c.execute("DELETE FROM annotations WHERE digest_id = ?", (row[0],))
    c.execute("DELETE FROM digests WHERE userid = ? AND filename = ?", (userid, filename))
    conn.commit()
    conn.close()

# 문장별 주석 저장 (동일 문장이면 갱신)
def save_comment(digest_id, sentence_idx, comment):
    conn = sqlite3.connect('smart_digest.db')
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


def save_selection_comment(digest_id, selected_text, comment):
    conn = sqlite3.connect('smart_digest.db')
    c = conn.cursor()
    c.execute(
        """
        INSERT INTO annotations (digest_id, sentence_idx, selected_text, comment)
        VALUES (?, NULL, ?, ?)
        """,
        (digest_id, selected_text, comment),
    )
    conn.commit()
    conn.close()

# 문장별 주석 삭제
def delete_comment(digest_id, sentence_idx):
    conn = sqlite3.connect('smart_digest.db')
    c = conn.cursor()
    c.execute(
        "DELETE FROM annotations WHERE digest_id = ? AND sentence_idx = ?",
        (digest_id, sentence_idx),
    )
    conn.commit()
    conn.close()

# 문서별 주석 목록 조회
def get_comments(digest_id):
    conn = sqlite3.connect('smart_digest.db')
    c = conn.cursor()
    c.execute(
        "SELECT sentence_idx, comment FROM annotations WHERE digest_id = ?",
        (digest_id,),
    )
    rows = c.fetchall()
    conn.close()
    return {idx: comment for idx, comment in rows}


def get_selection_comments(digest_id):
    conn = sqlite3.connect('smart_digest.db')
    c = conn.cursor()
    c.execute(
        """
        SELECT id, selected_text, comment
        FROM annotations
        WHERE digest_id = ? AND selected_text IS NOT NULL AND TRIM(selected_text) != ''
        ORDER BY id ASC
        """,
        (digest_id,),
    )
    rows = c.fetchall()
    conn.close()
    return [
        {"id": row_id, "selected_text": selected_text, "comment": comment}
        for row_id, selected_text, comment in rows
    ]
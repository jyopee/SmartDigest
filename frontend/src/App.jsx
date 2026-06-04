import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import LoginForm from "./components/LoginForm";
import DigestList from "./components/DigestList";
import FileUpload from "./components/FileUpload";
import AnnotationModal from "./components/AnnotationModal";
import { fetchDigests, fetchAnnotations, saveAnnotation } from "./api";
import "./App.css";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyHighlights(markdown, annotations) {
  let result = markdown;
  for (const ann of annotations) {
    const selected = (ann.selected_text || "").trim();
    const comment = (ann.comment || "").trim();
    if (!selected || !comment) continue;

    const escaped = escapeRegExp(selected).replace(/\\ /g, "\\s+");
    const marker = `<mark class="sd-highlight" data-comment="${comment.replace(/"/g, "&quot;")}" data-id="${ann.id}">${selected}</mark>`;

    const replaced = result.replace(new RegExp(escaped), marker);
    if (replaced !== result) {
      result = replaced;
      continue;
    }
    if (result.includes(selected)) {
      result = result.replace(selected, marker);
    }
  }
  return result;
}

export default function App() {
  const [userId, setUserId] = useState(
    () => localStorage.getItem("smartdigest_user") || ""
  );
  const [digests, setDigests] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // --- 주석 상태 (App.jsx에서 통합 관리) ---
  const [annotations, setAnnotations] = useState([]);
  const [annotationModal, setAnnotationModal] = useState(null);
  const [annotationSaving, setAnnotationSaving] = useState(false);
  const documentBodyRef = useRef(null);

  const selectedDigest = digests.find((d) => d.id === selectedId);

  const loadDigests = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchDigests(userId, search);
      setDigests(data);
      if (selectedId && !data.some((d) => d.id === selectedId)) {
        setSelectedId(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId, search, selectedId]);

  const loadAnnotations = useCallback(async () => {
    if (!selectedDigest?.id) {
      setAnnotations([]);
      return;
    }
    try {
      const data = await fetchAnnotations(selectedDigest.id);
      setAnnotations(data);
    } catch (err) {
      setError(err.message);
    }
  }, [selectedDigest?.id]);

  useEffect(() => {
    loadDigests();
  }, [loadDigests]);

  useEffect(() => {
    setAnnotationModal(null);
    loadAnnotations();
  }, [loadAnnotations]);

  const highlightedContent = useMemo(() => {
    if (!selectedDigest?.content) return "";
    return applyHighlights(selectedDigest.content, annotations);
  }, [selectedDigest?.content, annotations]);

  const handleDocumentMouseUp = (event) => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() || "";
    if (!selectedText || selectedText.length < 2) return;

    const container = documentBodyRef.current;
    if (!container || !selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;

    setAnnotationModal({
      x: event.clientX,
      y: event.clientY,
      selectedText,
    });
  };

  const handleAnnotationSave = async (comment) => {
    if (!selectedDigest || !annotationModal) return;
    setAnnotationSaving(true);
    try {
      const result = await saveAnnotation(
        selectedDigest.id,
        annotationModal.selectedText,
        comment
      );
      setAnnotations(result.annotations);
      setAnnotationModal(null);
      window.getSelection()?.removeAllRanges();
    } catch (err) {
      alert(err.message);
    } finally {
      setAnnotationSaving(false);
    }
  };

  const handleLogin = (id) => {
    localStorage.setItem("smartdigest_user", id);
    setUserId(id);
  };

  const handleLogout = () => {
    localStorage.removeItem("smartdigest_user");
    setUserId("");
    setDigests([]);
    setSelectedId(null);
    setAnnotations([]);
    setAnnotationModal(null);
  };

  if (!userId) {
    return (
      <div className="auth-page">
        <LoginForm onLogin={handleLogin} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>SmartDigest</h1>
          <p>{userId}님의 지식창고</p>
          <button type="button" className="logout-btn" onClick={handleLogout}>
            로그아웃
          </button>
        </div>

        <input
          className="search-input"
          placeholder="파일명이나 내용 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {loading && <p className="sidebar-status">불러오는 중...</p>}
        {error && <p className="form-error">{error}</p>}

        <DigestList
          digests={digests}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onRefresh={loadDigests}
          userId={userId}
        />
      </aside>

      <main className="main-panel">
        {selectedDigest ? (
          <section className="document-viewer">
            <header className="viewer-header">
              <h2>{selectedDigest.filename}</h2>
              <p>텍스트를 드래그하면 커서 위치에 주석 입력창이 열립니다.</p>
            </header>

            <div
              ref={documentBodyRef}
              className="document-body"
              onMouseUp={handleDocumentMouseUp}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
              >
                {highlightedContent}
              </ReactMarkdown>
            </div>

            {annotationModal && (
              <AnnotationModal
                x={annotationModal.x}
                y={annotationModal.y}
                selectedText={annotationModal.selectedText}
                onClose={() => setAnnotationModal(null)}
                onSave={handleAnnotationSave}
                saving={annotationSaving}
              />
            )}
          </section>
        ) : (
          <div className="welcome-panel">
            <h2>문서를 선택하거나 새 파일을 업로드하세요</h2>
            <p>왼쪽 목록에서 문서를 고르면 요약본과 주석 기능을 사용할 수 있습니다.</p>
          </div>
        )}

        <FileUpload
          userId={userId}
          onUploaded={(digestId) => {
            loadDigests();
            setSelectedId(digestId);
          }}
        />
      </main>
    </div>
  );
}

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import LoginForm from "./components/LoginForm";
import DigestList from "./components/DigestList";
import KnowledgeUploadAccordion from "./components/KnowledgeUploadAccordion";
import SelectionActionPopup from "./components/SelectionActionPopup";
import NoteList from "./components/NoteList";
import QuestionList from "./components/QuestionList";
import NotePopup from "./components/NotePopup";
import NoteComposePopup from "./components/NoteComposePopup";
import SidebarToggle from "./components/SidebarToggle";
import PageMiniFooter from "./components/PageMiniFooter";
import ViewerExportButton from "./components/ViewerExportButton";
import TabExportButton from "./components/TabExportButton";
import LoadingSpinner from "./components/LoadingSpinner";
import { ViewerInteractionProvider } from "./contexts/ViewerInteractionContext";
import LayoutTabPopover from "./components/LayoutTabPopover";
import ReaderAlignToolbar from "./components/ReaderAlignToolbar";
import PageViewToolbar from "./components/PageViewToolbar";
import {
  LAYOUT_MODES,
  loadLayoutMode,
  saveLayoutMode,
} from "./constants/layoutModes";
import {
  loadReaderAlign,
  saveReaderAlign,
} from "./constants/readerAlign";
import SearchIcon from "./components/SearchIcon";
import UsageAccordion from "./components/UsageAccordion";
import HomeDashboard from "./components/HomeDashboard";
import AppLogo from "./components/AppLogo";
import { recordRecentDigest } from "./utils/recentDigests";
import useSummaryJob from "./hooks/useSummaryJob";
import {
  fetchDigests,
  fetchNotes,
  saveNote,
  fetchChats,
  syncUsageWithServer,
  applyQuotaExhausted,
  isRateLimitError,
  clearUsageStorage,
  getInitialUsage,
  fetchPageMeta,
  savePageContent,
  fetchPageExport,
  downloadMarkdownFile,
} from "./api";
import { addGridCardFromSource } from "./api/gridLayoutService";
import { buildSourceFocusFromCard } from "./utils/sourceNavigation";
import {
  buildReadingContext,
  restoreViewerScrollTop,
} from "./utils/readingContext";
import {
  buildChatsShareText,
  buildNotesShareText,
  buildPageShareText,
  exportElementAsImage,
  exportElementAsPdf,
  shareExportContent,
} from "./utils/exportActions";
import "./App.css";

const SummaryViewer = lazy(() => import("./components/SummaryViewer"));
const LayoutViewer = lazy(() => import("./components/LayoutViewer"));
const PageViewer = lazy(() => import("./components/PageViewer"));

const TABS = {
  FULL_VIEW: "full",
  LAYOUT_VIEW: "layout",
  PAGE_VIEW: "page",
  NOTES: "notes",
  QUESTIONS: "questions",
};

function notesForHighlights(notes) {
  return notes.map((note) => ({
    id: note.id,
    selected_text: note.selected_text,
    comment: note.content,
    page_number: note.page_number,
  }));
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

  const [notes, setNotes] = useState([]);
  const [chats, setChats] = useState([]);
  const [selectionPopup, setSelectionPopup] = useState(null);
  const [noteDraft, setNoteDraft] = useState(null);
  const [noteCompose, setNoteCompose] = useState(null);
  const [chatDraft, setChatDraft] = useState(null);
  const [chatReturnTab, setChatReturnTab] = useState(null);
  const [noteSaving, setNoteSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(TABS.FULL_VIEW);
  const [activePopup, setActivePopup] = useState(null);
  const [filterCurrentPageOnly, setFilterCurrentPageOnly] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadedPages, setLoadedPages] = useState(1);
  const [pageSaving, setPageSaving] = useState(false);
  const [pageDraft, setPageDraft] = useState({ content: "", isDirty: false });
  const [pageSaveVersion, setPageSaveVersion] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pageEditing, setPageEditing] = useState(false);
  const virtualPageSetterRef = useRef(null);
  const [virtualPageNav, setVirtualPageNav] = useState({
    current: 1,
    total: 1,
    active: false,
  });
  const [currentLayout, setCurrentLayout] = useState(LAYOUT_MODES.MINDMAP);
  const [readerAlign, setReaderAlign] = useState("left");
  const [layoutGridReloadToken, setLayoutGridReloadToken] = useState(0);
  const [layoutFocusCardId, setLayoutFocusCardId] = useState(null);
  const [addingToLayoutKey, setAddingToLayoutKey] = useState(null);
  const [sourceFocus, setSourceFocus] = useState(null);
  const [exportBusy, setExportBusy] = useState(false);
  const exportTargetRef = useRef(null);
  const [usage, setUsage] = useState(() => getInitialUsage(userId));
  const readingContextRef = useRef(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem("smartdigest_sidebar_open");
    return saved !== "false";
  });

  const selectedDigest = digests.find((d) => d.id === selectedId);
  const highlightAnnotations = useMemo(() => notesForHighlights(notes), [notes]);

  const pageNotes = useMemo(() => {
    if (!filterCurrentPageOnly) return notes;
    return notes.filter((note) => (note.page_number || 1) === currentPage);
  }, [notes, currentPage, filterCurrentPageOnly]);

  const pageChats = useMemo(() => {
    if (!filterCurrentPageOnly) return chats;
    return chats.filter((chat) => (chat.page_number || 1) === currentPage);
  }, [chats, currentPage, filterCurrentPageOnly]);

  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  const loadDigests = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchDigests(userId, search);
      setDigests(data);
      if (
        selectedIdRef.current &&
        !data.some((d) => d.id === selectedIdRef.current)
      ) {
        setSelectedId(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId, search]);

  const loadNotes = useCallback(async () => {
    if (!selectedDigest?.id) {
      setNotes([]);
      return;
    }
    try {
      const data = await fetchNotes(selectedDigest.id);
      setNotes(data);
    } catch (err) {
      setError(err.message);
    }
  }, [selectedDigest?.id]);

  const loadUsage = useCallback(async () => {
    if (!userId) {
      setUsage(null);
      return;
    }
    setUsage((prev) => prev ?? getInitialUsage(userId));
    try {
      const data = await syncUsageWithServer(userId);
      setUsage(data);
    } catch (err) {
      if (isRateLimitError(err)) {
        const exhausted = await applyQuotaExhausted(userId);
        setUsage(exhausted);
      } else {
        setError(err.message);
      }
    }
  }, [userId]);

  const handleQuotaExhausted = useCallback(async () => {
    if (!userId) return;
    const exhausted = await applyQuotaExhausted(userId);
    setUsage(exhausted);
  }, [userId]);

  const handleDigestUploaded = useCallback((digestId) => {
    loadDigests();
    setSelectedId(digestId);
  }, [loadDigests]);

  const { status: summaryStatus, isRunning: isSummarizing, runSummary } =
    useSummaryJob({
      userId,
      onUploaded: handleDigestUploaded,
      onUsageRefresh: loadUsage,
      onQuotaExhausted: handleQuotaExhausted,
    });

  const loadChats = useCallback(async () => {
    if (!selectedDigest?.id) {
      setChats([]);
      return;
    }
    try {
      const data = await fetchChats(selectedDigest.id);
      setChats(data);
    } catch (err) {
      setError(err.message);
    }
  }, [selectedDigest?.id]);

  const loadPageMeta = useCallback(async () => {
    if (!selectedDigest?.id) {
      setTotalPages(1);
      setLoadedPages(1);
      return;
    }
    try {
      const meta = await fetchPageMeta(selectedDigest.id);
      setTotalPages(meta.total_pages || 1);
      setLoadedPages(1);
    } catch (err) {
      setError(err.message);
      setTotalPages(1);
      setLoadedPages(1);
    }
  }, [selectedDigest?.id]);

  useEffect(() => {
    loadDigests();
  }, [loadDigests]);

  useEffect(() => {
    if (!userId) {
      setUsage(null);
      return;
    }
    setUsage(getInitialUsage(userId));
    loadUsage();
  }, [loadUsage, userId]);

  useEffect(() => {
    setSelectionPopup(null);
    setNoteDraft(null);
    setNoteCompose(null);
    setChatDraft(null);
    setChatReturnTab(null);
    readingContextRef.current = null;
    setActivePopup(null);
    setActiveTab(TABS.FULL_VIEW);
    setCurrentPage(1);
    setFilterCurrentPageOnly(true);
    setSearchOpen(false);
    setPageDraft({ content: "", isDirty: false });
    setPageSaveVersion(0);
    loadNotes();
    loadChats();
    loadPageMeta();
  }, [selectedDigest?.id, loadNotes, loadChats, loadPageMeta]);

  useEffect(() => {
    if (activeTab === TABS.NOTES || activeTab === TABS.QUESTIONS) {
      setSearchOpen(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== TABS.PAGE_VIEW) {
      virtualPageSetterRef.current = null;
      setVirtualPageNav({
        current: 1,
        total: 1,
        active: false,
      });
    }
  }, [activeTab]);

  useEffect(() => {
    setPageEditing(false);
  }, [selectedId, currentPage, activeTab]);

  useEffect(() => {
    if (!selectedId) return;
    setCurrentLayout(loadLayoutMode(selectedId));
    setReaderAlign(loadReaderAlign(selectedId));
  }, [selectedId]);

  useEffect(() => {
    if (!userId || !selectedId) return;
    recordRecentDigest(userId, selectedId);
  }, [userId, selectedId]);

  const handleReaderAlignChange = (align) => {
    setReaderAlign(align);
    if (selectedId) saveReaderAlign(selectedId, align);
  };

  const handleLayoutSelect = (mode) => {
    setCurrentLayout(mode);
    if (selectedId) saveLayoutMode(selectedId, mode);
  };

  const handleOpenKnowledgeCard = useCallback(({ digestId, cardId }) => {
    if (!digestId || !cardId) return;
    setSelectedId(digestId);
    setActiveTab(TABS.LAYOUT_VIEW);
    setLayoutFocusCardId(String(cardId));
  }, []);

  const handleNavigateToSource = useCallback(
    (payload) => {
      let focus =
        payload?.pageNumber !== undefined && payload?.sourceId
          ? payload
          : buildSourceFocusFromCard(payload);
      if (!focus) return;

      if (!focus.selectedText) {
        if (focus.source === "note") {
          const note = notes.find((item) => item.id === focus.sourceId);
          if (note) {
            focus = {
              ...focus,
              selectedText: note.selected_text || "",
              pageNumber: note.page_number || focus.pageNumber,
            };
          }
        } else if (focus.source === "chat") {
          const chat = chats.find((item) => item.id === focus.sourceId);
          if (chat) {
            focus = {
              ...focus,
              selectedText: chat.selected_text || "",
              pageNumber: chat.page_number || focus.pageNumber,
            };
          }
        }
      }

      setSourceFocus({ ...focus, token: Date.now() });
      setActiveTab(TABS.PAGE_VIEW);
      setCurrentPage(focus.pageNumber || 1);
    },
    [notes, chats]
  );

  const restoreReadingContext = useCallback(() => {
    const ctx = readingContextRef.current;
    if (!ctx) return false;

    setChatDraft(null);
    setChatReturnTab(null);
    setActiveTab(ctx.tab);
    if (ctx.tab === TABS.PAGE_VIEW && ctx.pageNumber) {
      setCurrentPage(ctx.pageNumber);
    }

    restoreViewerScrollTop(ctx.scrollTop);

    if (ctx.selectedText) {
      window.setTimeout(() => {
        setSourceFocus({
          selectedText: ctx.selectedText,
          pageNumber: ctx.pageNumber || 1,
          token: Date.now(),
        });
      }, 120);
    }

    return true;
  }, []);

  const handleAddToLayout = useCallback(
    async (source, sourceId) => {
      if (!selectedDigest?.id) return;
      const key = `${source}-${sourceId}`;
      setAddingToLayoutKey(key);
      try {
        await addGridCardFromSource(selectedDigest.id, source, sourceId);
        setLayoutGridReloadToken((prev) => prev + 1);
        if (!restoreReadingContext()) {
          setActiveTab(TABS.LAYOUT_VIEW);
        }
      } catch (err) {
        alert(err.message || "학습 카드를 추가하지 못했습니다.");
      } finally {
        setAddingToLayoutKey(null);
      }
    },
    [selectedDigest?.id, restoreReadingContext]
  );

  useEffect(() => {
    if (!activePopup && !selectionPopup && !noteCompose) return;
    const handleClickOutside = (event) => {
      if (
        event.target.closest(".annotation-popup") ||
        event.target.closest(".selection-action-popup") ||
        event.target.closest(".sd-highlight")
      ) {
        return;
      }
      setActivePopup(null);
      setSelectionPopup(null);
      setNoteCompose(null);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activePopup, selectionPopup, noteCompose]);

  const handleVisiblePageChange = useCallback((pageNumber) => {
    setCurrentPage(pageNumber);
  }, []);

  const handleLoadedPagesChange = useCallback((count, total) => {
    setLoadedPages(count);
    if (total) setTotalPages(total);
  }, []);

  const handlePageContentChange = useCallback(({ content, isDirty }) => {
    setPageDraft({ content, isDirty });
  }, []);

  const pageDraftRef = useRef(pageDraft);
  pageDraftRef.current = pageDraft;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const totalPagesRef = useRef(totalPages);
  totalPagesRef.current = totalPages;

  const handlePageChange = useCallback((nextPage) => {
    if (nextPage < 1 || nextPage > totalPagesRef.current) return;
    if (
      activeTabRef.current === TABS.PAGE_VIEW &&
      pageDraftRef.current.isDirty &&
      !window.confirm(
        "저장하지 않은 변경사항이 있습니다. 페이지를 이동할까요?"
      )
    ) {
      return;
    }
    setCurrentPage(nextPage);
  }, []);

  const registerVirtualPageSetter = useCallback((setter) => {
    virtualPageSetterRef.current = setter;
  }, []);

  const handleVirtualNavChange = useCallback((nav) => {
    setVirtualPageNav((prev) => {
      if (
        prev.current === nav.current &&
        prev.total === nav.total &&
        prev.active === nav.active
      ) {
        return prev;
      }
      return {
        current: nav.current,
        total: nav.total,
        active: nav.active,
      };
    });
  }, []);

  const handleFooterPageChange = useCallback(
    (nextPage) => {
      if (
        activeTab === TABS.PAGE_VIEW &&
        virtualPageNav.active &&
        virtualPageSetterRef.current
      ) {
        if (nextPage < 1 || nextPage > virtualPageNav.total) return;
        virtualPageSetterRef.current(nextPage);
        return;
      }

      handlePageChange(nextPage);
    },
    [activeTab, virtualPageNav.active, virtualPageNav.total, handlePageChange]
  );

  const footerCurrentPage =
    activeTab === TABS.PAGE_VIEW && virtualPageNav.active
      ? virtualPageNav.current
      : currentPage;

  const footerTotalPages =
    activeTab === TABS.PAGE_VIEW && virtualPageNav.active
      ? virtualPageNav.total
      : totalPages;

  const viewerDescription = {
    [TABS.FULL_VIEW]:
      "스크롤하면 다음 내용이 자동으로 로드됩니다. 검색 후 이전/다음으로 결과 위치를 이동할 수 있습니다.",
    [TABS.LAYOUT_VIEW]:
      "주석·질문을 드래그해 학습 카드로 추가하면 원문 위치로 돌아갑니다. 카드의 '원문 위치로'로 다시 이동할 수 있습니다.",
    [TABS.PAGE_VIEW]:
      "편집 후 저장하거나, 보내기/저장으로 현재 페이지를 이미지·PDF·마크다운으로 보낼 수 있습니다.",
    [TABS.NOTES]:
      "'레이아웃에 추가' 후 주석을 작성한 원문 위치로 자동 이동합니다.",
    [TABS.QUESTIONS]:
      "질문 기록을 레이아웃 학습 카드로 추가할 수 있습니다. 드래그하거나 '레이아웃에 추가'를 누르세요.",
  };

  const handlePageSave = async () => {
    if (!selectedDigest?.id) return;

    if (activeTab !== TABS.PAGE_VIEW) {
      alert("요약 편집·저장은 '페이지 보기' 탭에서 사용할 수 있습니다.");
      return;
    }

    const content = pageDraft.content.trim();
    if (!content) {
      alert("저장할 내용이 없습니다.");
      return;
    }

    setPageSaving(true);
    try {
      await savePageContent(selectedDigest.id, currentPage, content);
      setPageSaveVersion((v) => v + 1);
      alert(`페이지 ${currentPage} 요약이 저장되었습니다.`);
    } catch (err) {
      alert(err.message);
    } finally {
      setPageSaving(false);
    }
  };

  const handleExportAction = useCallback(
    async (action) => {
      if (!selectedDigest?.id) return;

      const root = exportTargetRef.current;
      const baseName =
        selectedDigest.filename?.replace(/\.[^.]+$/, "") || "smartdigest";

      setExportBusy(true);
      try {
        if (activeTab === TABS.NOTES) {
          const sharePayload = buildNotesShareText(notes, baseName);
          if (action === "share") {
            await shareExportContent(sharePayload);
          } else if (action === "image") {
            await exportElementAsImage(root, `${baseName}-notes`);
          } else if (action === "pdf") {
            await exportElementAsPdf(root, `${baseName}-notes`);
          }
          return;
        }

        if (activeTab === TABS.QUESTIONS) {
          const sharePayload = buildChatsShareText(chats, baseName);
          if (action === "share") {
            await shareExportContent(sharePayload);
          } else if (action === "image") {
            await exportElementAsImage(root, `${baseName}-questions`);
          } else if (action === "pdf") {
            await exportElementAsPdf(root, `${baseName}-questions`);
          }
          return;
        }

        if (activeTab === TABS.PAGE_VIEW) {
          const pageNumber = currentPage;
          const pageLabel = `${baseName}-page-${pageNumber}`;
          const pageBody =
            root?.querySelector?.(".page-viewer-body .document-body") ?? root;
          const draftContent = pageDraftRef.current.content;

          if (action === "share") {
            const sharePayload = buildPageShareText(
              draftContent,
              baseName,
              pageNumber
            );
            await shareExportContent(sharePayload);
            return;
          }

          if (action === "markdown") {
            if (draftContent?.trim()) {
              downloadMarkdownFile(`${pageLabel}.md`, draftContent);
              return;
            }
            const data = await fetchPageExport(selectedDigest.id, pageNumber);
            downloadMarkdownFile(data.filename, data.content);
            return;
          }

          if (action === "image") {
            await exportElementAsImage(pageBody, pageLabel);
            return;
          }

          if (action === "pdf") {
            await exportElementAsPdf(pageBody, pageLabel);
          }
          return;
        }

        if (action === "share") {
          await shareExportContent({
            title: baseName,
            text: root?.innerText?.slice(0, 8000) || "",
          });
          return;
        }

        if (action === "image") {
          await exportElementAsImage(root, baseName);
          return;
        }

        if (action === "pdf") {
          await exportElementAsPdf(root, baseName);
        }
      } catch (err) {
        alert(err.message || "보내기에 실패했습니다.");
      } finally {
        setExportBusy(false);
      }
    },
    [selectedDigest, activeTab, notes, chats, currentPage]
  );

  const handleRequestAnnotation = useCallback((payload) => {
    setActivePopup(null);
    setNoteDraft(null);
    setNoteCompose(null);
    setChatDraft(null);
    setSelectionPopup(payload);
  }, []);

  const handleHighlightClick = useCallback((payload) => {
    setSelectionPopup(null);
    setActivePopup(payload);
  }, []);

  const handleSearchClose = useCallback(() => setSearchOpen(false), []);

  const handleAddNoteFromSelection = () => {
    if (!selectionPopup) return;

    const pageNumber = selectionPopup.pageNumber || currentPage;
    const isViewerTab =
      activeTab === TABS.FULL_VIEW ||
      activeTab === TABS.PAGE_VIEW ||
      activeTab === TABS.LAYOUT_VIEW;

    if (isViewerTab) {
      setNoteCompose({
        selectedText: selectionPopup.selectedText,
        pageNumber,
        x: selectionPopup.x,
        y: selectionPopup.y,
      });
      setChatDraft(null);
      setSelectionPopup(null);
      window.getSelection()?.removeAllRanges();
      return;
    }

    setActiveTab(TABS.NOTES);
    setNoteDraft({
      selectedText: selectionPopup.selectedText,
      pageNumber,
    });
    setChatDraft(null);
    setSelectionPopup(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleAskAiFromSelection = () => {
    if (!selectionPopup) return;
    const originTab =
      activeTab === TABS.FULL_VIEW || activeTab === TABS.PAGE_VIEW
        ? activeTab
        : TABS.FULL_VIEW;
    const pageNumber = selectionPopup.pageNumber || currentPage;
    readingContextRef.current = buildReadingContext({
      tab: originTab,
      pageNumber,
      selectedText: selectionPopup.selectedText,
    });
    setChatReturnTab(originTab);
    setActiveTab(TABS.QUESTIONS);
    setChatDraft({
      selectedText: selectionPopup.selectedText,
      pageNumber,
    });
    setNoteDraft(null);
    setSelectionPopup(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleChatDraftCancel = () => {
    restoreReadingContext();
  };

  const handleChatAskComplete = () => {
    restoreReadingContext();
  };

  const handleNoteDraftSave = async (content) => {
    if (!selectedDigest || !noteDraft) return;
    setNoteSaving(true);
    try {
      const result = await saveNote(
        selectedDigest.id,
        noteDraft.selectedText,
        content,
        noteDraft.pageNumber || currentPage
      );
      setNotes(result.notes);
      setNoteDraft(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setNoteSaving(false);
    }
  };

  const handleNoteComposeSave = async (content) => {
    if (!selectedDigest || !noteCompose) return;
    setNoteSaving(true);
    try {
      const result = await saveNote(
        selectedDigest.id,
        noteCompose.selectedText,
        content,
        noteCompose.pageNumber || currentPage
      );
      setNotes(result.notes);
      setNoteCompose(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setNoteSaving(false);
    }
  };

  const handleLogin = (id) => {
    localStorage.setItem("smartdigest_user", id);
    setUserId(id);
  };

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem("smartdigest_sidebar_open", String(next));
      return next;
    });
  }, []);

  const handleLogout = () => {
    clearUsageStorage(userId);
    localStorage.removeItem("smartdigest_user");
    setUserId("");
    setUsage(null);
    setDigests([]);
    setSelectedId(null);
    setNotes([]);
    setChats([]);
    setSelectionPopup(null);
    setNoteDraft(null);
    setChatDraft(null);
    setChatReturnTab(null);
    readingContextRef.current = null;
    setCurrentPage(1);
    setTotalPages(1);
    setLoadedPages(1);
  };

  if (!userId) {
    return (
      <div className="auth-page">
        <LoginForm onLogin={handleLogin} />
      </div>
    );
  }

  const knowledgeUpload = (
    <KnowledgeUploadAccordion
      usage={usage}
      summaryStatus={summaryStatus}
      isSummarizing={isSummarizing}
      onSummarize={runSummary}
    />
  );

  const usageAccordion = <UsageAccordion usage={usage} />;

  return (
    <div
      className={`app-shell${sidebarOpen ? "" : " app-shell--sidebar-collapsed"}`}
    >
      <SidebarToggle open={sidebarOpen} onToggle={handleToggleSidebar} />

      <aside className="sidebar" aria-hidden={!sidebarOpen}>
        <div className="sidebar-sticky-top">
          <div className="sidebar-header">
            <div className="sidebar-brand">
              <AppLogo size={36} variant="mark" className="sidebar-brand-logo" />
              <div className="sidebar-brand-copy">
                <h1>SmartDigest</h1>
                <p>{userId}님의 지식창고</p>
              </div>
            </div>
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
        </div>

        <div className="sidebar-scroll-body">
          <DigestList
            digests={digests}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRefresh={loadDigests}
            userId={userId}
          />
        </div>
      </aside>

      <main
        className={`main-panel${selectedDigest ? " main-panel--viewer" : " main-panel--empty"}`}
      >
        {selectedDigest ? (
        <>
        <div className="dashboard-stack dashboard-stack--persistent dashboard-stack--viewer">
          {usageAccordion}
          {knowledgeUpload}
        </div>
        <div className="main-panel-body">
          <section className="document-viewer">
            <div className="viewer-sticky-top">
              <div className="viewer-header-row">
                <header className="viewer-header">
                  <h2>{selectedDigest.filename}</h2>
                  <p>{viewerDescription[activeTab]}</p>
                </header>

                <div className="viewer-header-actions">
                  {activeTab === TABS.PAGE_VIEW && (
                    <>
                      <PageViewToolbar
                        isDirty={pageDraft.isDirty}
                        isEditing={pageEditing}
                        onToggleEdit={() => setPageEditing((prev) => !prev)}
                        onSave={handlePageSave}
                        saving={pageSaving}
                      />
                      <ViewerExportButton
                        onExportSelect={handleExportAction}
                        busy={exportBusy}
                        includeMarkdown
                      />
                    </>
                  )}
                  {(activeTab === TABS.FULL_VIEW ||
                    activeTab === TABS.LAYOUT_VIEW) && (
                    <ViewerExportButton
                      onExportSelect={handleExportAction}
                      busy={exportBusy}
                    />
                  )}
                </div>
              </div>

              <div className="viewer-tabs">
                <div className="viewer-tabs-list" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === TABS.FULL_VIEW}
                    className={activeTab === TABS.FULL_VIEW ? "active" : ""}
                    onClick={() => setActiveTab(TABS.FULL_VIEW)}
                  >
                    전체 보기
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === TABS.PAGE_VIEW}
                    className={activeTab === TABS.PAGE_VIEW ? "active" : ""}
                    onClick={() => setActiveTab(TABS.PAGE_VIEW)}
                  >
                    페이지 보기
                  </button>
                  <LayoutTabPopover
                    isActive={activeTab === TABS.LAYOUT_VIEW}
                    currentLayout={currentLayout}
                    onLayoutSelect={handleLayoutSelect}
                    onTabClick={() => setActiveTab(TABS.LAYOUT_VIEW)}
                  />
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === TABS.NOTES}
                    className={activeTab === TABS.NOTES ? "active" : ""}
                    onClick={() => setActiveTab(TABS.NOTES)}
                  >
                    주석 목록
                    {notes.length > 0 && (
                      <span className="tab-badge">{notes.length}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === TABS.QUESTIONS}
                    className={activeTab === TABS.QUESTIONS ? "active" : ""}
                    onClick={() => setActiveTab(TABS.QUESTIONS)}
                  >
                    질문 목록
                    {chats.length > 0 && (
                      <span className="tab-badge">{chats.length}</span>
                    )}
                  </button>
                </div>

                <div className="viewer-tabs-actions">
                  {(activeTab === TABS.NOTES ||
                    activeTab === TABS.QUESTIONS) && (
                    <TabExportButton
                      onExportSelect={handleExportAction}
                      busy={exportBusy}
                    />
                  )}
                  {(activeTab === TABS.FULL_VIEW ||
                    activeTab === TABS.LAYOUT_VIEW ||
                    activeTab === TABS.PAGE_VIEW) && (
                    <button
                      type="button"
                      className={`viewer-search-toggle${searchOpen ? " active" : ""}`}
                      onClick={() => setSearchOpen((open) => !open)}
                      aria-label={searchOpen ? "검색 닫기" : "검색 열기"}
                      aria-expanded={searchOpen}
                    >
                      <SearchIcon />
                    </button>
                  )}
                </div>
              </div>

              <div id="viewer-search-anchor" className="viewer-search-slot" />
            </div>

            <div className="viewer-scroll-body">
            <ViewerInteractionProvider
              onRequestAnnotation={handleRequestAnnotation}
              onHighlightClick={handleHighlightClick}
            >
              <div
                ref={exportTargetRef}
                className={`viewer-tab-panel${
                  activeTab === TABS.PAGE_VIEW ? " viewer-tab-panel--page" : ""
                }${
                  activeTab === TABS.FULL_VIEW ||
                  activeTab === TABS.PAGE_VIEW ||
                  activeTab === TABS.LAYOUT_VIEW
                    ? " viewer-tab-panel--reader"
                    : ""
                }`}
              >
                {(activeTab === TABS.FULL_VIEW ||
                  activeTab === TABS.PAGE_VIEW ||
                  activeTab === TABS.LAYOUT_VIEW) && (
                  <div className="viewer-reader-toolbar">
                    <ReaderAlignToolbar
                      value={readerAlign}
                      onChange={handleReaderAlignChange}
                    />
                  </div>
                )}

                <Suspense
                  fallback={
                    <LoadingSpinner label="뷰어를 불러오는 중..." />
                  }
                >
                  {activeTab === TABS.FULL_VIEW && (
                    <SummaryViewer
                      digestId={selectedDigest.id}
                      annotations={highlightAnnotations}
                      searchOpen={searchOpen}
                      onSearchClose={handleSearchClose}
                      onVisiblePageChange={handleVisiblePageChange}
                      onLoadedPagesChange={handleLoadedPagesChange}
                      textAlign={readerAlign}
                      sourceFocus={sourceFocus}
                    />
                  )}

                  {activeTab === TABS.LAYOUT_VIEW && (
                    <LayoutViewer
                      digestId={selectedDigest.id}
                      layoutMode={currentLayout}
                      notes={notes}
                      chats={chats}
                      layoutReloadToken={layoutGridReloadToken}
                      onLayoutReload={() =>
                        setLayoutGridReloadToken((prev) => prev + 1)
                      }
                      onAddToLayout={handleAddToLayout}
                      addingToLayoutKey={addingToLayoutKey}
                      onNavigateToSource={handleNavigateToSource}
                      annotations={highlightAnnotations}
                      searchOpen={searchOpen}
                      onSearchClose={handleSearchClose}
                      textAlign={readerAlign}
                      focusCardId={layoutFocusCardId}
                      onFocusCardClear={() => setLayoutFocusCardId(null)}
                    />
                  )}

                  {activeTab === TABS.PAGE_VIEW && (
                    <PageViewer
                      digestId={selectedDigest.id}
                      pageNumber={currentPage}
                      totalPages={totalPages}
                      annotations={highlightAnnotations}
                      searchOpen={searchOpen}
                      onSearchClose={handleSearchClose}
                      onPageChange={handlePageChange}
                      onContentChange={handlePageContentChange}
                      saveVersion={pageSaveVersion}
                      isEditing={pageEditing}
                      onEditingChange={setPageEditing}
                      onVirtualNavChange={handleVirtualNavChange}
                      onVirtualNavSetter={registerVirtualPageSetter}
                      textAlign={readerAlign}
                      sourceFocus={sourceFocus}
                    />
                  )}
                </Suspense>

                {activeTab === TABS.NOTES && (
                  <>
                    <label className="annotation-filter-toggle">
                      <input
                        type="checkbox"
                        checked={filterCurrentPageOnly}
                        onChange={(e) =>
                          setFilterCurrentPageOnly(e.target.checked)
                        }
                      />
                      현재 보고 있는 페이지의 주석만 보기 (페이지 {currentPage})
                    </label>
                    <NoteList
                      notes={pageNotes}
                      onChange={setNotes}
                      showPageBadge={!filterCurrentPageOnly}
                      draft={noteDraft}
                      onDraftConsumed={() => setNoteDraft(null)}
                      onSaveDraft={handleNoteDraftSave}
                      saving={noteSaving}
                      onAddToLayout={handleAddToLayout}
                      addingToLayoutKey={addingToLayoutKey}
                    />
                  </>
                )}

                {activeTab === TABS.QUESTIONS && (
                  <>
                    <label className="annotation-filter-toggle">
                      <input
                        type="checkbox"
                        checked={filterCurrentPageOnly}
                        onChange={(e) =>
                          setFilterCurrentPageOnly(e.target.checked)
                        }
                      />
                      현재 보고 있는 페이지의 질문만 보기 (페이지 {currentPage})
                    </label>
                    <QuestionList
                      digestId={selectedDigest.id}
                      userId={userId}
                      chats={pageChats}
                      onChange={setChats}
                      onUsageRefresh={loadUsage}
                      onQuotaExhausted={handleQuotaExhausted}
                      showPageBadge={!filterCurrentPageOnly}
                      draft={chatDraft}
                      onDraftCancel={handleChatDraftCancel}
                      onAskComplete={handleChatAskComplete}
                      onAddToLayout={handleAddToLayout}
                      addingToLayoutKey={addingToLayoutKey}
                    />
                  </>
                )}
              </div>
            </ViewerInteractionProvider>

            {activeTab === TABS.PAGE_VIEW && (
              <PageMiniFooter
                currentPage={footerCurrentPage}
                totalPages={footerTotalPages}
                onPageChange={handleFooterPageChange}
              />
            )}
            </div>

            {activePopup && (
              <NotePopup
                note={{
                  id: activePopup.annotation.id,
                  selected_text: activePopup.annotation.selected_text,
                  content: activePopup.annotation.comment,
                }}
                x={activePopup.x}
                y={activePopup.y}
                onClose={() => setActivePopup(null)}
                onChange={setNotes}
              />
            )}

            {noteCompose && (
              <NoteComposePopup
                selectedText={noteCompose.selectedText}
                x={noteCompose.x}
                y={noteCompose.y}
                saving={noteSaving}
                onSave={handleNoteComposeSave}
                onClose={() => setNoteCompose(null)}
              />
            )}

            {selectionPopup && (
              <SelectionActionPopup
                x={selectionPopup.x}
                y={selectionPopup.y}
                selectedText={selectionPopup.selectedText}
                onAddNote={handleAddNoteFromSelection}
                onAskAi={handleAskAiFromSelection}
                onClose={() => setSelectionPopup(null)}
              />
            )}
          </section>
        </div>
        </>
        ) : (
          <div className="dashboard-center-shell">
            <div className="dashboard-stack dashboard-stack--persistent">
              {usageAccordion}
              {knowledgeUpload}
            </div>
            <HomeDashboard
              digests={digests}
              usage={usage}
              userId={userId}
              onSelectDigest={setSelectedId}
              onOpenKnowledgeCard={handleOpenKnowledgeCard}
            />
          </div>
        )}
      </main>
    </div>
  );
}

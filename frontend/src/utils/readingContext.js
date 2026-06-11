export function captureViewerScrollTop() {
  const el = document.querySelector(".viewer-scroll-body");
  return el?.scrollTop ?? 0;
}

export function restoreViewerScrollTop(scrollTop) {
  if (!scrollTop) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const el = document.querySelector(".viewer-scroll-body");
      if (el) el.scrollTop = scrollTop;
    });
  });
}

export function buildReadingContext({ tab, pageNumber, selectedText, scrollTop }) {
  return {
    tab,
    pageNumber: pageNumber || 1,
    selectedText: selectedText || "",
    scrollTop: scrollTop ?? captureViewerScrollTop(),
  };
}

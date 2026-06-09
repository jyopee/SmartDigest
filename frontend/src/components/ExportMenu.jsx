import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

const BASE_MENU_ITEMS = [
  { id: "image", label: "이미지 저장" },
  { id: "pdf", label: "PDF 저장" },
  { id: "share", label: "공유하기" },
];

const MARKDOWN_MENU_ITEM = { id: "markdown", label: "마크다운 저장" };

export default function ExportMenu({
  open,
  onClose,
  onSelect,
  anchor = "fab",
  busy = false,
  includeMarkdown = false,
}) {
  const menuItems = includeMarkdown
    ? [...BASE_MENU_ITEMS, MARKDOWN_MENU_ITEM]
    : BASE_MENU_ITEMS;
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      onClose?.();
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={menuRef}
          className={`export-menu export-menu--${anchor}`}
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          role="menu"
          aria-label="보내기 옵션"
        >
          {menuItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="export-menu-item"
              role="menuitem"
              disabled={busy}
              onClick={() => onSelect?.(item.id)}
            >
              {item.label}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

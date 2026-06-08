import { useState } from "react";
import ExportIcon from "./ExportIcon";
import ExportMenu from "./ExportMenu";

export default function TabExportButton({ onExportSelect, busy = false }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSelect = (action) => {
    onExportSelect?.(action);
    setMenuOpen(false);
  };

  return (
    <div className="tab-export-wrap">
      <button
        type="button"
        className={`tab-export-btn${menuOpen ? " active" : ""}`}
        onClick={() => setMenuOpen((open) => !open)}
        aria-label="보내기"
        aria-expanded={menuOpen}
        title="보내기"
      >
        <ExportIcon />
      </button>

      <ExportMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSelect={handleSelect}
        anchor="tab"
        busy={busy}
      />
    </div>
  );
}

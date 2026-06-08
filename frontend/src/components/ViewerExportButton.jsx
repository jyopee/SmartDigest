import { useState } from "react";
import ExportIcon from "./ExportIcon";
import ExportMenu from "./ExportMenu";

export default function ViewerExportButton({ onExportSelect, busy = false }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSelect = (action) => {
    onExportSelect?.(action);
    setMenuOpen(false);
  };

  return (
    <div className="viewer-export-wrap">
      <button
        type="button"
        className={`viewer-action-pill viewer-action-pill--export${
          menuOpen ? " is-active" : ""
        }`}
        aria-label="보내기/저장"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <ExportIcon />
        <span>보내기/저장</span>
      </button>

      <ExportMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSelect={handleSelect}
        anchor="header"
        busy={busy}
      />
    </div>
  );
}

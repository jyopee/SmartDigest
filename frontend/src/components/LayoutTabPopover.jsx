import { useCallback, useRef, useState } from "react";
import { LAYOUT_OPTIONS } from "../constants/layoutModes";

function LayoutOptionIcon({ type }) {
  if (type === "grid") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="8" height="8" rx="1.5" />
        <rect x="13" y="3" width="8" height="8" rx="1.5" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" />
        <rect x="13" y="13" width="8" height="8" rx="1.5" />
      </svg>
    );
  }
  if (type === "split") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4" width="8" height="16" rx="1.5" />
        <rect x="13" y="4" width="8" height="16" rx="1.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="3" rx="1.5" />
      <rect x="4" y="10.5" width="16" height="3" rx="1.5" />
      <rect x="4" y="16" width="16" height="3" rx="1.5" />
    </svg>
  );
}

const HIDE_DELAY_MS = 220;

export default function LayoutTabPopover({
  isActive,
  currentLayout,
  onLayoutSelect,
  onTabClick,
}) {
  const [open, setOpen] = useState(false);
  const hideTimerRef = useRef(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const showPopover = useCallback(() => {
    clearHideTimer();
    setOpen(true);
  }, [clearHideTimer]);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setOpen(false);
    }, HIDE_DELAY_MS);
  }, [clearHideTimer]);

  const handleSelect = (mode) => {
    onLayoutSelect(mode);
    onTabClick();
    setOpen(false);
  };

  return (
    <div
      className="layout-tab-trigger"
      onMouseEnter={showPopover}
      onMouseLeave={scheduleHide}
    >
      <button
        type="button"
        role="tab"
        aria-selected={isActive}
        aria-haspopup="true"
        aria-expanded={open}
        className={isActive ? "active" : ""}
        onClick={onTabClick}
      >
        레이아웃 모드
      </button>

      <div
        className={`layout-popover${open ? " is-open" : ""}`}
        role="menu"
        aria-label="레이아웃 선택"
        onMouseEnter={showPopover}
        onMouseLeave={scheduleHide}
      >
        <p className="layout-popover-title">레이아웃 선택</p>
        <div className="layout-popover-options">
          {LAYOUT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={currentLayout === option.id}
              className={`layout-option-card${
                currentLayout === option.id ? " is-selected" : ""
              }`}
              onClick={() => handleSelect(option.id)}
            >
              <span className="layout-option-icon">
                <LayoutOptionIcon type={option.icon} />
              </span>
              <span className="layout-option-text">
                <strong>{option.title}</strong>
                <span>{option.description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

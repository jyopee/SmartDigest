import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export const ACCORDION_MOTION = {
  duration: 0.28,
  ease: [0.4, 0, 0.2, 1],
};

function ChevronIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    </svg>
  );
}

export default function AccordionBox({
  title,
  defaultExpanded = false,
  expanded,
  autoExpand = false,
  variant = "default",
  showWarningIcon = false,
  trailing = null,
  collapsedPreview = null,
  onExpandedChange,
  onCollapse,
  children,
  className = "",
}) {
  const [internalExpanded, setInternalExpanded] = useState(
    defaultExpanded || autoExpand
  );
  const isControlled = expanded !== undefined;
  const isExpanded = isControlled ? expanded : internalExpanded;

  useEffect(() => {
    if (autoExpand && !isControlled) {
      setInternalExpanded(true);
    }
  }, [autoExpand, isControlled]);

  const setExpanded = (next) => {
    if (!isControlled) {
      setInternalExpanded(next);
    }
    onExpandedChange?.(next);
    if (!next) onCollapse?.();
  };

  const toggle = () => setExpanded(!isExpanded);

  return (
    <motion.section
      layout
      className={`accordion-box accordion-box--${variant}${
        isExpanded ? " is-expanded" : ""
      }${className ? ` ${className}` : ""}`}
      transition={ACCORDION_MOTION}
    >
      <button
        type="button"
        className="accordion-box-trigger"
        onClick={toggle}
        aria-expanded={isExpanded}
      >
        <span className="accordion-box-trigger-main">
          {showWarningIcon && (
            <span className="accordion-box-warning" title="주의">
              <WarningIcon />
            </span>
          )}
          <span className="accordion-box-title">{title}</span>
        </span>
        <span className="accordion-box-trigger-end">
          {trailing}
          <motion.span
            className="accordion-box-chevron"
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
          >
            <ChevronIcon />
          </motion.span>
        </span>
      </button>

      {!isExpanded && collapsedPreview && (
        <motion.div
          layout
          className="accordion-box-preview"
          transition={ACCORDION_MOTION}
        >
          {collapsedPreview}
        </motion.div>
      )}

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="accordion-panel"
            layout
            className="accordion-box-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={ACCORDION_MOTION}
          >
            <motion.div
              layout
              className="accordion-box-body"
              transition={ACCORDION_MOTION}
            >
              {children}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

import { createContext, useContext, useMemo, useRef } from "react";

const ViewerInteractionContext = createContext({
  onRequestAnnotation: undefined,
  onHighlightClick: undefined,
});

export function ViewerInteractionProvider({
  onRequestAnnotation,
  onHighlightClick,
  children,
}) {
  const handlersRef = useRef({ onRequestAnnotation, onHighlightClick });
  handlersRef.current = { onRequestAnnotation, onHighlightClick };

  const value = useMemo(
    () => ({
      onRequestAnnotation: (...args) =>
        handlersRef.current.onRequestAnnotation?.(...args),
      onHighlightClick: (...args) =>
        handlersRef.current.onHighlightClick?.(...args),
    }),
    []
  );

  return (
    <ViewerInteractionContext.Provider value={value}>
      {children}
    </ViewerInteractionContext.Provider>
  );
}

export function useViewerInteraction() {
  return useContext(ViewerInteractionContext);
}

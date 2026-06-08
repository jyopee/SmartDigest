export function buildSourceFocusFromCard(card) {
  if (!card?.source || !card?.source_id) return null;
  return {
    pageNumber: card.page_number || 1,
    source: card.source,
    sourceId: card.source_id,
    selectedText: card.selected_text || "",
  };
}

export function buildSourceFocusFromNote(note) {
  if (!note?.id) return null;
  return {
    pageNumber: note.page_number || 1,
    source: "note",
    sourceId: note.id,
    selectedText: note.selected_text || "",
  };
}

export function buildSourceFocusFromChat(chat) {
  if (!chat?.id) return null;
  return {
    pageNumber: chat.page_number || 1,
    source: "chat",
    sourceId: chat.id,
    selectedText: chat.selected_text || "",
  };
}

function pulseElement(element) {
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  element.classList.add("sd-highlight-focus");
  window.setTimeout(() => {
    element.classList.remove("sd-highlight-focus");
  }, 2500);
}

function findTextNodeMatch(root, selectedText) {
  const query = selectedText.trim();
  if (!query) return null;

  const highlights = root.querySelectorAll(".sd-highlight");
  for (const mark of highlights) {
    if ((mark.textContent || "").includes(query)) {
      return mark;
    }
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.parentElement?.closest("script, style")) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let current = walker.nextNode();
  while (current) {
    const text = current.textContent || "";
    if (text.includes(query)) {
      return current.parentElement;
    }
    current = walker.nextNode();
  }

  return null;
}

export function focusDocumentSource(root, focus) {
  if (!root || !focus) return false;

  if (focus.source === "note" && focus.sourceId) {
    const byId = root.querySelector(`.sd-highlight[data-id="${focus.sourceId}"]`);
    if (byId) {
      pulseElement(byId);
      return true;
    }
  }

  const target = findTextNodeMatch(root, focus.selectedText);
  if (target) {
    pulseElement(target);
    return true;
  }

  return false;
}

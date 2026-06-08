export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** AI가 넣은 배경/박스용 인라인 스타일·래퍼 HTML 제거 */
export function stripDecorativeMarkup(markdown) {
  if (!markdown) return markdown;

  let result = markdown;

  result = result.replace(/\sstyle=(["'])([\s\S]*?)\1/gi, (match, quote, styles) => {
    const cleaned = styles
      .split(";")
      .map((rule) => rule.trim())
      .filter(
        (rule) =>
          rule &&
          !/^background(?:-color)?\s*:/i.test(rule) &&
          !/^border(?:-radius|-color)?\s*:/i.test(rule) &&
          !/^box-shadow\s*:/i.test(rule) &&
          !/^padding\s*:/i.test(rule)
      )
      .join("; ");

    return cleaned ? ` style=${quote}${cleaned}${quote}` : "";
  });

  return result;
}

export function applyAnnotationHighlights(markdown, annotations) {
  let result = markdown;
  for (const ann of annotations) {
    const selected = (ann.selected_text || "").trim();
    const comment = (ann.comment || ann.content || "").trim();
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

function shouldSkipTextNode(node) {
  const parent = node.parentElement;
  if (!parent) return true;
  if (parent.closest("mark.sd-search-hit, script, style")) return true;
  return false;
}

export function clearSearchHighlights(root) {
  if (!root) return;
  root.querySelectorAll("mark.sd-search-hit").forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
    parent.normalize();
  });
}

export function applySearchHighlights(root, query) {
  clearSearchHighlights(root);
  if (!root || !query.trim()) return [];

  const regex = new RegExp(escapeRegExp(query), "gi");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return shouldSkipTextNode(node)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes = [];
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current);
    current = walker.nextNode();
  }

  const hits = [];

  for (const textNode of textNodes) {
    const text = textNode.textContent || "";
    regex.lastIndex = 0;
    if (!regex.test(text)) continue;

    regex.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match = regex.exec(text);

    while (match) {
      if (match.index > lastIndex) {
        fragment.appendChild(
          document.createTextNode(text.slice(lastIndex, match.index))
        );
      }

      const mark = document.createElement("mark");
      mark.className = "sd-search-hit";
      mark.dataset.searchIndex = String(hits.length);
      mark.textContent = match[0];
      fragment.appendChild(mark);
      hits.push(mark);

      lastIndex = regex.lastIndex;
      match = regex.exec(text);
    }

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    textNode.parentNode?.replaceChild(fragment, textNode);
  }

  return hits;
}

export function setActiveSearchHit(hits, activeIndex) {
  hits.forEach((hit, index) => {
    hit.classList.toggle("sd-search-active", index === activeIndex);
  });
}

/**
 * 마크업 문자열에 검색 하이라이트를 적용합니다. (React 렌더 전 사용)
 */
export function applySearchHighlightsToMarkup(
  markup,
  query,
  activeLocalIndex = -1
) {
  if (!query.trim()) return markup;

  let localIndex = 0;

  return markup
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (!part || part.startsWith("<")) return part;

      return part.replace(new RegExp(escapeRegExp(query), "gi"), (match) => {
        const index = localIndex;
        localIndex += 1;
        const activeClass =
          index === activeLocalIndex ? " sd-search-active" : "";
        return `<mark class="sd-search-hit${activeClass}" data-search-index="${index}">${match}</mark>`;
      });
    })
    .join("");
}

/**
 * 문서 전체 페이지에서 검색어 위치 인덱스를 구성합니다.
 * @param {number} totalPages
 * @param {string} query
 * @param {(pageNumber: number) => Promise<string>} loadPageText
 * @returns {Promise<Array<{ pageNumber: number, localIndex: number }>>}
 */
export async function buildCrossPageSearchIndex(
  totalPages,
  query,
  loadPageText
) {
  if (!query.trim() || totalPages < 1) return [];

  const regex = new RegExp(escapeRegExp(query), "gi");
  const results = [];

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    const text = await loadPageText(pageNumber);
    regex.lastIndex = 0;
    let localIndex = 0;
    let match = regex.exec(text);

    while (match) {
      results.push({ pageNumber, localIndex });
      localIndex += 1;
      match = regex.exec(text);
    }
  }

  return results;
}

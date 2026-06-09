/** 페이지 보기 한 줄 단위 마크다운 역할 분류 */

function indentDepth(rawIndent) {
  const normalized = (rawIndent || "").replace(/\t/g, "  ");
  return Math.max(0, Math.floor(normalized.length / 2));
}

export function isListStubLabel(text) {
  return /^[^:：]{1,40}[:：]\s*$/.test((text || "").trim());
}

export function isListLabelWithInlineContent(text) {
  return /^[^:：]+[:：]\s+\S/.test((text || "").trim());
}

export function parseMarkdownLine(line) {
  const raw = line ?? "";
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "empty", text: "", depth: 0, raw };

  if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
    return { kind: "hr", text: "", depth: 0, raw };
  }

  for (let level = 6; level >= 1; level -= 1) {
    const prefix = `${"#".repeat(level)} `;
    if (trimmed.startsWith(prefix)) {
      return {
        kind: `h${level}`,
        text: trimmed.slice(prefix.length).trim(),
        depth: 0,
        raw,
      };
    }
  }

  const blockquote = trimmed.match(/^>\s+(.+)$/);
  if (blockquote) {
    return { kind: "blockquote", text: blockquote[1].trim(), depth: 0, raw };
  }

  const bullet = raw.match(/^(\s*)([-*+])\s+(.+)$/);
  if (bullet) {
    return {
      kind: "list",
      text: bullet[3].trim(),
      depth: indentDepth(bullet[1]),
      raw,
    };
  }

  const ordered = raw.match(/^(\s*)(\d+)\.\s+(.+)$/);
  if (ordered) {
    return {
      kind: "olist",
      text: ordered[3].trim(),
      depth: indentDepth(ordered[1]),
      order: Number(ordered[2]),
      raw,
    };
  }

  return { kind: "p", text: trimmed, depth: 0, raw };
}

export function classifyMarkdownLine(line) {
  const { kind, text } = parseMarkdownLine(line);
  return { kind, text };
}

function isListKind(kind) {
  return kind === "list" || kind === "olist";
}

export function buildListTree(items) {
  const root = { children: [] };
  const stack = [{ node: root, depth: -1 }];

  items.forEach((line) => {
    while (stack.length > 1 && stack[stack.length - 1].depth >= line.depth) {
      stack.pop();
    }

    const node = { line, children: [] };
    stack[stack.length - 1].node.children.push(node);
    stack.push({ node, depth: line.depth });
  });

  return root.children;
}

function shouldCollectAsStubChild(childLine, parentLine) {
  if (!isListKind(childLine.kind)) return false;
  if (isListStubLabel(childLine.text)) return false;
  if (isListLabelWithInlineContent(childLine.text)) return false;
  if (childLine.depth < parentLine.depth) return false;
  return true;
}

/** 들여쓰기 없이 이어진 라벨-only 줄(양방향:)의 하위 항목을 트리에 연결합니다. */
function applyStubGrouping(nodes) {
  const result = [];
  let index = 0;

  while (index < nodes.length) {
    const node = nodes[index];
    const { line } = node;

    if (isListStubLabel(line.text)) {
      const collected = [];
      let cursor = index + 1;

      while (cursor < nodes.length) {
        const sibling = nodes[cursor];
        if (!shouldCollectAsStubChild(sibling.line, line)) break;
        collected.push(sibling);
        cursor += 1;
      }

      if (collected.length) {
        result.push({
          ...node,
          children: [...node.children, ...collected],
        });
        index = cursor;
        continue;
      }
    }

    result.push({
      ...node,
      children: applyStubGrouping(node.children),
    });
    index += 1;
  }

  return result;
}

export function normalizeListTree(nodes) {
  return applyStubGrouping(nodes).map((node) => ({
    ...node,
    children: normalizeListTree(node.children),
  }));
}

/** 연속 목록 줄을 트리로 묶고, 나머지는 단일 줄로 유지합니다. */
export function buildLineDisplayGroups(lines) {
  const parsed = (lines || []).map((sourceLine, lineIndex) => ({
    ...parseMarkdownLine(sourceLine),
    lineIndex,
    sourceLine,
  }));

  const groups = [];
  let index = 0;

  while (index < parsed.length) {
    const current = parsed[index];

    if (!isListKind(current.kind)) {
      groups.push({ type: "single", line: current });
      index += 1;
      continue;
    }

    let cursor = index;
    while (cursor < parsed.length && isListKind(parsed[cursor].kind)) {
      cursor += 1;
    }

    const run = parsed.slice(index, cursor);
    groups.push({
      type: "list-block",
      tree: normalizeListTree(buildListTree(run)),
      lines: run,
    });
    index = cursor;
  }

  return groups;
}

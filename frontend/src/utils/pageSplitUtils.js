const CHUNK_SIZE = 100;
const MAX_PAGE_CHARS = 2400;

/** 백엔드 `_split_content_to_pages`와 동일한 세그먼트 분할 */
export function splitContentToSegments(content) {
  const text = (content || "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const headingParts = text
    .split(/(?=^## )/m)
    .map((part) => part.trim())
    .filter(Boolean);
  if (headingParts.length > 1) return headingParts;

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!paragraphs.length) return [text];

  const segments = [];
  let current = [];
  let currentLen = 0;

  for (const paragraph of paragraphs) {
    const paragraphLen = paragraph.length;
    if (current.length && currentLen + paragraphLen > MAX_PAGE_CHARS) {
      segments.push(current.join("\n\n"));
      current = [paragraph];
      currentLen = paragraphLen;
    } else {
      current.push(paragraph);
      currentLen += paragraphLen;
    }
  }

  if (current.length) segments.push(current.join("\n\n"));
  return segments.length ? segments : [text];
}

/** 제목(##) 또는 2,400자 기준 자동 분할 지점 (줄 index) */
export function computeInitialSplitPoints(content, lines) {
  if (!lines.length || lines.length < 2) return [];

  const segments = splitContentToSegments(content);
  if (segments.length <= 1) return [];

  const splitPoints = [];
  let lineIdx = 0;

  for (let segmentIndex = 0; segmentIndex < segments.length - 1; segmentIndex += 1) {
    const segment = segments[segmentIndex].trim();
    let accumulated = "";
    let endLine = lineIdx;

    for (let i = lineIdx; i < lines.length; i += 1) {
      accumulated = accumulated ? `${accumulated}\n${lines[i]}` : lines[i];
      endLine = i;
      if (accumulated.trim() === segment) break;
    }

    if (accumulated.trim() !== segment) {
      const segmentLineCount = splitContentIntoLines(segment).length;
      endLine = Math.min(lineIdx + Math.max(segmentLineCount, 1) - 1, lines.length - 2);
    }

    if (endLine < lineIdx || endLine >= lines.length - 1) break;

    splitPoints.push(endLine);
    lineIdx = endLine + 1;
  }

  return normalizeLineSplitPoints(splitPoints, lines.length);
}

export function resolveEffectiveSplitPoints(content, lines, splitState) {
  const initial = computeInitialSplitPoints(content, lines);
  if (splitState?.isCustomized) {
    return normalizeLineSplitPoints(splitState.customSplitPoints || [], lines.length);
  }
  return initial;
}

function chunkLongText(text) {
  const chunks = [];
  let rest = text.trim();

  while (rest.length > CHUNK_SIZE) {
    let cutAt = rest.lastIndexOf(" ", CHUNK_SIZE);
    if (cutAt < 40) cutAt = CHUNK_SIZE;
    chunks.push(rest.slice(0, cutAt).trim());
    rest = rest.slice(cutAt).trim();
  }

  if (rest) chunks.push(rest);
  return chunks.length ? chunks : [text.trim()];
}

/** 원본 텍스트를 줄 단위 배열로 변환합니다. */
export function splitContentIntoLines(text) {
  const normalized = (text || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const byNewline = normalized
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .filter((line) => line.trim());
  if (byNewline.length > 1) return byNewline;

  const paragraphs = normalized
    .split(/\n\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (paragraphs.length > 1) return paragraphs;

  const markdownBlocks = normalized
    .split(/(?=^#{1,6}\s|^[-*]\s)/m)
    .map((part) => part.trim())
    .filter(Boolean);
  if (markdownBlocks.length > 1) return markdownBlocks;

  const sentences = normalized
    .split(/(?<=[.!?。])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (sentences.length > 1) return sentences;

  if (normalized.length > 60) {
    const chunks = chunkLongText(normalized);
    if (chunks.length > 1) return chunks;
  }

  return [normalized];
}

export function joinLines(lines) {
  return lines.join("\n");
}

/**
 * splitPoints: 페이지가 나뉘는 줄 index (해당 줄 '뒤'에서 분할)
 */
export function normalizeLineSplitPoints(splitPoints, lineCount) {
  if (!lineCount) return [];

  return [...new Set(splitPoints)]
    .filter(
      (point) =>
        Number.isInteger(point) && point >= 0 && point < lineCount - 1
    )
    .sort((a, b) => a - b);
}

export function buildLinePages(lines, splitPoints) {
  if (!lines.length) return [];

  const sorted = normalizeLineSplitPoints(splitPoints, lines.length);
  if (!sorted.length) {
    return [{ startLine: 0, lines: [...lines], pageNumber: 1 }];
  }

  const pages = [];
  let start = 0;
  let pageNumber = 1;

  for (const point of sorted) {
    pages.push({
      startLine: start,
      endLine: point,
      lines: lines.slice(start, point + 1),
      pageNumber,
    });
    start = point + 1;
    pageNumber += 1;
  }

  pages.push({
    startLine: start,
    lines: lines.slice(start),
    pageNumber,
  });

  return pages;
}

export function buildMinimapData(totalLines, splitPoints) {
  const lineCount = Math.max(0, totalLines);
  const normalized = normalizeLineSplitPoints(splitPoints, lineCount);

  if (!lineCount) {
    return {
      totalLines: 0,
      splitPoints: [],
      segments: [],
      markers: [],
      virtualPageCount: 0,
    };
  }

  const placeholderLines = Array.from({ length: lineCount }, () => "");
  const pages = buildLinePages(placeholderLines, normalized);

  const segments = pages.map((page) => ({
    startLine: page.startLine,
    endLine: page.startLine + page.lines.length - 1,
    lineCount: page.lines.length,
    widthRatio: page.lines.length / lineCount,
    pageNumber: page.pageNumber,
  }));

  const markers = normalized.map((lineIndex) => ({
    lineIndex,
    ratio: lineCount > 1 ? (lineIndex + 1) / lineCount : 0,
    label: `${lineIndex + 1}번째 줄 뒤`,
  }));

  return {
    totalLines: lineCount,
    splitPoints: normalized,
    segments,
    markers,
    virtualPageCount: segments.length,
  };
}

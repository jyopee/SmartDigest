const STORAGE_PREFIX = "smartdigest:page-split:v3:";
const LEGACY_V2_PREFIX = "smartdigest:line-split-points:v2:";
const MIGRATION_KEY = "smartdigest:split-storage-migrated-v3";

function storageKey(digestId, pageNumber) {
  return `${STORAGE_PREFIX}${digestId}:${pageNumber}`;
}

function legacyV2Key(digestId, pageNumber) {
  return `${LEGACY_V2_PREFIX}${digestId}:${pageNumber}`;
}

const EMPTY_STATE = { isCustomized: false, customSplitPoints: [] };

function parseSplitPoints(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0);
}

/** 레거시 v2 배열을 사용자 정의 분할로 이전합니다. */
export function runSplitStorageMigration() {
  if (localStorage.getItem(MIGRATION_KEY)) return;

  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const key = localStorage.key(i);
    if (!key?.startsWith(LEGACY_V2_PREFIX)) continue;

    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      if (Array.isArray(parsed) && parsed.length) {
        const suffix = key.slice(LEGACY_V2_PREFIX.length);
        localStorage.setItem(
          `${STORAGE_PREFIX}${suffix}`,
          JSON.stringify({
            isCustomized: true,
            customSplitPoints: parseSplitPoints(parsed),
          })
        );
      }
    } catch {
      /* ignore malformed legacy entries */
    }
    localStorage.removeItem(key);
  }

  localStorage.setItem(MIGRATION_KEY, "1");
}

export function loadPageSplitState(digestId, pageNumber) {
  if (!digestId) return { ...EMPTY_STATE };

  runSplitStorageMigration();

  try {
    const raw = localStorage.getItem(storageKey(digestId, pageNumber));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return {
          isCustomized: Boolean(parsed.isCustomized),
          customSplitPoints: parseSplitPoints(parsed.customSplitPoints),
        };
      }
    }

    const legacyRaw = localStorage.getItem(legacyV2Key(digestId, pageNumber));
    if (legacyRaw) {
      const legacyPoints = parseSplitPoints(JSON.parse(legacyRaw));
      if (legacyPoints.length) {
        const state = { isCustomized: true, customSplitPoints: legacyPoints };
        savePageSplitState(digestId, pageNumber, state);
        localStorage.removeItem(legacyV2Key(digestId, pageNumber));
        return state;
      }
    }
  } catch {
    return { ...EMPTY_STATE };
  }

  return { ...EMPTY_STATE };
}

export function savePageSplitState(digestId, pageNumber, state) {
  if (!digestId) return;

  const key = storageKey(digestId, pageNumber);
  if (!state?.isCustomized) {
    localStorage.removeItem(key);
    return;
  }

  localStorage.setItem(
    key,
    JSON.stringify({
      isCustomized: true,
      customSplitPoints: parseSplitPoints(state.customSplitPoints),
    })
  );
}

/** @deprecated use loadPageSplitState */
export function loadLineSplitPoints(digestId, pageNumber) {
  const state = loadPageSplitState(digestId, pageNumber);
  return state.isCustomized ? state.customSplitPoints : [];
}

/** @deprecated use savePageSplitState */
export function saveLineSplitPoints(digestId, pageNumber, splitPoints) {
  savePageSplitState(digestId, pageNumber, {
    isCustomized: true,
    customSplitPoints: splitPoints,
  });
}

export function clearPageSplitState(digestId, pageNumber) {
  if (!digestId) return;
  localStorage.removeItem(storageKey(digestId, pageNumber));
  localStorage.removeItem(legacyV2Key(digestId, pageNumber));
}

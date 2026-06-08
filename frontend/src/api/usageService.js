import api from "./axiosInstance";

export const FREE_TIER_DAILY_LIMIT = 20;
const USAGE_STORAGE_PREFIX = "smartdigest_usage_";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function usageStorageKey(userId) {
  return `${USAGE_STORAGE_PREFIX}${userId}_${todayStr()}`;
}

export function isRateLimitError(error) {
  const status = error?.status ?? error?.response?.status;
  if (status === 429) return true;

  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("resource_exhausted") ||
    message.includes("resource exhausted") ||
    message.includes("quota") ||
    message.includes("한도")
  );
}

export function createExhaustedUsage(limit = FREE_TIER_DAILY_LIMIT) {
  return {
    date: todayStr(),
    used_count: limit,
    call_count: limit,
    limit,
    remaining: 0,
    percent: 100,
    forcedExhausted: true,
  };
}

export function saveUsageToStorage(userId, usage) {
  if (!userId || !usage) return;
  localStorage.setItem(
    usageStorageKey(userId),
    JSON.stringify({
      ...usage,
      userId,
      date: usage.date || todayStr(),
      syncedAt: new Date().toISOString(),
    })
  );
}

export function loadUsageFromStorage(userId) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(usageStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.date !== todayStr()) {
      localStorage.removeItem(usageStorageKey(userId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearUsageStorage(userId) {
  if (!userId) return;
  localStorage.removeItem(usageStorageKey(userId));
}

/** remaining = max(0, limit - usedCount) */
export function getQuotaStats(usage) {
  const limit = Number(usage?.limit ?? FREE_TIER_DAILY_LIMIT);
  const usedCount = Number(usage?.used_count ?? usage?.call_count ?? 0);
  const safeUsed = Number.isFinite(usedCount) ? Math.max(0, usedCount) : 0;
  const forcedExhausted = Boolean(usage?.forcedExhausted);
  const effectiveUsed =
    forcedExhausted && safeUsed < limit ? limit : safeUsed;
  const remaining = Math.max(0, limit - effectiveUsed);
  const usedPercent =
    limit > 0 ? Math.min(100, Math.round((effectiveUsed / limit) * 100)) : 0;
  const remainingPercent =
    limit > 0 ? Math.min(100, Math.round((remaining / limit) * 100)) : 0;

  const isLimitReached = forcedExhausted || effectiveUsed >= limit;

  return {
    limit,
    usedCount: effectiveUsed,
    remaining: isLimitReached ? 0 : remaining,
    percent: usedPercent,
    remainingPercent: isLimitReached ? 0 : remainingPercent,
    isLimitReached,
    exhausted: isLimitReached,
    tokensUsed: Number(usage?.tokens_used ?? 0),
  };
}

function mergeUsageRecords(serverUsage, localUsage) {
  const limit = Number(serverUsage?.limit ?? FREE_TIER_DAILY_LIMIT);

  if (localUsage?.forcedExhausted && localUsage.date === todayStr()) {
    return {
      ...serverUsage,
      used_count: limit,
      call_count: limit,
      remaining: 0,
      percent: 100,
      forcedExhausted: true,
    };
  }

  return {
    ...serverUsage,
    forcedExhausted: false,
  };
}

export async function fetchUsageToday(userId) {
  const { data } = await api.get("/api/usage/today", {
    params: { user_id: userId },
  });
  return data;
}

export async function markUsageExhaustedOnServer(userId) {
  const { data } = await api.post("/api/usage/mark-exhausted", null, {
    params: { user_id: userId },
  });
  return { ...data, forcedExhausted: true };
}

/** 서버 사용량을 가져와 localStorage와 병합·저장 */
export async function syncUsageWithServer(userId) {
  const local = loadUsageFromStorage(userId);

  try {
    const server = await fetchUsageToday(userId);
    const merged = mergeUsageRecords(server, local);
    saveUsageToStorage(userId, merged);
    return merged;
  } catch (error) {
    if (isRateLimitError(error)) {
      return applyQuotaExhausted(userId);
    }
    if (local) {
      return mergeUsageRecords(local, local);
    }
    throw error;
  }
}

/** 429 등 한도 초과 시 used_count를 limit으로 강제 동기화 */
export async function applyQuotaExhausted(userId) {
  try {
    const data = await markUsageExhaustedOnServer(userId);
    saveUsageToStorage(userId, data);
    return data;
  } catch {
    const fallback = createExhaustedUsage();
    saveUsageToStorage(userId, { ...fallback, userId });
    return fallback;
  }
}

const STORAGE_PREFIX = "smartdigest_recent_";
const MAX_RECENT = 12;

function storageKey(userId) {
  return `${STORAGE_PREFIX}${userId}`;
}

export function loadRecentDigestIds(userId) {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function recordRecentDigest(userId, digestId) {
  if (!userId || !digestId) return;
  const id = String(digestId);
  const current = loadRecentDigestIds(userId).filter((item) => item !== id);
  const next = [id, ...current].slice(0, MAX_RECENT);
  localStorage.setItem(storageKey(userId), JSON.stringify(next));
}

export function resolveRecentDigests(digests, userId) {
  const recentIds = loadRecentDigestIds(userId);
  const digestMap = new Map((digests || []).map((digest) => [String(digest.id), digest]));

  const ordered = [];
  for (const id of recentIds) {
    const digest = digestMap.get(id);
    if (digest) ordered.push(digest);
  }

  for (const digest of digests || []) {
    if (!recentIds.includes(String(digest.id))) {
      ordered.push(digest);
    }
  }

  return ordered.slice(0, MAX_RECENT);
}

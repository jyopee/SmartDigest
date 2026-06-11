import { fetchDigestGrid } from "../api/gridLayoutService";

export async function fetchAllKnowledgeCards(digests) {
  if (!digests?.length) return [];

  const batches = await Promise.all(
    digests.map(async (digest) => {
      try {
        const data = await fetchDigestGrid(digest.id);
        return (data.cards || []).map((card) => ({
          ...card,
          digestId: digest.id,
          digestFilename: digest.filename,
        }));
      } catch {
        return [];
      }
    })
  );

  return batches.flat();
}

export function pickRandomKnowledgeCard(cards) {
  if (!cards?.length) return null;
  const index = Math.floor(Math.random() * cards.length);
  return cards[index];
}

export function extractCardSummary(content, maxLength = 72) {
  if (!content) return "";

  const plain = String(content)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_`>\[\]()!|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!plain) return "";
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength).trim()}…`;
}

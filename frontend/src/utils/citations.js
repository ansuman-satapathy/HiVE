/**
 * Return only citations that are actually cited in the assistant message content,
 * deduplicated by document_id and chunk_index.
 *
 * If content has no [doc:...] references at all (such as general coding questions),
 * returns an empty array [] so irrelevant retrieved chunks are not falsely attributed.
 */
export function getReferencedCitations(content, citations = []) {
  if (!citations || citations.length === 0) return []
  if (!content) return []

  const matches = [...content.matchAll(/\[doc:\s*([^\]]+)\]/g)]
  if (matches.length === 0) {
    return []
  }

  const referencedIds = new Set(matches.map((m) => m[1].trim().toLowerCase()))
  const result = []
  const seenKeys = new Set()

  for (const cite of citations) {
    const chunkId = String(cite.chunk_id || '').toLowerCase().trim()
    const chunkIdx = String(cite.chunk_index)
    const docId = String(cite.document_id || '').toLowerCase().trim()

    const isReferenced =
      referencedIds.has(chunkId) ||
      referencedIds.has(chunkIdx) ||
      referencedIds.has(docId)

    if (isReferenced) {
      const key = `${cite.document_id}_${cite.chunk_index}`
      if (!seenKeys.has(key)) {
        seenKeys.add(key)
        result.push(cite)
      }
    }
  }

  // Also support numeric tags like [doc:1], [doc:2]
  matches.forEach((m) => {
    const raw = m[1].trim()
    if (/^\d+$/.test(raw)) {
      const num = parseInt(raw, 10)
      if (num >= 1 && num <= citations.length) {
        const cite = citations[num - 1]
        const key = `${cite.document_id}_${cite.chunk_index}`
        if (!seenKeys.has(key)) {
          seenKeys.add(key)
          result.push(cite)
        }
      }
    }
  })

  return result
}


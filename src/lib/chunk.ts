export function chunkText(text: string, chunkSize = 800, overlap = 200): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const chunks: string[] = [];
  const textLength = text.length;
  
  for (let i = 0; i < textLength; i += (chunkSize - overlap)) {
    const chunk = text.slice(i, i + chunkSize);
    if (chunk.trim().length > 0) {
      chunks.push(chunk.trim());
    }
  }
  
  return chunks.length > 0 ? chunks : [text];
}
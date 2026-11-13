import { pipeline } from '@huggingface/transformers';

let extractor: any | null = null;

export async function getEmbedder() {
  if (!extractor) {
    const device = (typeof navigator !== 'undefined' && (navigator as any).gpu) ? 'webgpu' : 'wasm';
    // Use Xenova/paraphrase-multilingual-MiniLM-L12-v2 (384-d, Korean supported, browser-friendly)
    extractor = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', { device });
  }
  return extractor;
}

export async function embedText(text: string): Promise<number[]> {
  const emb = await getEmbedder();
  const out = await emb(text, { pooling: 'mean', normalize: true });
  return Array.from(out.data);
}
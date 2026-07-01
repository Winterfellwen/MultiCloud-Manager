// ai-gateway/src/internal/embedding.ts
import { resolveOpsLlm } from './llm-resolver.js';

/**
 * 生成文本的 embedding 向量
 * 复用用户配置的默认 provider
 * 如果 provider 不支持 /embeddings 端点，返回 null（调用方降级为关键词检索）
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const llm = await resolveOpsLlm();

    const res = await fetch(`${llm.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${llm.apiKey}`,
      },
      body: JSON.stringify({
        model: llm.model.includes('/') ? llm.model.split('/').pop() : llm.model,
        input: text,
      }),
    });

    if (!res.ok) {
      console.warn(`Embedding API returned ${res.status}, will fall back to keyword search`);
      return null;
    }

    const data: any = await res.json();
    return data.data?.[0]?.embedding || null;
  } catch (err) {
    console.warn('Embedding generation failed, will fall back to keyword search:', (err as Error).message);
    return null;
  }
}

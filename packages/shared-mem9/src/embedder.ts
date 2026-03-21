/**
 * Gemini / OpenAI embedding client
 *
 * Routes to the correct provider based on config.
 * - Gemini: native REST API with ?key= auth
 * - OpenAI: /v1/embeddings with Bearer auth
 */

import type { EmbedderConfig } from './types.js'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

export class Embedder {
  constructor(private readonly config: EmbedderConfig) {}

  /** Embed a single text string → float vector */
  async embed(text: string): Promise<number[]> {
    if (this.config.provider === 'gemini') {
      return this.embedGemini(text)
    }
    return this.embedOpenAI(text)
  }

  /** Embed multiple texts in batch */
  async embedBatch(texts: string[]): Promise<number[][]> {
    // Gemini supports batch via embedContent with multiple parts
    if (this.config.provider === 'gemini') {
      return Promise.all(texts.map((t) => this.embedGemini(t)))
    }
    return Promise.all(texts.map((t) => this.embedOpenAI(t)))
  }

  /* ── Gemini native API ───────────────────────────────── */

  private async embedGemini(text: string): Promise<number[]> {
    const url = `${GEMINI_BASE}/models/${this.config.model}:embedContent?key=${this.config.apiKey}`

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Gemini embedding failed (${res.status}): ${err}`)
    }

    const data = (await res.json()) as { embedding: { values: number[] } }
    return data.embedding.values
  }

  /* ── OpenAI-compatible API ───────────────────────────── */

  private async embedOpenAI(text: string): Promise<number[]> {
    // OpenAI-compatible providers need a separate baseUrl config
    // For now this path is unused (Gemini is default), but kept for future flexibility
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        input: text,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`OpenAI embedding failed (${res.status}): ${err}`)
    }

    const data = (await res.json()) as {
      data: Array<{ embedding: number[] }>
    }
    const first = data.data[0]
    if (!first) {
      throw new Error('OpenAI embedding returned empty data array')
    }
    return first.embedding
  }
}

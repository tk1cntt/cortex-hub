/**
 * CLIProxy LLM client
 *
 * Calls CLIProxy's OpenAI-compatible /v1/chat/completions endpoint
 * for fact extraction and memory deduplication.
 */

import type { LlmConfig } from './types.js'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatCompletionResponse {
  choices: Array<{
    message: { content: string }
    finish_reason: string
  }>
  usage?: {
    total_tokens: number
    prompt_tokens: number
    completion_tokens: number
  }
}

export class LlmClient {
  private readonly baseUrl: string
  private readonly model: string

  constructor(config: LlmConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.model = config.model
  }

  /**
   * Send a chat completion request and parse the JSON response.
   * Returns the parsed JSON and token usage.
   */
  async chatJson<T>(
    messages: ChatMessage[],
  ): Promise<{ result: T; tokensUsed: number }> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`LLM request failed (${res.status}): ${err}`)
    }

    const data = (await res.json()) as ChatCompletionResponse
    const content = data.choices[0]?.message?.content

    if (!content) {
      throw new Error('LLM returned empty response')
    }

    // Parse JSON from the response (strip markdown fences if present)
    const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    try {
      const result = JSON.parse(jsonStr) as T
      return {
        result,
        tokensUsed: data.usage?.total_tokens ?? 0,
      }
    } catch {
      throw new Error(`Failed to parse LLM JSON: ${jsonStr.slice(0, 200)}`)
    }
  }

  /** Check if CLIProxy is reachable */
  async isHealthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        signal: AbortSignal.timeout(3000),
      })
      return res.ok
    } catch {
      return false
    }
  }
}

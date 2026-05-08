type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

export type NetlifyEvent = {
  httpMethod: string
  body: string | null
}

export const model = 'openai/gpt-oss-120b'

export function jsonResponse(statusCode: number, payload: unknown) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }
}

export function parseJsonBody(event: NetlifyEvent) {
  try {
    return JSON.parse(event.body || '{}') as Record<string, unknown>
  } catch {
    return null
  }
}

export async function requestGroq(systemPrompt: string, userPrompt: string, apiKey: string) {
  const modelResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  })

  if (!modelResponse.ok) {
    const message = await modelResponse.text()
    return {
      ok: false as const,
      statusCode: modelResponse.status,
      error: message || 'Model request failed.',
    }
  }

  const data = (await modelResponse.json()) as ChatCompletionResponse
  const output = data?.choices?.[0]?.message?.content?.trim()

  if (!output) {
    return {
      ok: false as const,
      statusCode: 502,
      error: 'Model returned an empty response.',
    }
  }

  return {
    ok: true as const,
    output,
  }
}

const NVIDIA_CHAT_COMPLETIONS_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_FITMENT_MODEL = 'z-ai/glm-5.2';

const FITMENT_BOT_SYSTEM_INSTRUCTION = [
  "You are a high-speed automotive fitment expert for 'GP Tyres & Mags'. Provide **fast, accurate, and concise** Wheel Specifications and Tyre Sizes.",
  '',
  'RULES:',
  '1. KEEP IT SHORT: Users need quick info. Use bullet points. Minimal text.',
  '2. FORMAT:',
  '   - **PCD**: [Value]',
  '   - **Offset**: [Value]',
  '   - **Center Bore**: [Value]',
  '   - **Tyres**: [Size 1], [Size 2]',
  "3. Prioritize accurate vehicle fitment data. If you are not fully sure, say 'Please verify before fitment.'"
].join('\n');

type ChatRole = 'user' | 'model' | 'assistant';

interface ChatMessage {
  role: ChatRole;
  text?: string;
  content?: string;
}

const readRequestBody = async (request: any) => {
  if (typeof request.body === 'string') return request.body ? JSON.parse(request.body) : {};
  if (Buffer.isBuffer(request.body)) {
    const rawBody = request.body.toString('utf8');
    return rawBody ? JSON.parse(rawBody) : {};
  }
  if (request.body && typeof request.body === 'object') return request.body;

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');
  return rawBody ? JSON.parse(rawBody) : {};
};

const normalizeMessages = (messages: ChatMessage[]) => {
  return messages
    .slice(-12)
    .map((message) => {
      const content = String(message.content ?? message.text ?? '').trim();
      if (!content) return null;
      return {
        role: message.role === 'user' ? 'user' : 'assistant',
        content
      };
    })
    .filter(Boolean);
};

const parseNvidiaResponseText = (rawText: string, parsedJson: any) => {
  const directText = parsedJson?.choices?.[0]?.message?.content;
  if (directText) return directText;

  return rawText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.replace(/^data:\s*/, ''))
    .filter((line) => line && line !== '[DONE]')
    .map((line) => {
      try {
        const chunk = JSON.parse(line);
        return chunk?.choices?.[0]?.delta?.content || chunk?.choices?.[0]?.message?.content || '';
      } catch {
        return '';
      }
    })
    .join('')
    .trim();
};

export default async function handler(request: any, response: any) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Only POST is supported.' });
  }

  const apiKey = process.env.NVIDIA_API_KEY || process.env.NGC_API_KEY;
  if (!apiKey) {
    return response.status(500).json({ error: 'NVIDIA API key is not configured.' });
  }

  try {
    const body = await readRequestBody(request);
    const messages = Array.isArray(body.messages) ? normalizeMessages(body.messages) : [];

    if (!messages.length) {
      return response.status(400).json({ error: 'Send at least one chat message.' });
    }

    const upstreamResponse = await fetch(process.env.NVIDIA_CHAT_COMPLETIONS_URL || NVIDIA_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.NVIDIA_FITMENT_MODEL || NVIDIA_FITMENT_MODEL,
        messages: [
          { role: 'system', content: FITMENT_BOT_SYSTEM_INSTRUCTION },
          ...messages
        ],
        temperature: 1,
        top_p: 1,
        max_tokens: 2048,
        seed: 42,
        stream: true
      })
    });

    const upstreamText = await upstreamResponse.text();
    let upstreamJson: any = null;
    try {
      upstreamJson = upstreamText ? JSON.parse(upstreamText) : null;
    } catch {
      upstreamJson = null;
    }

    if (!upstreamResponse.ok) {
      const detail = upstreamJson?.error?.message || upstreamJson?.detail || upstreamJson?.message || 'NVIDIA model request failed.';
      const status = /DEGRADED function cannot be invoked/i.test(detail) ? 503 : upstreamResponse.status;
      return response.status(status).json({ error: detail });
    }

    const text = parseNvidiaResponseText(upstreamText, upstreamJson);
    if (!text) {
      return response.status(502).json({ error: 'NVIDIA model returned an empty response.' });
    }

    return response.status(200).json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Fitment bot request failed.';
    return response.status(500).json({ error: message });
  }
}

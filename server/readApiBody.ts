export const readApiBody = async (request: any): Promise<Record<string, unknown>> => {
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

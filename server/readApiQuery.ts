type ApiQuery = Record<string, string | string[]>;

export const readApiQuery = (request: { url?: string }): ApiQuery => {
  // Do not access request.query: older Vercel runtimes lazily use url.parse().
  // A fixed base handles relative request URLs without trusting the Host header.
  const searchParams = new URL(request.url || '/', 'http://localhost').searchParams;
  const query: ApiQuery = Object.create(null);
  for (const [key, value] of searchParams) {
    const previous = query[key];
    if (previous === undefined) query[key] = value;
    else if (Array.isArray(previous)) previous.push(value);
    else query[key] = [previous, value];
  }
  return query;
};

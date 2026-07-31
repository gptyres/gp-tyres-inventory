import { readApiBody } from '../server/readApiBody.js';
import { requestParcelPerfectQuote } from '../server/parcelPerfect.js';
import { verifyStaffSession } from '../server/staffSession.js';

export default async function handler(request: any, response: any) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Unsupported method.' });
  }

  try {
    if (!verifyStaffSession(request)) {
      return response.status(401).json({ error: 'Staff authentication is required to request a courier quote.' });
    }

    const body = await readApiBody(request);
    const quote = await requestParcelPerfectQuote(
      body.destination,
      body.parcel,
      body.reference
    );
    const result = quote?.results?.[0] || {};
    const rates = Array.isArray(result.rates) ? result.rates : [];
    return response.status(200).json({
      quoteNumber: typeof result.quoteno === 'string' ? result.quoteno : null,
      rates
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Courier quote could not be requested.';
    return response.status(400).json({ error: message });
  }
}

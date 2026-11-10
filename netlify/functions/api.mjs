import { handler } from '../../server/api.mjs';

export default async function api(request, context) {
  const response = await handler(request);
  // Use the platform cookie API so multiple updates survive its HTTP bridge.
  if (context?.cookies) {
    const updates = response.headers.getSetCookie();
    response.headers.delete('set-cookie');
    for (const update of updates) {
      const [pair, ...attributes] = update.split(';').map(part => part.trim());
      const split = pair.indexOf('=');
      const maxAge = Number(attributes.find(part => part.startsWith('Max-Age='))?.slice(8) ?? 28800);
      context.cookies.set({ name: pair.slice(0, split), value: pair.slice(split + 1), path: '/',
        httpOnly: true, sameSite: 'Strict', secure: new URL(request.url).protocol === 'https:', maxAge });
    }
  }
  return response;
}
export const config = {
  rateLimit: { action: 'rate_limit', aggregateBy: ['ip','domain'], windowSize: 60, windowLimit: 90 },
};

export function parseCookies(cookieHeader = '') {
  return Object.fromEntries(
    cookieHeader.split(';').flatMap((c) => {
      const trimmed = c.trim();
      if (!trimmed) return [];
      const idx = trimmed.indexOf('=');
      if (idx === -1) return [];
      return [[trimmed.slice(0, idx), trimmed.slice(idx + 1)]];
    })
  );
}

export function getAuthData(req) {
  const cookies = parseCookies(req.headers.cookie);
  if (!cookies.linkedin_auth) return null;

  try {
    const data = JSON.parse(Buffer.from(cookies.linkedin_auth, 'base64').toString('utf8'));
    if (data.expires_at && Date.now() > data.expires_at) return null;
    return data;
  } catch {
    return null;
  }
}

// Omit Secure flag when running locally (outside Vercel)
export const cookieFlags = process.env.VERCEL_ENV
  ? 'HttpOnly; Secure; SameSite=Lax; Path=/'
  : 'HttpOnly; SameSite=Lax; Path=/';

import { parseCookies, cookieFlags } from '../_utils.js';

export default async function handler(req, res) {
  const { LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, VITE_APP_URL } = process.env;
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.redirect(302, `/?error=${encodeURIComponent(error_description || error)}`);
  }

  if (!code || !state) {
    return res.redirect(302, '/?error=missing_code_or_state');
  }

  // CSRF: verify state matches what we set in the cookie
  const cookies = parseCookies(req.headers.cookie);
  if (state !== cookies.linkedin_oauth_state) {
    return res.redirect(302, '/?error=state_mismatch');
  }

  const redirectUri = `${VITE_APP_URL}/api/auth/callback`;

  // Exchange authorization code for access token
  const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: LINKEDIN_CLIENT_ID,
      client_secret: LINKEDIN_CLIENT_SECRET,
    }),
  });

  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    console.error('Token exchange failed:', tokenData);
    return res.redirect(302, '/?error=token_exchange_failed');
  }

  // Fetch member ID + name via the v2/me endpoint (works with r_liteprofile + w_member_social)
  const meRes = await fetch(
    'https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName)',
    { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
  );

  if (!meRes.ok) {
    console.error('Profile fetch failed:', await meRes.text());
    return res.redirect(302, '/?error=profile_fetch_failed');
  }

  const me = await meRes.json();
  const name = [me.localizedFirstName, me.localizedLastName].filter(Boolean).join(' ') || 'LinkedIn User';

  // Encode auth payload into an httpOnly cookie
  const payload = Buffer.from(
    JSON.stringify({
      access_token: tokenData.access_token,
      sub: me.id,                      // used as the LinkedIn member URN
      name,
      expires_at: Date.now() + (tokenData.expires_in ?? 5184000) * 1000,
    })
  ).toString('base64');

  res.setHeader('Set-Cookie', [
    `linkedin_auth=${payload}; ${cookieFlags}; Max-Age=5184000`,
    `linkedin_oauth_state=; ${cookieFlags}; Max-Age=0`,
  ]);

  res.redirect(302, '/');
}

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

  // Fetch profile via OpenID Connect userinfo endpoint
  const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!profileRes.ok) {
    return res.redirect(302, '/?error=profile_fetch_failed');
  }

  const profile = await profileRes.json();

  // Encode auth payload into an httpOnly cookie
  const payload = Buffer.from(
    JSON.stringify({
      access_token: tokenData.access_token,
      sub: profile.sub,               // used as the LinkedIn member URN
      name: profile.name || 'LinkedIn User',
      picture: profile.picture || null,
      expires_at: Date.now() + (tokenData.expires_in ?? 5184000) * 1000,
    })
  ).toString('base64');

  res.setHeader('Set-Cookie', [
    `linkedin_auth=${payload}; ${cookieFlags}; Max-Age=5184000`,
    `linkedin_oauth_state=; ${cookieFlags}; Max-Age=0`,
  ]);

  res.redirect(302, '/');
}

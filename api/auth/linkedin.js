import { cookieFlags } from '../_utils.js';

export default function handler(req, res) {
  const { LINKEDIN_CLIENT_ID, VITE_APP_URL } = process.env;

  if (!LINKEDIN_CLIENT_ID || !VITE_APP_URL) {
    return res.status(500).json({ error: 'Missing LINKEDIN_CLIENT_ID or VITE_APP_URL env vars' });
  }

  const state = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const redirectUri = `${VITE_APP_URL}/api/auth/callback`;

  const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', LINKEDIN_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'openid profile email w_member_social');
  authUrl.searchParams.set('state', state);

  res.setHeader('Set-Cookie', `linkedin_oauth_state=${state}; ${cookieFlags}; Max-Age=600`);
  res.redirect(302, authUrl.toString());
}

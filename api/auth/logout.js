import { cookieFlags } from '../_utils.js';

export default function handler(req, res) {
  res.setHeader('Set-Cookie', [
    `linkedin_auth=; ${cookieFlags}; Max-Age=0`,
    `linkedin_oauth_state=; ${cookieFlags}; Max-Age=0`,
  ]);
  res.json({ success: true });
}

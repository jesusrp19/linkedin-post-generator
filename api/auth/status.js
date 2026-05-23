import { getAuthData } from '../_utils.js';

export default function handler(req, res) {
  const auth = getAuthData(req);

  if (!auth) {
    return res.json({ authenticated: false });
  }

  res.json({
    authenticated: true,
    name: auth.name,
    picture: auth.picture,
  });
}

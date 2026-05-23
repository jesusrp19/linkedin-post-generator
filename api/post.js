import { getAuthData } from './_utils.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = getAuthData(req);
  if (!auth) {
    return res.status(401).json({ error: 'Not authenticated. Please connect LinkedIn first.' });
  }

  const { text } = req.body ?? {};
  if (!text?.trim()) {
    return res.status(400).json({ error: 'Post text is required' });
  }

  const body = {
    author: `urn:li:person:${auth.sub}`,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: text.trim() },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  const postRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.access_token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  });

  if (!postRes.ok) {
    const detail = await postRes.json().catch(() => ({}));
    console.error('LinkedIn UGC post error:', detail);
    return res.status(postRes.status).json({
      error: 'LinkedIn rejected the post',
      detail,
    });
  }

  const data = await postRes.json();
  res.json({ success: true, id: data.id });
}

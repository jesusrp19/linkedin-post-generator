import { getAuthData } from './_utils.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = getAuthData(req);
  if (!auth) {
    return res.status(401).json({ error: 'Not authenticated. Please connect LinkedIn first.' });
  }

  const { text, imageBase64 } = req.body ?? {};
  if (!text?.trim()) {
    return res.status(400).json({ error: 'Post text is required' });
  }

  try {
    let assetUrn = null;
    if (imageBase64) {
      assetUrn = await uploadImage(auth, imageBase64);
    }

    const ugcBody = buildUgcPost(auth.sub, text.trim(), assetUrn);

    const postRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.access_token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(ugcBody),
    });

    if (!postRes.ok) {
      const detail = await postRes.json().catch(() => ({}));
      console.error('LinkedIn UGC post error:', detail);
      return res.status(postRes.status).json({ error: 'LinkedIn rejected the post', detail });
    }

    const data = await postRes.json();
    res.json({ success: true, id: data.id });
  } catch (err) {
    console.error('Post error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function uploadImage(auth, imageBase64) {
  const mimeMatch = imageBase64.match(/^data:([^;]+);base64,/);
  const mediaType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const binary = Buffer.from(imageBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');

  // Step 1: Register upload with LinkedIn
  const regRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.access_token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        owner: `urn:li:person:${auth.sub}`,
        serviceRelationships: [
          { relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' },
        ],
      },
    }),
  });

  if (!regRes.ok) {
    const err = await regRes.json().catch(() => ({}));
    throw new Error(`Image upload registration failed: ${JSON.stringify(err)}`);
  }

  const regData = await regRes.json();
  const uploadUrl =
    regData.value?.uploadMechanism?.[
      'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
    ]?.uploadUrl;
  const assetUrn = regData.value?.asset;

  if (!uploadUrl || !assetUrn) {
    throw new Error('LinkedIn did not return an upload URL');
  }

  // Step 2: Upload binary image bytes
  const upRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${auth.access_token}`,
      'Content-Type': mediaType,
    },
    body: binary,
  });

  if (!upRes.ok) {
    throw new Error(`Image binary upload failed: ${upRes.status}`);
  }

  return assetUrn;
}

function buildUgcPost(sub, text, assetUrn) {
  const base = {
    author: `urn:li:person:${sub}`,
    lifecycleState: 'PUBLISHED',
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };

  if (assetUrn) {
    return {
      ...base,
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'IMAGE',
          media: [{ status: 'READY', media: assetUrn }],
        },
      },
    };
  }

  return {
    ...base,
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: 'NONE',
      },
    },
  };
}

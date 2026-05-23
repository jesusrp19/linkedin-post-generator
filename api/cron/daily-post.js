import Anthropic from '@anthropic-ai/sdk';
import { redis } from '../_redis.js';

const TOPICS = [
  { topic: 'Why most e-government projects fail citizens even when the technology works perfectly', keywords: 'government digital services citizens technology' },
  { topic: 'The real barriers to digital transformation in the public sector — and they are not technical', keywords: 'public sector digital transformation government' },
  { topic: 'How AI is reshaping public service delivery and what governments need to get right', keywords: 'artificial intelligence government public services' },
  { topic: 'Open data as a driver of public sector innovation: what good looks like', keywords: 'open data government transparency innovation' },
  { topic: 'E-governance in 2025: moving from digitalising paperwork to reimagining public services', keywords: 'e-governance digital government services' },
  { topic: 'Why citizen-centred design is still the exception and not the rule in government IT', keywords: 'citizen experience government digital design' },
  { topic: 'The governance gap: why public sector digital strategies rarely survive contact with reality', keywords: 'public sector governance strategy government' },
  { topic: 'Lessons from the most successful digital government transformations in Europe', keywords: 'Europe digital government innovation Estonia' },
  { topic: 'How interoperability between government systems can unlock billions in public value', keywords: 'government systems integration data sharing' },
  { topic: 'The procurement problem: why outdated public sector buying rules slow down digital innovation', keywords: 'government procurement technology innovation' },
  { topic: 'Digital identity as the foundation of modern e-government — where are we really?', keywords: 'digital identity government authentication citizens' },
  { topic: 'Public sector data strategy: why most governments are sitting on untapped value', keywords: 'government data strategy public sector analytics' },
  { topic: 'Change management in government: the human side of digital transformation nobody funds', keywords: 'change management government public sector people' },
  { topic: 'How smart cities are redefining the relationship between government and citizens', keywords: 'smart city government urban technology innovation' },
  { topic: 'The case for agile in government: why iterative delivery beats the big-bang approach', keywords: 'agile government digital delivery public sector' },
  { topic: 'Cybersecurity in the public sector: the risks governments can no longer afford to ignore', keywords: 'cybersecurity government public sector security' },
  { topic: 'From digitisation to transformation: why most public sector initiatives stop halfway', keywords: 'digital transformation government public services reform' },
  { topic: 'How co-creation with citizens leads to better public digital services', keywords: 'co-creation citizens government participation innovation' },
  { topic: 'The role of innovation labs in modernising government — hype or genuine change driver?', keywords: 'government innovation lab public sector technology' },
  { topic: 'Legacy systems in government: the silent obstacle to every digital transformation initiative', keywords: 'legacy systems government IT modernisation' },
];

const SYSTEM_PROMPT = `You are a thought leader in public sector innovation, e-governance, and digital transformation writing a LinkedIn post for an audience of government officials, policy makers, public sector consultants, and digital transformation professionals. Your posts consistently earn high engagement because they are:
- Specific and backed by real-world patterns, not vague advice
- Written in a confident, direct voice — no corporate filler
- Structured for easy scrolling: short punchy lines, white space, occasional emoji for visual anchoring
- Ending with a question or call to action that invites comments
- Between 150 and 280 words
- NOT using hashtags (they look spammy)
- Starting with a hook that stops the scroll — a bold claim, a counterintuitive statement, or a vivid scenario

Return ONLY the post text with no preamble, no explanation, no quotation marks.`;

export default async function handler(req, res) {
  const secret = req.headers['x-cron-secret'] ?? req.query.secret;
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const auth = await redis.get('linkedin_auth');
  if (!auth) {
    return res.status(400).json({ error: 'No LinkedIn auth stored. Log in through the app first.' });
  }
  if (auth.expires_at && Date.now() > auth.expires_at) {
    return res.status(400).json({ error: 'LinkedIn token expired. Please log in through the app to refresh.' });
  }

  const dayOfYear = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86400000);
  const { topic, keywords } = TOPICS[dayOfYear % TOPICS.length];

  // Generate post with Claude
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Write a LinkedIn post about: ${topic}` }],
  });
  const postText = message.content[0].text.trim();

  // Fetch a relevant photo from Pexels
  let assetUrn = null;
  if (process.env.PEXELS_API_KEY) {
    try {
      const imageBuffer = await fetchPexelsImage(keywords);
      if (imageBuffer) {
        assetUrn = await uploadImageToLinkedIn(auth, imageBuffer);
      }
    } catch (err) {
      console.warn('Image fetch/upload failed, posting text-only:', err.message);
    }
  }

  // Build and send UGC post
  const ugcBody = buildUgcPost(auth.sub, postText, assetUrn);
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
    console.error('LinkedIn post failed:', detail);
    return res.status(postRes.status).json({ error: 'LinkedIn rejected the post', detail });
  }

  const data = await postRes.json();
  console.log('Daily post published:', data.id, '| topic:', topic, '| image:', !!assetUrn);
  res.json({ success: true, id: data.id, topic, hasImage: !!assetUrn });
}

async function fetchPexelsImage(searchQuery) {
  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&per_page=5&orientation=landscape`,
    { headers: { Authorization: process.env.PEXELS_API_KEY } }
  );
  if (!res.ok) throw new Error(`Pexels search failed: ${res.status}`);

  const data = await res.json();
  const photo = data.photos?.[0];
  if (!photo) return null;

  // Download the image as a buffer
  const imgRes = await fetch(photo.src.large);
  if (!imgRes.ok) throw new Error(`Image download failed: ${imgRes.status}`);

  const arrayBuffer = await imgRes.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function uploadImageToLinkedIn(auth, imageBuffer) {
  // Step 1: Register upload
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
    throw new Error(`Image registration failed: ${JSON.stringify(err)}`);
  }

  const regData = await regRes.json();
  const uploadUrl =
    regData.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
  const assetUrn = regData.value?.asset;

  if (!uploadUrl || !assetUrn) throw new Error('LinkedIn did not return an upload URL');

  // Step 2: Upload binary
  const upRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${auth.access_token}`,
      'Content-Type': 'image/jpeg',
    },
    body: imageBuffer,
  });

  if (!upRes.ok) throw new Error(`Image binary upload failed: ${upRes.status}`);

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

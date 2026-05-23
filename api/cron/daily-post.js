import Anthropic from '@anthropic-ai/sdk';
import { redis } from '../_redis.js';

const TOPICS = [
  { topic: 'What a good digital transformation policy actually looks like and why most governments get it wrong', keywords: 'digital transformation government policy' },
  { topic: 'The policy advisor role in bridging the gap between political ambition and digital delivery', keywords: 'policy advisor government digital strategy' },
  { topic: 'Why digital transformation strategies fail without strong policy foundations', keywords: 'digital policy government strategy reform' },
  { topic: 'How to design e-government policy that puts citizens first, not technology first', keywords: 'citizen government digital services policy' },
  { topic: "The EU's digital decade targets: are member states on track and what needs to change?", keywords: 'European Union digital policy government' },
  { topic: 'What AI governance policy in the public sector should actually focus on in 2025', keywords: 'AI governance policy government regulation' },
  { topic: 'Why digital inclusion must be a policy priority, not an afterthought, in every transformation agenda', keywords: 'digital inclusion policy government equity' },
  { topic: 'Open government data policy: the gap between what is published and what is actually useful', keywords: 'open data government policy transparency' },
  { topic: 'How policy advisors can help governments move from digitising old processes to reimagining public services', keywords: 'government service redesign policy innovation' },
  { topic: 'The interoperability problem in government: why policy, not technology, is the real blocker', keywords: 'government interoperability data policy integration' },
  { topic: 'Lessons from Estonia, Denmark, and Singapore: what made their digital government policies work', keywords: 'Estonia digital government policy best practice' },
  { topic: 'How to build a national digital identity framework that citizens actually trust', keywords: 'digital identity policy government trust citizens' },
  { topic: 'Why procurement reform is the most underrated lever in any public sector digitalisation strategy', keywords: 'government procurement policy reform innovation' },
  { topic: 'The role of regulatory sandboxes in accelerating public sector digital innovation', keywords: 'regulatory sandbox government innovation policy' },
  { topic: 'Digital transformation and democratic accountability: the policy questions no one is asking', keywords: 'digital democracy government accountability policy' },
  { topic: 'How smart cities need smarter policy and the governance frameworks that make urban innovation work', keywords: 'smart city policy governance urban innovation' },
  { topic: 'Cybersecurity policy in government: moving from compliance checklists to genuine resilience', keywords: 'cybersecurity policy government resilience' },
  { topic: 'Why digital transformation policy must be co-designed with frontline public servants, not handed down to them', keywords: 'co-design government policy public servants' },
  { topic: 'The case for a Chief Digital Officer in every ministry and what the role should actually do', keywords: 'chief digital officer government policy leadership' },
  { topic: "How to evaluate whether a government's digital transformation strategy is actually working", keywords: 'government digital strategy evaluation policy impact' },
];

const SYSTEM_PROMPT = `You are a policy advisor specialising in digital transformation, e-governance, and public sector innovation. You write LinkedIn posts to build your professional brand and position yourself as a leading voice in digital transformation policy. Your audience is government officials, policy makers, EU institutions, public sector leaders, and digital governance professionals.

Your posts earn high engagement because they are:
- Written from the perspective of a policy advisor who understands both the political and technical dimensions
- Specific, insightful, and grounded in real policy challenges and case studies
- Confident and direct — no vague buzzwords or empty statements
- Structured for easy scrolling: short punchy lines, white space, occasional emoji for visual anchoring
- Ending with a question or call to action that invites fellow policy professionals to engage
- Between 150 and 280 words
- NOT using hashtags (they look spammy)
- Starting with a hook that stops the scroll — a bold policy claim, a counterintuitive observation, or a real-world scenario from government

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

  const imgRes = await fetch(photo.src.large);
  if (!imgRes.ok) throw new Error(`Image download failed: ${imgRes.status}`);

  const arrayBuffer = await imgRes.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function uploadImageToLinkedIn(auth, imageBuffer) {
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

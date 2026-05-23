import Anthropic from '@anthropic-ai/sdk';
import { redis } from '../_redis.js';

const TOPICS = [
  { topic: 'The hidden cost of technical debt in enterprise IT projects and how to communicate it to leadership', keywords: 'technical debt software engineering' },
  { topic: 'Why digital transformation fails: the people problem nobody talks about', keywords: 'digital transformation business team' },
  { topic: 'How AI copilots are changing the daily workflow of IT consultants in 2025', keywords: 'artificial intelligence workplace technology' },
  { topic: 'Managing scope creep in IT consulting engagements: lessons learned', keywords: 'project management consulting office' },
  { topic: 'The shift from project-based to product-based IT delivery — what it means for consultants', keywords: 'agile product development team' },
  { topic: 'Cloud cost optimisation: the overlooked ROI opportunity in most IT budgets', keywords: 'cloud computing data center server' },
  { topic: 'Why IT governance frameworks (ITIL, COBIT) still matter even in agile organisations', keywords: 'IT governance business strategy' },
  { topic: "The consultant's dilemma: when to recommend buy vs. build", keywords: 'software development business decision' },
  { topic: 'Cybersecurity is now a boardroom conversation — what IT leaders need to know', keywords: 'cybersecurity data protection technology' },
  { topic: 'How to run a discovery workshop that actually surfaces real business needs', keywords: 'business workshop collaboration team meeting' },
  { topic: 'The underrated skill in IT consulting: translating technical risk into business language', keywords: 'business communication strategy presentation' },
  { topic: 'Lessons from failed ERP implementations and what good looks like', keywords: 'enterprise software implementation business' },
  { topic: 'Why most IT roadmaps become obsolete within 12 months (and how to fix that)', keywords: 'IT strategy roadmap planning technology' },
  { topic: 'Data quality: the unglamorous foundation of every successful analytics project', keywords: 'data analytics dashboard technology' },
  { topic: 'IT outsourcing in 2025: what to keep in-house and what to delegate', keywords: 'outsourcing business partnership team' },
  { topic: 'Building trust with a new client in the first 30 days of an IT engagement', keywords: 'business handshake trust partnership meeting' },
  { topic: 'The rise of the fractional CTO — and what it signals about IT leadership needs', keywords: 'CTO leadership technology executive' },
  { topic: 'How to measure the real impact of an IT consulting engagement beyond deliverables', keywords: 'business results measurement success metrics' },
];

const SYSTEM_PROMPT = `You are a senior IT consultant and thought leader writing a LinkedIn post for a professional audience in IT Services & IT Consulting. Your posts consistently earn high engagement because they are:
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

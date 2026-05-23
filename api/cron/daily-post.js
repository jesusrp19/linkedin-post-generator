import Anthropic from '@anthropic-ai/sdk';
import { redis } from '../_redis.js';

const TOPICS = [
  'The hidden cost of technical debt in enterprise IT projects and how to communicate it to leadership',
  'Why digital transformation fails: the people problem nobody talks about',
  'How AI copilots are changing the daily workflow of IT consultants in 2025',
  'Managing scope creep in IT consulting engagements: lessons learned',
  'The shift from project-based to product-based IT delivery — what it means for consultants',
  'Cloud cost optimisation: the overlooked ROI opportunity in most IT budgets',
  'Why IT governance frameworks (ITIL, COBIT) still matter even in agile organisations',
  'The consultant's dilemma: when to recommend buy vs. build',
  'Cybersecurity is now a boardroom conversation — what IT leaders need to know',
  'How to run a discovery workshop that actually surfaces real business needs',
  'The underrated skill in IT consulting: translating technical risk into business language',
  'Lessons from failed ERP implementations and what good looks like',
  'Why most IT roadmaps become obsolete within 12 months (and how to fix that)',
  'Data quality: the unglamorous foundation of every successful analytics project',
  'IT outsourcing in 2025: what to keep in-house and what to delegate',
  'Building trust with a new client in the first 30 days of an IT engagement',
  'The rise of the fractional CTO — and what it signals about IT leadership needs',
  'How to measure the real impact of an IT consulting engagement beyond deliverables',
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
  // Verify cron secret so this can't be triggered by anyone else
  const secret = req.headers['x-cron-secret'] ?? req.query.secret;
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Pull stored LinkedIn auth from Redis
  const auth = await redis.get('linkedin_auth');
  if (!auth) {
    return res.status(400).json({ error: 'No LinkedIn auth stored. Log in through the app first.' });
  }

  if (auth.expires_at && Date.now() > auth.expires_at) {
    return res.status(400).json({ error: 'LinkedIn token expired. Please log in through the app to refresh.' });
  }

  // Pick today's topic (rotates through the list based on day-of-year)
  const dayOfYear = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86400000);
  const topic = TOPICS[dayOfYear % TOPICS.length];

  // Generate post with Claude
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Write a LinkedIn post about: ${topic}`,
      },
    ],
  });

  const postText = message.content[0].text.trim();

  // Post to LinkedIn
  const ugcBody = {
    author: `urn:li:person:${auth.sub}`,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: postText },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };

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
  console.log('Daily post published:', data.id, '| topic:', topic);
  res.json({ success: true, id: data.id, topic });
}

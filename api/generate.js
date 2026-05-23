import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TONE_LABELS = {
  professional: 'professional and authoritative',
  conversational: 'conversational and approachable',
  inspirational: 'inspiring and motivational',
  educational: 'educational and informative',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { mode, text, topic, tone, imageBase64 } = req.body ?? {};

  if (mode === 'update' && !text?.trim()) {
    return res.status(400).json({ error: 'text is required for update mode' });
  }
  if (mode === 'brand' && !topic?.trim()) {
    return res.status(400).json({ error: 'topic is required for brand mode' });
  }

  try {
    const messages =
      mode === 'update'
        ? buildUpdateMessages(text, imageBase64)
        : buildBrandMessages(topic, tone);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages,
    });

    res.json({ post: response.content[0].text.trim() });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: 'Failed to generate post' });
  }
}

function buildUpdateMessages(text, imageBase64) {
  const content = [];

  if (imageBase64) {
    const mimeMatch = imageBase64.match(/^data:([^;]+);base64,/);
    const mediaType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const data = imageBase64.replace(/^data:[^;]+;base64,/, '');

    content.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data },
    });
  }

  content.push({
    type: 'text',
    text: `Write an engaging LinkedIn post based on this update${imageBase64 ? ' and the image' : ''}:

Update: ${text}

Requirements:
- Open with a compelling hook — NOT "I'm excited to..." or "Happy to share..."
- Personal, authentic voice
- Short paragraphs for mobile readability
- Concrete insight or takeaway
- End with a question or call to action
- 150–300 words
- Max 3 relevant hashtags at the end

Return only the post text.`,
  });

  return [{ role: 'user', content }];
}

function buildBrandMessages(topic, tone) {
  const toneLabel = TONE_LABELS[tone] ?? TONE_LABELS.professional;

  return [
    {
      role: 'user',
      content: `Write a thought leadership LinkedIn post on this topic:

Topic: ${topic}
Tone: ${toneLabel}

Requirements:
- Open with a bold, counterintuitive, or thought-provoking statement
- Share a unique perspective or insight
- 2–3 concrete observations or actionable takeaways (use line breaks, not bullet points)
- Short paragraphs for LinkedIn readability
- End with a question to spark discussion
- 200–350 words
- 3–5 relevant hashtags at the end

Return only the post text.`,
    },
  ];
}

export default async function handler(req, res) {
  const results = {};

  // Check env vars present
  results.envVars = {
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    UPSTASH_REDIS_REST_URL: !!process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: !!process.env.UPSTASH_REDIS_REST_TOKEN,
    PEXELS_API_KEY: !!process.env.PEXELS_API_KEY,
  };

  // Test Redis connection
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = Redis.fromEnv();
    const auth = await redis.get('linkedin_auth');
    results.redis = { connected: true, hasAuth: !!auth, authKeys: auth ? Object.keys(auth) : null };
  } catch (err) {
    results.redis = { connected: false, error: err.message };
  }

  res.json(results);
}

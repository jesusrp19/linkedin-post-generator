import { useState, useEffect, useRef } from 'react';
import './App.css';

const TONES = [
  { value: 'professional',   label: '👔 Professional' },
  { value: 'conversational', label: '💬 Conversational' },
  { value: 'inspirational',  label: '🚀 Inspirational' },
  { value: 'educational',    label: '📚 Educational' },
];

const LinkedInIcon = ({ size = 20 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

export default function App() {
  const [auth, setAuth] = useState(null);       // null=loading, false=guest, object=logged in
  const [mode, setMode] = useState('update');   // 'update' | 'brand'
  const [generatedPost, setGeneratedPost] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [postSuccess, setPostSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  // "I Have an Update" mode state
  const [updateText, setUpdateText] = useState('');
  const [image, setImage] = useState(null);   // { base64, preview }

  // "Build My Brand" mode state
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState('professional');

  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchAuthStatus();

    // Surface OAuth errors returned as query params
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('error');
    if (oauthError) {
      setError(`LinkedIn login failed: ${oauthError.replace(/_/g, ' ')}`);
      window.history.replaceState({}, '', '/');
    }
  }, []);

  async function fetchAuthStatus() {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      setAuth(data.authenticated ? data : false);
    } catch {
      setAuth(false);
    }
  }

  async function handleGenerate() {
    setError('');
    setGeneratedPost('');
    setPostSuccess(false);
    setIsGenerating(true);

    try {
      const body =
        mode === 'update'
          ? { mode: 'update', text: updateText, imageBase64: image?.base64 }
          : { mode: 'brand', topic, tone };

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Generation failed');
      setGeneratedPost(data.post);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handlePost() {
    setError('');
    setPostSuccess(false);
    setIsPosting(true);

    try {
      const res = await fetch('/api/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: generatedPost,
          imageBase64: mode === 'update' ? image?.base64 ?? null : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Posting failed');
      setPostSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsPosting(false);
    }
  }

  function handleImageChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) =>
      setImage({ base64: ev.target.result, preview: URL.createObjectURL(file) });
    reader.readAsDataURL(file);
  }

  function removeImage() {
    setImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(generatedPost);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAuth(false);
    setGeneratedPost('');
    setPostSuccess(false);
  }

  function switchMode(next) {
    setMode(next);
    setGeneratedPost('');
    setError('');
    setPostSuccess(false);
  }

  const canGenerate =
    !isGenerating &&
    (mode === 'update' ? updateText.trim().length > 0 : topic.trim().length > 0);

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <LinkedInIcon size={26} />
            <span>Post Generator</span>
          </div>

          <div className="auth-section">
            {auth === null && <span className="loading-text">Checking…</span>}

            {auth === false && (
              <a href="/api/auth/linkedin" className="btn btn-linkedin">
                <LinkedInIcon size={15} />
                Connect LinkedIn
              </a>
            )}

            {auth && (
              <div className="user-info">
                <span className="user-name">Hi, {auth.name?.split(' ')[0]}!</span>
                <button onClick={handleLogout} className="btn btn-secondary btn-sm">
                  Disconnect
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="main">
        {error && (
          <div className="alert alert-error">
            {error}
            <button onClick={() => setError('')} className="alert-close">×</button>
          </div>
        )}

        {/* Input card */}
        <div className="card">
          <div className="mode-tabs">
            <button
              className={`mode-tab ${mode === 'update' ? 'active' : ''}`}
              onClick={() => switchMode('update')}
            >
              📣 I Have an Update
            </button>
            <button
              className={`mode-tab ${mode === 'brand' ? 'active' : ''}`}
              onClick={() => switchMode('brand')}
            >
              💡 Build My Brand
            </button>
          </div>

          {mode === 'update' && (
            <div className="form-section">
              <p className="mode-description">
                Share a milestone, achievement, or news. Add context and an optional photo —
                Claude will craft an authentic post for you.
              </p>

              <div className="form-group">
                <label className="form-label">What's your update? *</label>
                <textarea
                  className="form-textarea"
                  placeholder="e.g. Just wrapped up presenting at our annual conference on AI adoption in mid-size companies. Here's what surprised me most…"
                  value={updateText}
                  onChange={(e) => setUpdateText(e.target.value)}
                  rows={4}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Photo (optional — helps Claude craft a richer post)</label>
                {image ? (
                  <div className="image-preview-container">
                    <img src={image.preview} alt="Preview" className="image-preview" />
                    <button onClick={removeImage} className="image-remove">Remove</button>
                  </div>
                ) : (
                  <div className="upload-zone" onClick={() => fileInputRef.current?.click()}>
                    <span className="upload-icon">📷</span>
                    <span>Click to upload a photo</span>
                    <span className="upload-hint">JPG, PNG or GIF · max 5 MB</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      style={{ display: 'none' }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {mode === 'brand' && (
            <div className="form-section">
              <p className="mode-description">
                Position yourself as a thought leader. Give Claude a topic and it will write an
                insight-driven post that builds your professional brand.
              </p>

              <div className="form-group">
                <label className="form-label">Topic or insight *</label>
                <textarea
                  className="form-textarea"
                  placeholder="e.g. Why most companies fail at digital transformation, The hidden cost of technical debt, What managing remote teams taught me about trust…"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Tone</label>
                <div className="tone-grid">
                  {TONES.map((t) => (
                    <button
                      key={t.value}
                      className={`tone-btn ${tone === t.value ? 'active' : ''}`}
                      onClick={() => setTone(t.value)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="form-actions">
            <button
              className="btn btn-primary btn-lg"
              onClick={handleGenerate}
              disabled={!canGenerate}
            >
              {isGenerating ? (
                <><span className="spinner" /> Generating…</>
              ) : (
                '✨ Generate Post'
              )}
            </button>
          </div>
        </div>

        {/* Result card */}
        {(isGenerating || generatedPost) && (
          <div className="card result-card">
            <h2 className="result-title">Your LinkedIn Post</h2>

            {isGenerating ? (
              <div className="generating-placeholder">
                {[100, 88, 94, 72, 85, 60].map((w, i) => (
                  <div key={i} className="pulse-line" style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : (
              <>
                <textarea
                  className="post-editor"
                  value={generatedPost}
                  onChange={(e) => setGeneratedPost(e.target.value)}
                  rows={10}
                />

                <div className="result-actions">
                  <button className="btn btn-secondary" onClick={handleCopy}>
                    {copied ? '✓ Copied!' : '📋 Copy'}
                  </button>

                  {auth ? (
                    <button
                      className="btn btn-linkedin"
                      onClick={handlePost}
                      disabled={isPosting || postSuccess}
                    >
                      {isPosting ? (
                        <><span className="spinner" /> Posting…</>
                      ) : postSuccess ? (
                        '✓ Posted!'
                      ) : (
                        <><LinkedInIcon size={15} /> Post to LinkedIn</>
                      )}
                    </button>
                  ) : (
                    <a href="/api/auth/linkedin" className="btn btn-linkedin">
                      <LinkedInIcon size={15} />
                      Connect LinkedIn to Post
                    </a>
                  )}
                </div>

                {postSuccess && (
                  <div className="alert alert-success">
                    🎉 Your post is live on LinkedIn!
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      <footer className="footer">
        <p>Powered by Claude AI · Built for LinkedIn creators</p>
      </footer>
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import { AI_MODEL_OPTIONS, generateTemplateText } from '@/lib/ai-clients';

function sanitizeJson(rawText) {
  const clean = rawText
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('No valid JSON was returned by AI.');
  }

  return JSON.parse(clean.slice(start, end + 1));
}

function createEmailHtml({
  heading,
  subheading,
  intro,
  sections,
  bulletPoints,
  ctaText,
  ctaUrl,
  urgencyNote,
  footer,
  imageUrls,
  tone,
}) {
  const paletteByTone = {
    professional: {
      bg: '#f3f6ff',
      card: '#ffffff',
      hero1: '#1d4ed8',
      hero2: '#312e81',
      text: '#0f172a',
      muted: '#475569',
      accent: '#2563eb',
      badge: '#dbeafe',
    },
    friendly: {
      bg: '#f6fff7',
      card: '#ffffff',
      hero1: '#0f766e',
      hero2: '#15803d',
      text: '#052e2b',
      muted: '#3f3f46',
      accent: '#16a34a',
      badge: '#dcfce7',
    },
    excited: {
      bg: '#fff7ed',
      card: '#ffffff',
      hero1: '#c2410c',
      hero2: '#9a3412',
      text: '#431407',
      muted: '#7c2d12',
      accent: '#ea580c',
      badge: '#ffedd5',
    },
    formal: {
      bg: '#f8fafc',
      card: '#ffffff',
      hero1: '#111827',
      hero2: '#1f2937',
      text: '#111827',
      muted: '#4b5563',
      accent: '#1f2937',
      badge: '#e5e7eb',
    },
  };

  const palette = paletteByTone[tone] || paletteByTone.professional;
  const firstImageUrl = imageUrls[0] || '';
  const galleryHtml = imageUrls
    .slice(0, 5)
    .map((url) => `<td class="gallery-col" style="padding:6px;" valign="top"><img src="${url}" alt="Gallery image" style="display:block;width:100%;max-width:190px;height:auto;border-radius:12px;border:1px solid #e2e8f0;" /></td>`)
    .join('');

  const sectionHtml = (Array.isArray(sections) ? sections : [])
    .slice(0, 3)
    .map((section) => `
      <td class="feature-col" valign="top" style="padding:8px;" width="33.33%">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
          <tr>
            <td style="padding:14px 14px 10px;font-size:14px;font-weight:700;color:${palette.text};">${section?.title || 'Key highlight'}</td>
          </tr>
          <tr>
            <td style="padding:0 14px 14px;font-size:13px;line-height:1.6;color:${palette.muted};">${section?.body || ''}</td>
          </tr>
        </table>
      </td>
    `)
    .join('');

  const bulletsHtml = (Array.isArray(bulletPoints) ? bulletPoints : [])
    .slice(0, 5)
    .map((point) => `<li style="margin:0 0 8px;">${point}</li>`)
    .join('');

  return `
    <style>
      @media only screen and (max-width: 640px) {
        .email-shell {
          width: 100% !important;
          max-width: 100% !important;
          border-radius: 0 !important;
          border-left: 0 !important;
          border-right: 0 !important;
        }
        .hero-pad {
          padding-left: 16px !important;
          padding-right: 16px !important;
        }
        .hero-title {
          font-size: 24px !important;
        }
        .content-pad {
          padding-left: 16px !important;
          padding-right: 16px !important;
        }
        .feature-col,
        .gallery-col {
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
        }
        .mobile-center {
          text-align: center !important;
        }
        .mobile-btn {
          display: block !important;
          width: 100% !important;
          box-sizing: border-box !important;
        }
      }
    </style>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${palette.bg};padding:20px 0;font-family:Arial,Helvetica,sans-serif;">
      <tr>
        <td align="center">
          <table class="email-shell" role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;background:${palette.card};border:1px solid #dbe3ef;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:0;background:linear-gradient(135deg, ${palette.hero1}, ${palette.hero2});">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td class="hero-pad" style="padding:28px 28px 8px;color:#ffffff;font-size:12px;letter-spacing:.06em;text-transform:uppercase;font-weight:700;">
                      AI Crafted Email
                    </td>
                  </tr>
                  <tr>
                    <td class="hero-pad hero-title" style="padding:0 28px 6px;color:#ffffff;font-size:30px;line-height:1.2;font-weight:800;">${heading || 'Your headline'}</td>
                  </tr>
                  ${subheading ? `<tr><td class="hero-pad" style="padding:0 28px 28px;color:#dbeafe;font-size:15px;line-height:1.6;">${subheading}</td></tr>` : '<tr><td class="hero-pad" style="padding:0 28px 24px;"></td></tr>'}
                </table>
              </td>
            </tr>

            ${firstImageUrl ? `
              <tr>
                <td style="padding:18px 20px 4px;">
                  <img src="${firstImageUrl}" alt="Main visual" style="display:block;width:100%;height:auto;border-radius:14px;border:1px solid #e2e8f0;" />
                </td>
              </tr>
            ` : ''}

            <tr>
              <td class="content-pad" style="padding:18px 24px 6px;font-size:15px;line-height:1.75;color:${palette.text};">${intro || ''}</td>
            </tr>

            ${sectionHtml ? `
              <tr>
                <td style="padding:6px 16px 8px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>${sectionHtml}</tr>
                  </table>
                </td>
              </tr>
            ` : ''}

            ${bulletsHtml ? `
              <tr>
                <td style="padding:8px 24px 6px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${palette.badge};border-radius:12px;border:1px solid #e2e8f0;">
                    <tr>
                      <td style="padding:14px 16px;font-size:14px;line-height:1.65;color:${palette.text};">
                        <ul style="padding-left:18px;margin:0;">${bulletsHtml}</ul>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            ` : ''}

            <tr>
              <td class="content-pad mobile-center" align="center" style="padding:14px 24px 10px;">
                <a class="mobile-btn" href="${ctaUrl || 'https://example.com'}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:${palette.accent};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:14px;font-weight:700;">${ctaText || 'Learn More'}</a>
              </td>
            </tr>

            ${urgencyNote ? `<tr><td style="padding:0 24px 16px;font-size:13px;color:${palette.muted};text-align:center;">${urgencyNote}</td></tr>` : ''}

            ${galleryHtml ? `
              <tr>
                <td style="padding:6px 14px 12px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>${galleryHtml}</tr>
                  </table>
                </td>
              </tr>
            ` : ''}

            <tr>
              <td style="padding:16px 22px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.65;color:#64748b;text-align:center;">
                ${footer || 'You are receiving this email because you subscribed to updates.'}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

export default function AIComposeDialog({
  open,
  onClose,
  uploadedImages,
  sheetColumns = [],
  onApplyDesign,
}) {
  const [prompt, setPrompt] = useState('');
  const [tone, setTone] = useState('professional');
  const [ctaText, setCtaText] = useState('Learn More');
  const [ctaUrl, setCtaUrl] = useState('https://example.com');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedModelKey, setSelectedModelKey] = useState(AI_MODEL_OPTIONS[0]?.key || 'gemini/gemini-2.5-flash');

  const imageUrls = useMemo(() => uploadedImages.map((img) => img.url).filter(Boolean), [uploadedImages]);

  if (!open) {
    return null;
  }

  const availableTokens = sheetColumns
    .map((column) => String(column || '').trim().toLowerCase())
    .filter(Boolean);

  const appendPromptLine = (line) => {
    setPrompt((prev) => {
      const base = String(prev || '').trim();
      if (!base) {
        return line;
      }
      return `${base}\n${line}`;
    });
  };

  const insertTokenHint = (column, placement = 'body') => {
    const token = `$$$${column}$$$`;
    if (placement === 'subject') {
      appendPromptLine(`Use token ${token} in email subject.`);
      return;
    }
    if (placement === 'greeting') {
      appendPromptLine(`Start body greeting with Dear ${token},`);
      return;
    }
    appendPromptLine(`Use token ${token} naturally in email body.`);
  };

  const addAutoMappingHint = () => {
    if (!availableTokens.length) {
      return;
    }

    const hints = [];
    if (availableTokens.includes('name')) {
      hints.push('Use $$$name$$$ in greeting and first sentence.');
    }
    if (availableTokens.includes('email')) {
      hints.push('Keep $$$email$$$ for contact/recipient reference when needed.');
    }

    availableTokens
      .filter((column) => column.startsWith('attachment') || column.startsWith('certificate'))
      .slice(0, 4)
      .forEach((column) => {
        hints.push(`Mention ${`$$$${column}$$$`} as recipient specific attachment reference.`);
      });

    if (!hints.length) {
      hints.push(`Available sheet tokens: ${availableTokens.map((column) => `$$$${column}$$$`).join(', ')}`);
    }

    appendPromptLine(hints.join(' '));
  };

  const generateAndApply = async () => {
    if (!prompt.trim()) {
      setError('Please describe what kind of email you want.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const aiPrompt = `
You are an email strategist.
Create a BEAUTIFUL designer email layout copy from this request: ${prompt}
Tone: ${tone}
Return strict JSON only with this shape:
{
  "subject": "...",
  "heading": "...",
  "subheading": "...",
  "intro": "...",
  "sections": [
    { "title": "...", "body": "..." },
    { "title": "...", "body": "..." },
    { "title": "...", "body": "..." }
  ],
  "bulletPoints": ["...", "...", "..."],
  "ctaText": "...",
  "urgencyNote": "...",
  "footer": "..."
}
Rules:
- Make it premium, modern, conversion-focused, and visually scannable.
- Keep language clear and polished.
- Intro should be 1 short paragraph.
- Sections must be short, benefit-focused snippets.
- bulletPoints should be concise.
- Plain text only, no markdown, no HTML tags.
- If prompt includes tokens in $$$token$$$ format, preserve token text exactly.
`;

      const text = await generateTemplateText(aiPrompt, selectedModelKey);
      const parsed = sanitizeJson(text);

      const html = createEmailHtml({
        heading: parsed.heading || 'Your message',
        subheading: parsed.subheading || '',
        intro: parsed.intro || '',
        sections: Array.isArray(parsed.sections) ? parsed.sections : [],
        bulletPoints: Array.isArray(parsed.bulletPoints) ? parsed.bulletPoints : [],
        ctaText: parsed.ctaText || ctaText,
        ctaUrl,
        urgencyNote: parsed.urgencyNote || '',
        footer: parsed.footer || '',
        imageUrls,
        tone,
      });

      await onApplyDesign({
        html,
        suggestedSubject: parsed.subject || '',
      });

      onClose();
    } catch (err) {
      setError(err.message || 'Failed to generate AI content.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ai-dialog-backdrop" role="dialog" aria-modal="true" aria-label="AI email assistant">
      <div className="ai-dialog-card">
        <div className="ai-dialog-header">
          <div className="ai-dialog-title-wrap">
            <Sparkles size={18} />
            <h2>AI Email Assistant</h2>
          </div>
          <button type="button" className="ai-dialog-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="ai-dialog-body">
          <label htmlFor="ai-prompt">What should this email be about?</label>
          <textarea
            id="ai-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Example: Write a launch email for our spring sale with urgency and a friendly tone."
            rows={5}
          />

          {availableTokens.length > 0 && (
            <div className="ai-token-box">
              <div className="ai-token-head">
                <span>Sheet personalization tokens</span>
                <button type="button" onClick={addAutoMappingHint}>
                  Add Auto Mapping Hint
                </button>
              </div>
              <div className="ai-token-grid">
                {availableTokens.map((column) => (
                  <div key={column} className="ai-token-chip">
                    <span>{`$$$${column}$$$`}</span>
                    <div>
                      <button type="button" onClick={() => insertTokenHint(column, 'subject')}>S</button>
                      <button type="button" onClick={() => insertTokenHint(column, 'greeting')}>G</button>
                      <button type="button" onClick={() => insertTokenHint(column, 'body')}>B</button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="ai-token-help">S = subject, G = greeting, B = body instruction.</p>
            </div>
          )}

          <div className="ai-dialog-grid">
            <div>
              <label htmlFor="ai-tone">Tone</label>
              <select id="ai-tone" value={tone} onChange={(e) => setTone(e.target.value)}>
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="excited">Excited</option>
                <option value="formal">Formal</option>
              </select>
            </div>
            <div>
              <label htmlFor="ai-cta-text">CTA Text</label>
              <input id="ai-cta-text" value={ctaText} onChange={(e) => setCtaText(e.target.value)} />
            </div>
          </div>

          <div>
            <label htmlFor="ai-model">AI Model</label>
            <select id="ai-model" value={selectedModelKey} onChange={(e) => setSelectedModelKey(e.target.value)}>
              {AI_MODEL_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="ai-cta-url">CTA URL</label>
            <input id="ai-cta-url" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} />
          </div>

          <p className="ai-dialog-note">
            {uploadedImages.length
              ? `${uploadedImages.length} uploaded image(s) will be added to the email layout.`
              : 'Upload images from the paperclip button to include them in the generated layout.'}
          </p>

          {error && <p className="ai-dialog-error">{error}</p>}
        </div>

        <div className="ai-dialog-actions">
          <button type="button" className="ai-dialog-btn ai-dialog-btn--ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button type="button" className="ai-dialog-btn ai-dialog-btn--primary" onClick={generateAndApply} disabled={loading}>
            {loading ? <Loader2 size={16} className="ai-spin" /> : <Sparkles size={16} />}
            <span>{loading ? 'Generating...' : 'Generate & Apply'}</span>
          </button>
        </div>
      </div>

      <style jsx>{`
        .ai-dialog-backdrop {
          position: fixed;
          inset: 0;
          z-index: 120;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: rgba(3, 7, 18, 0.7);
          backdrop-filter: blur(8px);
        }

        .ai-dialog-card {
          width: min(760px, 100%);
          border-radius: 16px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: #0f172a;
          color: #e2e8f0;
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.45);
          overflow: hidden;
        }

        .ai-dialog-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.95rem 1rem;
          border-bottom: 1px solid rgba(148, 163, 184, 0.18);
          background: linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95));
        }

        .ai-dialog-title-wrap {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
        }

        .ai-dialog-title-wrap h2 {
          margin: 0;
          font-size: 1rem;
          font-weight: 700;
        }

        .ai-dialog-close {
          border: none;
          background: transparent;
          color: #94a3b8;
          cursor: pointer;
          display: inline-flex;
          border-radius: 8px;
          padding: 0.25rem;
        }

        .ai-dialog-close:hover {
          color: #e2e8f0;
          background: rgba(148, 163, 184, 0.14);
        }

        .ai-dialog-body {
          padding: 1rem;
          display: grid;
          gap: 0.8rem;
        }

        .ai-dialog-body label {
          display: block;
          font-size: 0.76rem;
          font-weight: 600;
          color: #94a3b8;
          margin-bottom: 0.3rem;
        }

        .ai-dialog-body textarea,
        .ai-dialog-body input,
        .ai-dialog-body select {
          width: 100%;
          border: 1px solid rgba(148, 163, 184, 0.28);
          border-radius: 10px;
          background: #020617;
          color: #e2e8f0;
          padding: 0.65rem 0.75rem;
          outline: none;
          font: inherit;
          transition: border-color 0.2s ease;
        }

        .ai-dialog-body textarea:focus,
        .ai-dialog-body input:focus,
        .ai-dialog-body select:focus {
          border-color: #6366f1;
        }

        .ai-dialog-grid {
          display: grid;
          gap: 0.8rem;
          grid-template-columns: 1fr 1fr;
        }

        .ai-dialog-note {
          margin: 0;
          font-size: 0.76rem;
          color: #94a3b8;
        }

        .ai-token-box {
          border: 1px solid rgba(148, 163, 184, 0.28);
          border-radius: 10px;
          padding: 0.6rem;
          background: rgba(15, 23, 42, 0.5);
          display: grid;
          gap: 0.5rem;
        }

        .ai-token-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
        }

        .ai-token-head span {
          font-size: 0.74rem;
          font-weight: 700;
          color: #bfdbfe;
        }

        .ai-token-head button {
          border: 1px solid rgba(56, 189, 248, 0.45);
          border-radius: 8px;
          background: rgba(56, 189, 248, 0.14);
          color: #bae6fd;
          font-size: 0.68rem;
          font-weight: 600;
          padding: 0.3rem 0.5rem;
          cursor: pointer;
        }

        .ai-token-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
          gap: 0.4rem;
        }

        .ai-token-chip {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.4rem;
          border-radius: 8px;
          border: 1px solid rgba(99, 102, 241, 0.35);
          background: rgba(99, 102, 241, 0.16);
          padding: 0.35rem 0.45rem;
        }

        .ai-token-chip span {
          font-size: 0.72rem;
          color: #c7d2fe;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ai-token-chip div {
          display: inline-flex;
          gap: 0.25rem;
        }

        .ai-token-chip button {
          border: 1px solid rgba(148, 163, 184, 0.4);
          border-radius: 6px;
          background: rgba(2, 6, 23, 0.75);
          color: #dbeafe;
          font-size: 0.64rem;
          font-weight: 700;
          width: 1.45rem;
          height: 1.4rem;
          cursor: pointer;
        }

        .ai-token-help {
          margin: 0;
          font-size: 0.68rem;
          color: #93c5fd;
        }

        .ai-dialog-error {
          margin: 0;
          font-size: 0.78rem;
          color: #fca5a5;
        }

        .ai-dialog-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          padding: 0.8rem 1rem 1rem;
          border-top: 1px solid rgba(148, 163, 184, 0.18);
        }

        .ai-dialog-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          border-radius: 10px;
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid transparent;
          padding: 0.55rem 0.8rem;
        }

        .ai-dialog-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .ai-dialog-btn--ghost {
          color: #cbd5e1;
          background: rgba(15, 23, 42, 0.45);
          border-color: rgba(148, 163, 184, 0.3);
        }

        .ai-dialog-btn--ghost:hover:not(:disabled) {
          background: rgba(30, 41, 59, 0.75);
        }

        .ai-dialog-btn--primary {
          color: #ffffff;
          background: linear-gradient(135deg, #4f46e5, #7c3aed);
          box-shadow: 0 8px 20px rgba(99, 102, 241, 0.35);
        }

        .ai-dialog-btn--primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 12px 22px rgba(99, 102, 241, 0.45);
        }

        .ai-spin {
          animation: aiSpin 1s linear infinite;
        }

        @keyframes aiSpin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 640px) {
          .ai-dialog-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

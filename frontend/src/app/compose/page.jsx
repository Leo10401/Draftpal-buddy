'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import Header from '@/components/Header';
import ComposeEmailEditor from '@/components/compose-email-editor';
import AIComposeDialog from '@/components/ai-compose-dialog';
import { generateTemplateText } from '@/lib/ai-clients';
import axios from 'axios';
import {
  Send,
  Mail,
  User,
  FileText,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  Paperclip,
  Loader2,
  MailPlus,
  ImagePlus,
  Trash2,
} from 'lucide-react';

const CLOUDINARY_CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

async function uploadImageToCloudinary(file) {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    throw new Error('Cloudinary is not configured. Please set cloud name and upload preset.');
  }

  const payload = new FormData();
  payload.append('file', file);
  payload.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: payload,
  });

  const data = await response.json();
  if (!response.ok || !data?.secure_url) {
    throw new Error(data?.error?.message || `Cloudinary upload failed for ${file.name}.`);
  }

  return data.secure_url;
}

function parseAIJson(rawText) {
  const input = String(rawText || '').trim();
  if (!input) {
    return null;
  }

  try {
    return JSON.parse(input);
  } catch {
    const match = input.match(/```json\s*([\s\S]*?)```/i) || input.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }
    const candidate = match[1] || match[0];
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
}

export default function ComposePage() {
  const { data: session, status } = useSession();
  const loading = status === 'loading';
  const user = session?.user;
  const router = useRouter();

  const [formData, setFormData] = useState({ to: '', subject: '', body: '' });
  const [statusMsg, setStatusMsg] = useState({ type: '', message: '' });
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [activeField, setActiveField] = useState(null);
  const [charCount, setCharCount] = useState(0);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [isAIDialogOpen, setIsAIDialogOpen] = useState(false);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [isDraggingImages, setIsDraggingImages] = useState(false);
  const [sendMode, setSendMode] = useState('single');
  const [sheetLink, setSheetLink] = useState('');
  const [isPreviewingSheet, setIsPreviewingSheet] = useState(false);
  const [sheetPreview, setSheetPreview] = useState(null);
  const [selectedRowNumbers, setSelectedRowNumbers] = useState([]);
  const [sheetSendResult, setSheetSendResult] = useState(null);
  const [isSuggestingTokens, setIsSuggestingTokens] = useState(false);
  const [tokenSuggestion, setTokenSuggestion] = useState(null);

  const imageInputRef = useRef(null);
  const emailEditorRef = useRef(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleEditorContentChange = ({ html, text }) => {
    setFormData((prev) => ({ ...prev, body: html }));
    setCharCount(text.length);
  };

  const processImageFiles = async (files) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (!imageFiles.length) {
      setStatusMsg({ type: 'error', message: 'Please select image files only.' });
      return;
    }

    setStatusMsg({ type: 'success', message: `Uploading ${imageFiles.length} image${imageFiles.length > 1 ? 's' : ''} to Cloudinary...` });

    const prepared = await Promise.all(
      imageFiles.map(async (file) => {
        const url = await uploadImageToCloudinary(file);
        return {
          id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          name: file.name,
          sizeLabel: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
          url,
        };
      })
    );

    setUploadedImages((prev) => [...prev, ...prepared]);
    setStatusMsg({
      type: 'success',
      message: `${prepared.length} image${prepared.length > 1 ? 's' : ''} uploaded. First image URL is now available for editor HTML.`,
    });
  };

  const handleImageUpload = async (event) => {
    const selected = Array.from(event.target.files || []);
    if (!selected.length) {
      return;
    }

    try {
      await processImageFiles(selected);
    } catch (error) {
      setStatusMsg({ type: 'error', message: error.message || 'Could not process selected images.' });
    } finally {
      event.target.value = '';
    }
  };

  const handleDropImages = async (event) => {
    event.preventDefault();
    setIsDraggingImages(false);

    const selected = Array.from(event.dataTransfer?.files || []);
    if (!selected.length) {
      return;
    }

    try {
      await processImageFiles(selected);
    } catch (error) {
      setStatusMsg({ type: 'error', message: error.message || 'Could not upload dropped files.' });
    }
  };

  const removeUploadedImage = (id) => {
    setUploadedImages((prev) => prev.filter((item) => item.id !== id));
  };

  const applyAIDesign = async ({ html, suggestedSubject }) => {
    try {
      await emailEditorRef.current?.applyGeneratedContent(html || '');
      if (suggestedSubject) {
        setFormData((prev) => ({ ...prev, subject: suggestedSubject }));
      }
      setStatusMsg({ type: 'success', message: 'AI content applied to editor.' });
    } catch (error) {
      setStatusMsg({ type: 'error', message: error?.message || 'Could not apply AI content to editor.' });
    }
  };

  const exportEditorTemplate = async () => {
    if (!isEditorReady || !emailEditorRef.current) {
      throw new Error('Editor is still loading. Please wait a moment and try again.');
    }
    return emailEditorRef.current.exportHtml();
  };

  const handlePreviewSheet = async () => {
    if (!sheetLink.trim()) {
      setStatusMsg({ type: 'error', message: 'Please provide a Google Sheet link first.' });
      return;
    }

    setIsPreviewingSheet(true);
    setStatusMsg({ type: '', message: '' });

    try {
      const exportedBody = await exportEditorTemplate();
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/email/sheet-preview`,
        {
          sheetLink: sheetLink.trim(),
          subjectTemplate: formData.subject,
          bodyTemplate: exportedBody.html,
          userId: session?.user?.id,
        },
        { withCredentials: true }
      );

      setSheetPreview(response.data.preview || null);
      const previewRecipients = response.data.preview?.recipients || [];
      setSelectedRowNumbers(previewRecipients.map((recipient) => recipient.rowNumber));
      setSheetSendResult(null);
      setTokenSuggestion(null);
      setStatusMsg({
        type: 'success',
        message: `Sheet preview ready: ${response.data.preview?.validRecipients || 0} valid recipient(s), ${response.data.preview?.invalidRecipients || 0} invalid row(s).`,
      });
    } catch (error) {
      setSheetPreview(null);
      setSelectedRowNumbers([]);
      setStatusMsg({
        type: 'error',
        message: error.response?.data?.message || 'Unable to preview this sheet. Check sharing/link format and try again.',
      });
    } finally {
      setIsPreviewingSheet(false);
    }
  };

  const resetComposer = () => {
    setFormData({ to: '', subject: '', body: '' });
    setCharCount(0);
    setUploadedImages([]);
    setSheetLink('');
    setSheetPreview(null);
    setSelectedRowNumbers([]);
    setSheetSendResult(null);
    setTokenSuggestion(null);
    emailEditorRef.current?.clear();
    setStatusMsg({ type: '', message: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    let exportedBody;
    try {
      exportedBody = await exportEditorTemplate();
    } catch (error) {
      setStatusMsg({
        type: 'error',
        message: error?.message || 'Unable to read email content from the editor. Please try again.',
      });
      return;
    }

    if (!formData.subject || !exportedBody.text) {
      setStatusMsg({
        type: 'error',
        message: 'Please fill in subject and message before sending.',
      });
      return;
    }

    if (sendMode === 'single' && !formData.to) {
      setStatusMsg({ type: 'error', message: 'Please provide a recipient email.' });
      return;
    }

    if (sendMode === 'sheet' && !sheetLink.trim()) {
      setStatusMsg({ type: 'error', message: 'Please provide a Google Sheet link for bulk send mode.' });
      return;
    }

    const hasPreviewRecipients = Array.isArray(sheetPreview?.recipients) && sheetPreview.recipients.length > 0;
    if (sendMode === 'sheet' && hasPreviewRecipients && selectedRowNumbers.length === 0) {
      setStatusMsg({ type: 'error', message: 'Please select at least one recipient to send.' });
      return;
    }

    setIsSending(true);
    setStatusMsg({ type: '', message: '' });
    setSendSuccess(false);
    setSheetSendResult(null);

    try {
      const endpoint = sendMode === 'sheet' ? '/api/email/sheet-send' : '/api/email/send';
      const payload =
        sendMode === 'sheet'
          ? {
              sheetLink: sheetLink.trim(),
              subjectTemplate: formData.subject,
              bodyTemplate: exportedBody.html,
              ...(hasPreviewRecipients ? { selectedRowNumbers } : {}),
              userId: session?.user?.id,
            }
          : {
              ...formData,
              body: exportedBody.html,
              userId: session?.user?.id,
            };

      const response = await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_URL}${endpoint}`, payload, { withCredentials: true });

      if (response.data.success) {
        setSendSuccess(true);
        if (sendMode === 'sheet') {
          setSheetSendResult(response.data);
          setStatusMsg({
            type: 'success',
            message: `Campaign finished: ${response.data.summary?.sent || 0} sent, ${response.data.summary?.failed || 0} failed, ${response.data.summary?.skipped || 0} skipped.`,
          });
        } else {
          setStatusMsg({ type: 'success', message: 'Email sent successfully.' });

          setTimeout(() => {
            resetComposer();
            setSendSuccess(false);
          }, 2500);
        }
      } else if (sendMode === 'sheet') {
        setSheetSendResult(response.data);
        setStatusMsg({ type: 'error', message: response.data.message || 'Bulk send completed with errors.' });
      }
    } catch (error) {
      setStatusMsg({
        type: 'error',
        message: error.response?.data?.message || 'Failed to send email. Please try again.',
      });
    } finally {
      setIsSending(false);
    }
  };

  const dismissStatus = () => {
    setStatusMsg({ type: '', message: '' });
  };

  const getTokenFromColumn = (column) => `$$$${String(column || '').toLowerCase()}$$$`;
  const previewRecipients = Array.isArray(sheetPreview?.recipients) && sheetPreview.recipients.length
    ? sheetPreview.recipients
    : Array.isArray(sheetPreview?.sampleRecipients)
      ? sheetPreview.sampleRecipients
      : [];
  const selectedRowSet = useMemo(() => new Set(selectedRowNumbers), [selectedRowNumbers]);

  const insertTokenToSubject = (column) => {
    const token = getTokenFromColumn(column);
    setFormData((prev) => {
      const nextSubject = prev.subject?.includes(token) ? prev.subject : `${prev.subject}${prev.subject ? ' ' : ''}${token}`;
      return { ...prev, subject: nextSubject };
    });
  };

  const insertTokenToBody = async (column) => {
    const token = getTokenFromColumn(column);
    try {
      const exported = await exportEditorTemplate();
      if (String(exported.html || '').includes(token)) {
        return;
      }
      const mergedHtml = `<p style="margin:0 0 12px;color:#0f172a;font-size:16px;">${token}</p>${exported.html}`;
      await emailEditorRef.current?.applyGeneratedContent(mergedHtml);
      setStatusMsg({ type: 'success', message: `Inserted ${token} into message body.` });
    } catch (error) {
      setStatusMsg({ type: 'error', message: error?.message || 'Could not insert token into body.' });
    }
  };

  const applyTokenSuggestion = async () => {
    if (!tokenSuggestion) {
      return;
    }

    try {
      if (tokenSuggestion.subjectSuggestion) {
        setFormData((prev) => ({ ...prev, subject: tokenSuggestion.subjectSuggestion }));
      }

      if (tokenSuggestion.bodyLeadHtml) {
        const exported = await exportEditorTemplate();
        const mergedHtml = `${tokenSuggestion.bodyLeadHtml}${exported.html}`;
        await emailEditorRef.current?.applyGeneratedContent(mergedHtml);
      }

      setStatusMsg({ type: 'success', message: 'AI token suggestion applied to subject and body.' });
    } catch (error) {
      setStatusMsg({ type: 'error', message: error?.message || 'Could not apply AI suggestion.' });
    }
  };

  const handleSuggestTokenPlacement = async () => {
    if (!sheetPreview?.columns?.length) {
      setStatusMsg({ type: 'error', message: 'Preview recipients first so columns are available for AI suggestions.' });
      return;
    }

    setIsSuggestingTokens(true);
    setStatusMsg({ type: '', message: '' });

    try {
      const exported = await exportEditorTemplate();
      const prompt = [
        'You are helping personalize an email template from sheet columns.',
        `Available columns: ${sheetPreview.columns.join(', ')}`,
        `Current subject: ${formData.subject || ''}`,
        `Current body text: ${exported.text || ''}`,
        'Return JSON only with this schema:',
        '{"subjectSuggestion":"...","bodyLeadHtml":"...","explanation":"..."}',
        'Rules:',
        '- Use $$$column$$$ syntax only.',
        '- Always include $$$name$$$ in greeting if name column exists.',
        '- Keep bodyLeadHtml short (1-3 lines) and valid HTML.',
      ].join('\n');

      const generatedText = await generateTemplateText(prompt);
      const parsed = parseAIJson(generatedText);

      if (!parsed || (!parsed.subjectSuggestion && !parsed.bodyLeadHtml)) {
        throw new Error('AI response could not be parsed into a valid suggestion.');
      }

      setTokenSuggestion({
        subjectSuggestion: String(parsed.subjectSuggestion || '').trim(),
        bodyLeadHtml: String(parsed.bodyLeadHtml || '').trim(),
        explanation: String(parsed.explanation || '').trim(),
      });
      setStatusMsg({ type: 'success', message: 'AI generated token placement suggestions. Review and apply if you like.' });
    } catch (error) {
      setTokenSuggestion(null);
      setStatusMsg({ type: 'error', message: error?.message || 'Could not generate AI token suggestions.' });
    } finally {
      setIsSuggestingTokens(false);
    }
  };

  const isFormValid = sendMode === 'sheet' ? sheetLink.trim() && formData.subject && isEditorReady : formData.to && formData.subject && isEditorReady;

  if (loading || !user) {
    return (
      <div className="compose-loading">
        <div className="compose-loading-spinner">
          <div className="compose-loading-ring"></div>
          <Mail className="compose-loading-icon" />
        </div>
        <p className="compose-loading-text">Loading your workspace...</p>
      </div>
    );
  }

  return (
    <div className="compose-page">
      <Header />

      <main className="compose-main">
        <div className="compose-page-header">
          <div className="compose-page-header-content">
            <div className="compose-page-title-group">
              <div className="compose-page-icon">
                <MailPlus />
              </div>
              <div>
                <h1 className="compose-page-title">Email Studio</h1>
                <p className="compose-page-subtitle">Compose with drag-and-drop editor, AI assist, and multi-image upload.</p>
              </div>
            </div>

            <button className="compose-ai-trigger" onClick={() => setIsAIDialogOpen(true)} type="button">
              <Sparkles size={16} />
              <span>Open AI Assistant</span>
            </button>
          </div>
        </div>

        <div className="compose-layout compose-layout--full">
          <div className="compose-editor-panel">
            <div className="compose-card">
              <div className="compose-card-header">
                <div className="compose-card-header-left">
                  <div className="compose-card-header-dot compose-card-header-dot--red"></div>
                  <div className="compose-card-header-dot compose-card-header-dot--yellow"></div>
                  <div className="compose-card-header-dot compose-card-header-dot--green"></div>
                </div>
                <span className="compose-card-header-title">New Message</span>
                <div className="compose-card-header-right">
                  {user?.image && <Image src={user.image} alt="User avatar" width={22} height={22} className="compose-card-avatar" />}
                  <span className="compose-card-sender">{user?.email}</span>
                </div>
              </div>

              {statusMsg.message && (
                <div className={`compose-toast ${statusMsg.type === 'success' ? 'compose-toast--success' : 'compose-toast--error'} compose-toast--visible`}>
                  <div className="compose-toast-content">
                    {statusMsg.type === 'success' ? (
                      <CheckCircle2 size={18} className="compose-toast-icon" />
                    ) : (
                      <AlertCircle size={18} className="compose-toast-icon" />
                    )}
                    <span>{statusMsg.message}</span>
                  </div>
                  <button onClick={dismissStatus} className="compose-toast-close" type="button">
                    <X size={16} />
                  </button>
                </div>
              )}

              {sendSuccess && (
                <div className="compose-success-overlay">
                  <div className="compose-success-animation">
                    <CheckCircle2 size={48} />
                    <p>Email Sent!</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="compose-form">
                <div className="compose-mode-switch">
                  <button
                    type="button"
                    className={`compose-mode-btn ${sendMode === 'single' ? 'compose-mode-btn--active' : ''}`}
                    onClick={() => setSendMode('single')}
                  >
                    Single Email
                  </button>
                  <button
                    type="button"
                    className={`compose-mode-btn ${sendMode === 'sheet' ? 'compose-mode-btn--active' : ''}`}
                    onClick={() => setSendMode('sheet')}
                  >
                    Sheet Campaign
                  </button>
                </div>

                <div className="compose-divider"></div>

                {sendMode === 'single' ? (
                  <>
                    <div className={`compose-field ${activeField === 'to' ? 'compose-field--active' : ''}`}>
                      <div className="compose-field-label">
                        <User size={14} className="compose-field-icon" />
                        <label htmlFor="compose-to">To</label>
                      </div>
                      <input
                        type="email"
                        id="compose-to"
                        name="to"
                        value={formData.to}
                        onChange={handleChange}
                        onFocus={() => setActiveField('to')}
                        onBlur={() => setActiveField(null)}
                        className="compose-input"
                        placeholder="recipient@example.com"
                        autoComplete="email"
                      />
                    </div>

                    <div className="compose-divider"></div>
                  </>
                ) : (
                  <>
                    <div className="compose-sheet-panel">
                      <div className="compose-sheet-header">
                        <span className="compose-sheet-title">Google Sheet Campaign</span>
                        <div className="compose-sheet-header-actions">
                          <button
                            type="button"
                            className="compose-sheet-preview-btn"
                            onClick={handlePreviewSheet}
                            disabled={isPreviewingSheet || !sheetLink.trim() || !isEditorReady}
                          >
                            {isPreviewingSheet ? 'Previewing...' : 'Preview Recipients'}
                          </button>
                          <button
                            type="button"
                            className="compose-sheet-preview-btn compose-sheet-preview-btn--ghost"
                            onClick={handleSuggestTokenPlacement}
                            disabled={isSuggestingTokens || !sheetPreview?.columns?.length || !isEditorReady}
                          >
                            {isSuggestingTokens ? 'Thinking...' : 'AI Suggest Tokens'}
                          </button>
                        </div>
                      </div>
                      <input
                        type="url"
                        value={sheetLink}
                        onChange={(event) => setSheetLink(event.target.value)}
                        className="compose-sheet-input"
                        placeholder="Paste Google Sheet link (shared as CSV/public)"
                      />
                      <p className="compose-sheet-hint">
                        Use tokens like $$$name$$$ or $$$email$$$ in subject/body. For attachments use columns like attachment_1, attachment_2 with file URLs.
                      </p>
                    </div>

                    <div className="compose-divider"></div>
                  </>
                )}

                <div className={`compose-field ${activeField === 'subject' ? 'compose-field--active' : ''}`}>
                  <div className="compose-field-label">
                    <FileText size={14} className="compose-field-icon" />
                    <label htmlFor="compose-subject">Subject</label>
                  </div>
                  <input
                    type="text"
                    id="compose-subject"
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    onFocus={() => setActiveField('subject')}
                    onBlur={() => setActiveField(null)}
                    className="compose-input"
                    placeholder="What is this email about?"
                  />
                </div>

                <div className="compose-divider"></div>

                <div
                  className={`compose-body-wrapper ${activeField === 'body' ? 'compose-body-wrapper--active' : ''} ${isDraggingImages ? 'compose-body-wrapper--dragging' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingImages(true);
                  }}
                  onDragLeave={() => setIsDraggingImages(false)}
                  onDrop={handleDropImages}
                >
                  <div className="compose-field-label compose-body-label">
                    <MessageSquare size={14} className="compose-field-icon" />
                    <label htmlFor="compose-body">Message</label>
                    <span className="compose-char-count">{charCount} chars</span>
                  </div>

                  {uploadedImages.length > 0 && (
                    <div className="compose-uploaded-images">
                      {uploadedImages.map((item) => (
                        <div key={item.id} className="compose-image-chip">
                          <ImagePlus size={13} />
                          <span>{item.name}</span>
                          <small>{item.sizeLabel}</small>
                          <a href={item.url} target="_blank" rel="noreferrer" className="compose-image-chip-link">
                            URL
                          </a>
                          <button type="button" onClick={() => removeUploadedImage(item.id)} aria-label={`Remove ${item.name}`}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <ComposeEmailEditor
                    ref={emailEditorRef}
                    onReady={() => setIsEditorReady(true)}
                    onContentChange={handleEditorContentChange}
                    onFocus={() => setActiveField('body')}
                    onBlur={() => setActiveField(null)}
                  />

                  <p className="compose-drop-hint">Tip: drag and drop images here or use the paperclip. AI assistant will place uploaded Cloudinary URLs into editor HTML.</p>
                </div>

                <div className="compose-actions">
                  <div className="compose-actions-left">
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageUpload}
                      className="compose-hidden-input"
                    />

                    <button
                      type="button"
                      className="compose-action-btn"
                      title="Upload images"
                      onClick={() => imageInputRef.current?.click()}
                    >
                      <Paperclip size={18} />
                    </button>

                    <button
                      type="button"
                      className="compose-action-btn"
                      title="AI assistant"
                      onClick={() => setIsAIDialogOpen(true)}
                    >
                      <Sparkles size={18} />
                    </button>
                  </div>

                  <div className="compose-actions-right">
                    <button type="button" onClick={resetComposer} className="compose-discard-btn">
                      Discard
                    </button>
                    <button
                      type="submit"
                      disabled={isSending || !isFormValid}
                      className={`compose-send-btn ${isSending ? 'compose-send-btn--sending' : ''} ${!isFormValid ? 'compose-send-btn--disabled' : ''}`}
                    >
                      {isSending ? (
                        <>
                          <Loader2 size={18} className="compose-send-spinner" />
                          <span>{sendMode === 'sheet' ? 'Sending Campaign...' : 'Sending...'}</span>
                        </>
                      ) : (
                        <>
                          <Send size={18} />
                          <span>{sendMode === 'sheet' ? 'Send Campaign' : 'Send Email'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {sendMode === 'sheet' && sheetPreview && (
                  <div className="compose-sheet-preview">
                    <div className="compose-sheet-preview-head">
                      <h3>Sheet Preview</h3>
                      <span>
                        {sheetPreview.validRecipients} valid / {sheetPreview.invalidRecipients} invalid
                      </span>
                    </div>

                    {Array.isArray(sheetPreview.recipients) && sheetPreview.recipients.length > 0 && (
                      <div className="compose-recipient-controls">
                        <p>
                          Selected recipients: <strong>{selectedRowNumbers.length}</strong> / {sheetPreview.recipients.length}
                        </p>
                        <div className="compose-recipient-actions">
                          <button
                            type="button"
                            className="compose-sheet-preview-btn compose-sheet-preview-btn--ghost"
                            onClick={() => setSelectedRowNumbers(sheetPreview.recipients.map((item) => item.rowNumber))}
                          >
                            Select all
                          </button>
                          <button
                            type="button"
                            className="compose-sheet-preview-btn compose-sheet-preview-btn--ghost"
                            onClick={() => setSelectedRowNumbers([])}
                          >
                            Clear all
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="compose-sheet-stats">
                      <p>Total rows: {sheetPreview.totalRows}</p>
                      <p>Email column: {sheetPreview.emailColumn}</p>
                      <p>Attachment columns: {sheetPreview.attachmentColumns?.length || 0}</p>
                    </div>

                    {Array.isArray(sheetPreview.columns) && sheetPreview.columns.length > 0 && (
                      <div className="compose-token-panel">
                        <p className="compose-token-title">Insert sheet columns into template</p>
                        <div className="compose-token-grid">
                          {sheetPreview.columns.map((column) => (
                            <div key={column} className="compose-token-chip">
                              <span>{getTokenFromColumn(column)}</span>
                              <div>
                                <button type="button" onClick={() => insertTokenToSubject(column)}>
                                  Subject
                                </button>
                                <button type="button" onClick={() => insertTokenToBody(column)}>
                                  Body
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {tokenSuggestion && (
                      <div className="compose-token-suggestion">
                        <p className="compose-token-title">AI placement suggestion</p>
                        {tokenSuggestion.subjectSuggestion && <p><strong>Subject:</strong> {tokenSuggestion.subjectSuggestion}</p>}
                        {tokenSuggestion.bodyLeadHtml && <p><strong>Body lead:</strong> {tokenSuggestion.bodyLeadHtml}</p>}
                        {tokenSuggestion.explanation && <p>{tokenSuggestion.explanation}</p>}
                        <button type="button" className="compose-sheet-preview-btn" onClick={applyTokenSuggestion}>
                          Apply Suggestion
                        </button>
                      </div>
                    )}

                    {Array.isArray(sheetPreview.missingTokenColumns) && sheetPreview.missingTokenColumns.length > 0 && (
                      <p className="compose-sheet-warning">Missing token columns: {sheetPreview.missingTokenColumns.join(', ')}</p>
                    )}

                    {previewRecipients.length > 0 && (
                      <div className="compose-sheet-table-wrap">
                        <table className="compose-sheet-table">
                          <thead>
                            <tr>
                              <th>Send</th>
                              <th>Row</th>
                              <th>Email</th>
                              <th>Name</th>
                              <th>Attachments</th>
                            </tr>
                          </thead>
                          <tbody>
                            {previewRecipients.map((row) => (
                              <tr key={`${row.rowNumber}-${row.email}`}>
                                <td>
                                  <input
                                    type="checkbox"
                                    checked={selectedRowSet.has(row.rowNumber)}
                                    onChange={(event) => {
                                      setSelectedRowNumbers((prev) => {
                                        if (event.target.checked) {
                                          if (prev.includes(row.rowNumber)) {
                                            return prev;
                                          }
                                          return [...prev, row.rowNumber];
                                        }
                                        return prev.filter((value) => value !== row.rowNumber);
                                      });
                                    }}
                                  />
                                </td>
                                <td>{row.rowNumber}</td>
                                <td>{row.email}</td>
                                <td>{row.name || '-'}</td>
                                <td>{row.attachmentCount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {sendMode === 'sheet' && sheetSendResult?.summary && (
                  <div className="compose-sheet-result">
                    <h3>Campaign Result</h3>
                    <p>
                      Sent: {sheetSendResult.summary.sent} | Failed: {sheetSendResult.summary.failed} | Skipped: {sheetSendResult.summary.skipped}
                    </p>
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      </main>

      <AIComposeDialog
        open={isAIDialogOpen}
        onClose={() => setIsAIDialogOpen(false)}
        uploadedImages={uploadedImages}
        sheetColumns={sendMode === 'sheet' ? sheetPreview?.columns || [] : []}
        onApplyDesign={applyAIDesign}
      />

      <style jsx>{`
        .compose-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 30%, #16213e 60%, #0f0f1a 100%);
          color: #e4e4e7;
        }

        .compose-loading {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #0f0f1a 100%);
          gap: 1.5rem;
        }

        .compose-loading-spinner {
          position: relative;
          width: 64px;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .compose-loading-ring {
          position: absolute;
          inset: 0;
          border: 3px solid transparent;
          border-top-color: #818cf8;
          border-radius: 50%;
          animation: composeSpin 1s linear infinite;
        }

        .compose-loading-icon {
          width: 24px;
          height: 24px;
          color: #818cf8;
        }

        .compose-loading-text {
          color: #a1a1aa;
          font-size: 0.875rem;
          letter-spacing: 0.05em;
        }

        @keyframes composeSpin {
          to {
            transform: rotate(360deg);
          }
        }

        .compose-main {
          max-width: 1100px;
          margin: 0 auto;
          padding: 1.5rem;
        }

        .compose-page-header {
          margin-bottom: 1.25rem;
        }

        .compose-page-header-content {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .compose-page-title-group {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .compose-page-icon {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          box-shadow: 0 8px 24px rgba(99, 102, 241, 0.3);
        }

        .compose-page-icon :global(svg) {
          width: 24px;
          height: 24px;
        }

        .compose-page-title {
          font-size: 1.75rem;
          font-weight: 700;
          background: linear-gradient(135deg, #e4e4e7, #a1a1aa);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0;
          line-height: 1.2;
        }

        .compose-page-subtitle {
          color: #71717a;
          font-size: 0.875rem;
          margin: 0.15rem 0 0;
        }

        .compose-ai-trigger {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.625rem 1rem;
          border-radius: 10px;
          border: 1px solid rgba(99, 102, 241, 0.35);
          background: rgba(99, 102, 241, 0.12);
          color: #a5b4fc;
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .compose-ai-trigger:hover {
          background: rgba(99, 102, 241, 0.2);
          border-color: rgba(99, 102, 241, 0.55);
          transform: translateY(-1px);
        }

        .compose-layout {
          display: grid;
          gap: 1.5rem;
          align-items: start;
        }

        .compose-layout--full {
          grid-template-columns: 1fr;
        }

        .compose-editor-panel {
          animation: composeSlideUp 0.35s ease;
        }

        @keyframes composeSlideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .compose-card {
          border-radius: 16px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(20px);
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1), 0 20px 50px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05);
          position: relative;
        }

        .compose-card-header {
          display: flex;
          align-items: center;
          padding: 0.875rem 1.25rem;
          background: rgba(255, 255, 255, 0.03);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          gap: 0.75rem;
        }

        .compose-card-header-left {
          display: flex;
          gap: 6px;
        }

        .compose-card-header-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }

        .compose-card-header-dot--red {
          background: #ef4444;
        }

        .compose-card-header-dot--yellow {
          background: #eab308;
        }

        .compose-card-header-dot--green {
          background: #22c55e;
        }

        .compose-card-header-title {
          font-size: 0.8125rem;
          font-weight: 600;
          color: #a1a1aa;
          flex: 1;
          text-align: center;
        }

        .compose-card-header-right {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .compose-card-avatar {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          border: 1.5px solid rgba(99, 102, 241, 0.4);
        }

        .compose-card-sender {
          font-size: 0.75rem;
          color: #71717a;
          max-width: 190px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .compose-toast {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1.25rem;
          margin: 0.75rem 1.25rem;
          border-radius: 10px;
          animation: composeToastIn 0.3s ease;
          backdrop-filter: blur(10px);
        }

        @keyframes composeToastIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .compose-toast--success {
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.25);
          color: #4ade80;
        }

        .compose-toast--error {
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.25);
          color: #f87171;
        }

        .compose-toast-content {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.8125rem;
          font-weight: 500;
        }

        .compose-toast-close {
          background: none;
          border: none;
          color: inherit;
          opacity: 0.65;
          cursor: pointer;
          display: flex;
          padding: 4px;
          border-radius: 4px;
        }

        .compose-toast-close:hover {
          opacity: 1;
        }

        .compose-success-overlay {
          position: absolute;
          inset: 0;
          background: rgba(15, 15, 26, 0.86);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10;
          border-radius: 16px;
        }

        .compose-success-animation {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          color: #4ade80;
          animation: composeSuccessPop 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        @keyframes composeSuccessPop {
          0% {
            transform: scale(0.5);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        .compose-form {
          display: flex;
          flex-direction: column;
        }

        .compose-mode-switch {
          display: inline-flex;
          gap: 0.35rem;
          margin: 0.9rem 1.25rem 0.8rem;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 999px;
          padding: 0.25rem;
          width: fit-content;
          background: rgba(255, 255, 255, 0.02);
        }

        .compose-mode-btn {
          border: none;
          border-radius: 999px;
          padding: 0.38rem 0.85rem;
          background: transparent;
          color: #a1a1aa;
          font-size: 0.78rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .compose-mode-btn--active {
          background: rgba(99, 102, 241, 0.25);
          color: #c7d2fe;
        }

        .compose-sheet-panel {
          padding: 0.9rem 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
          background: rgba(99, 102, 241, 0.05);
        }

        .compose-sheet-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.5rem;
        }

        .compose-sheet-header-actions {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
        }

        .compose-sheet-title {
          font-size: 0.82rem;
          color: #c7d2fe;
          font-weight: 700;
        }

        .compose-sheet-preview-btn {
          border: 1px solid rgba(99, 102, 241, 0.45);
          border-radius: 8px;
          background: rgba(99, 102, 241, 0.16);
          color: #c7d2fe;
          font-size: 0.74rem;
          font-weight: 600;
          padding: 0.35rem 0.65rem;
          cursor: pointer;
        }

        .compose-sheet-preview-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .compose-sheet-preview-btn--ghost {
          border-color: rgba(56, 189, 248, 0.45);
          background: rgba(56, 189, 248, 0.14);
          color: #bae6fd;
        }

        .compose-sheet-input {
          width: 100%;
          padding: 0.68rem 0.75rem;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.02);
          color: #e4e4e7;
          font-size: 0.84rem;
          outline: none;
        }

        .compose-sheet-input:focus {
          border-color: rgba(99, 102, 241, 0.55);
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
        }

        .compose-sheet-hint {
          margin: 0;
          font-size: 0.73rem;
          color: #93c5fd;
          line-height: 1.35;
        }

        .compose-field {
          display: flex;
          align-items: center;
          padding: 0 1.25rem;
          transition: background 0.2s ease;
        }

        .compose-field--active {
          background: rgba(99, 102, 241, 0.04);
        }

        .compose-field-label {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          min-width: 90px;
          color: #71717a;
          font-size: 0.8125rem;
          font-weight: 500;
        }

        .compose-field-icon {
          opacity: 0.6;
        }

        .compose-input {
          flex: 1;
          padding: 0.875rem 0.5rem;
          background: transparent;
          border: none;
          outline: none;
          color: #e4e4e7;
          font-size: 0.9375rem;
          font-family: inherit;
        }

        .compose-input::placeholder {
          color: #3f3f46;
        }

        .compose-divider {
          height: 1px;
          background: rgba(255, 255, 255, 0.05);
          margin: 0 1.25rem;
        }

        .compose-body-wrapper {
          padding: 0.875rem 1.25rem;
          display: flex;
          flex-direction: column;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          transition: background 0.2s ease;
        }

        .compose-body-wrapper--active {
          background: rgba(99, 102, 241, 0.03);
        }

        .compose-body-wrapper--dragging {
          outline: 2px dashed rgba(99, 102, 241, 0.7);
          outline-offset: -6px;
          background: rgba(99, 102, 241, 0.08);
        }

        .compose-body-label {
          margin-bottom: 0.5rem;
        }

        .compose-char-count {
          margin-left: auto;
          font-size: 0.6875rem;
          color: #52525b;
          font-weight: 400;
          font-variant-numeric: tabular-nums;
        }

        .compose-uploaded-images {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          margin-bottom: 0.75rem;
        }

        .compose-image-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          background: rgba(99, 102, 241, 0.15);
          border: 1px solid rgba(99, 102, 241, 0.35);
          border-radius: 999px;
          padding: 0.28rem 0.45rem 0.28rem 0.5rem;
          font-size: 0.68rem;
          color: #c7d2fe;
          max-width: 280px;
        }

        .compose-image-chip span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 130px;
        }

        .compose-image-chip small {
          color: #a5b4fc;
          opacity: 0.85;
        }

        .compose-image-chip-link {
          color: #93c5fd;
          text-decoration: none;
          font-weight: 600;
          border: 1px solid rgba(147, 197, 253, 0.35);
          border-radius: 999px;
          padding: 0.05rem 0.35rem;
          line-height: 1.3;
        }

        .compose-image-chip-link:hover {
          background: rgba(147, 197, 253, 0.18);
        }

        .compose-image-chip button {
          border: none;
          background: transparent;
          color: #c7d2fe;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          padding: 0;
        }

        .compose-hidden-input {
          display: none;
        }

        .compose-email-editor {
          width: 100%;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          overflow: hidden;
        }

        .compose-drop-hint {
          margin: 0.55rem 0 0;
          font-size: 0.72rem;
          color: #94a3b8;
        }

        .compose-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.875rem 1.25rem;
          background: rgba(255, 255, 255, 0.02);
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .compose-actions-left,
        .compose-actions-right {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .compose-action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          color: #a1a1aa;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .compose-action-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #e4e4e7;
          transform: translateY(-1px);
        }

        .compose-discard-btn {
          padding: 0.5rem 1rem;
          border-radius: 8px;
          border: 1px solid rgba(239, 68, 68, 0.2);
          background: rgba(239, 68, 68, 0.06);
          color: #f87171;
          font-size: 0.8125rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .compose-discard-btn:hover {
          background: rgba(239, 68, 68, 0.12);
          border-color: rgba(239, 68, 68, 0.35);
        }

        .compose-send-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.625rem 1.5rem;
          border-radius: 10px;
          border: none;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.25s ease;
          box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
        }

        .compose-send-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(99, 102, 241, 0.45);
          background: linear-gradient(135deg, #7577f5, #9b75fa);
        }

        .compose-send-btn--disabled {
          opacity: 0.4;
          cursor: not-allowed;
          box-shadow: none;
        }

        .compose-send-btn--sending {
          pointer-events: none;
          opacity: 0.8;
        }

        .compose-send-spinner {
          animation: composeSpin 1s linear infinite;
        }

        .compose-sheet-preview,
        .compose-sheet-result {
          margin: 0.95rem 1.25rem 1.25rem;
          padding: 0.85rem;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.28);
          background: rgba(15, 23, 42, 0.5);
        }

        .compose-sheet-preview-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 0.6rem;
        }

        .compose-sheet-preview-head h3,
        .compose-sheet-result h3 {
          margin: 0;
          font-size: 0.9rem;
          color: #e2e8f0;
        }

        .compose-sheet-preview-head span,
        .compose-sheet-result p {
          margin: 0;
          font-size: 0.76rem;
          color: #cbd5e1;
        }

        .compose-sheet-stats {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem 1rem;
          margin-bottom: 0.55rem;
        }

        .compose-sheet-stats p {
          margin: 0;
          font-size: 0.74rem;
          color: #a5b4fc;
        }

        .compose-recipient-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.7rem;
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 10px;
          padding: 0.55rem 0.65rem;
          background: rgba(15, 23, 42, 0.42);
          margin-bottom: 0.6rem;
          flex-wrap: wrap;
        }

        .compose-recipient-controls p {
          margin: 0;
          font-size: 0.76rem;
          color: #cbd5e1;
        }

        .compose-recipient-actions {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
        }

        .compose-sheet-warning {
          margin: 0 0 0.55rem;
          color: #fca5a5;
          font-size: 0.74rem;
        }

        .compose-token-panel,
        .compose-token-suggestion {
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 10px;
          padding: 0.6rem;
          margin-bottom: 0.6rem;
          background: rgba(15, 23, 42, 0.45);
        }

        .compose-token-title {
          margin: 0 0 0.45rem;
          font-size: 0.75rem;
          color: #bfdbfe;
          font-weight: 700;
        }

        .compose-token-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
          gap: 0.45rem;
        }

        .compose-token-chip {
          border: 1px solid rgba(99, 102, 241, 0.35);
          border-radius: 9px;
          background: rgba(99, 102, 241, 0.14);
          padding: 0.4rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.45rem;
        }

        .compose-token-chip span {
          font-size: 0.73rem;
          color: #c7d2fe;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .compose-token-chip div {
          display: inline-flex;
          gap: 0.25rem;
        }

        .compose-token-chip button {
          border: 1px solid rgba(148, 163, 184, 0.45);
          border-radius: 6px;
          background: rgba(15, 23, 42, 0.55);
          color: #cbd5e1;
          font-size: 0.67rem;
          padding: 0.2rem 0.35rem;
          cursor: pointer;
        }

        .compose-token-chip button:hover {
          border-color: rgba(59, 130, 246, 0.6);
          color: #dbeafe;
        }

        .compose-token-suggestion p {
          margin: 0 0 0.4rem;
          font-size: 0.74rem;
          color: #d4d4d8;
          line-height: 1.45;
          word-break: break-word;
        }

        .compose-sheet-table-wrap {
          overflow-x: auto;
        }

        .compose-sheet-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.74rem;
        }

        .compose-sheet-table th,
        .compose-sheet-table td {
          padding: 0.4rem 0.48rem;
          border-bottom: 1px solid rgba(148, 163, 184, 0.18);
          text-align: left;
        }

        .compose-sheet-table th {
          color: #a5b4fc;
          font-weight: 600;
        }

        .compose-sheet-table td {
          color: #d4d4d8;
        }

        .compose-sheet-table input[type='checkbox'] {
          width: 14px;
          height: 14px;
          accent-color: #6366f1;
          cursor: pointer;
        }

        @media (max-width: 768px) {
          .compose-main {
            padding: 1rem;
          }

          .compose-page-header-content {
            flex-direction: column;
            align-items: flex-start;
          }

          .compose-card-sender {
            display: none;
          }

          .compose-actions {
            flex-wrap: wrap;
            gap: 0.75rem;
          }

          .compose-sheet-header {
            flex-wrap: wrap;
          }

          .compose-sheet-header-actions {
            width: 100%;
          }

          .compose-sheet-preview,
          .compose-sheet-result {
            margin-left: 1rem;
            margin-right: 1rem;
          }

          .compose-actions-right {
            width: 100%;
            justify-content: flex-end;
          }

          .compose-image-chip {
            max-width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

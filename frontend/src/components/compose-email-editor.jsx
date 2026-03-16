'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import EmailEditor from 'react-email-editor';

const DEFAULT_TEMPLATE_HTML = `
<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.6;">
  <h1 style="margin:0 0 8px;font-size:28px;line-height:1.2;color:#0f172a;">Your Email Title</h1>
  <p style="margin:0 0 16px;font-size:16px;color:#475569;">Add a short intro for your audience.</p>
  <p style="margin:0 0 14px;">Start writing your message here, or open the AI assistant to generate a full template.</p>
  <p style="margin:18px 0;">
    <a href="https://example.com" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Call to Action</a>
  </p>
</div>
`;

const BLANK_DESIGN = {
  body: {
    rows: [],
    values: {
      backgroundColor: '#f6f7fb',
      contentWidth: '640px',
      fontFamily: {
        label: 'Arial',
        value: 'arial,helvetica,sans-serif',
      },
    },
  },
  schemaVersion: 20,
};

function extractTextFromHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

const ComposeEmailEditor = forwardRef(function ComposeEmailEditor(props, ref) {
  const { onReady, onContentChange, onFocus, onBlur } = props;
  const editorRef = useRef(null);

  const syncEditorContent = () => {
    const editor = editorRef.current?.editor;
    if (!editor) {
      return;
    }

    editor.exportHtml(({ html, design }) => {
      onContentChange?.({
        html,
        design,
        text: extractTextFromHtml(html),
      });
    });
  };

  const handleReady = () => {
    const editor = editorRef.current?.editor;
    if (!editor) {
      return;
    }

    editor.addEventListener('design:updated', syncEditorContent);
    onReady?.();

    if (typeof editor.loadBlank === 'function') {
      editor.loadBlank();
      setTimeout(() => {
        applyGeneratedContentInternal(DEFAULT_TEMPLATE_HTML)
          .catch(() => {
            editor.loadDesign(BLANK_DESIGN);
            syncEditorContent();
          });
      }, 300);
      return;
    }

    editor.loadDesign(BLANK_DESIGN);
    syncEditorContent();
  };

  const applyGeneratedContentInternal = (html) => {
    return new Promise((resolve, reject) => {
      const editor = editorRef.current?.editor;
      if (!editor) {
        reject(new Error('Editor is not ready yet.'));
        return;
      }

      const applyIntoDesign = (baseDesign) => {
        const designClone = JSON.parse(JSON.stringify(baseDesign || {}));
        const rows = designClone?.body?.rows;
        if (!Array.isArray(rows) || rows.length === 0) {
          throw new Error('Editor design is not initialized yet.');
        }

        const firstRow = rows[0];
        const firstColumn = firstRow?.columns?.[0];
        if (!firstColumn) {
          throw new Error('Editor layout is missing required columns.');
        }

        const firstContent = firstColumn?.contents?.[0] || {};
        const htmlContent = {
          ...firstContent,
          type: 'html',
          values: {
            ...(firstContent.values || {}),
            containerPadding: '16px',
            html,
          },
        };

        firstColumn.contents = [htmlContent];
        designClone.body.rows = [firstRow];

        return designClone;
      };

      const applyIntoDesignAsTextFallback = (baseDesign) => {
        const designClone = JSON.parse(JSON.stringify(baseDesign || {}));
        const rows = designClone?.body?.rows;
        if (!Array.isArray(rows) || rows.length === 0) {
          throw new Error('Editor design is not initialized yet.');
        }

        const firstRow = rows[0];
        const firstColumn = firstRow?.columns?.[0];
        if (!firstColumn) {
          throw new Error('Editor layout is missing required columns.');
        }

        const firstContent = firstColumn?.contents?.[0] || {};
        const textContent = {
          ...firstContent,
          type: 'text',
          values: {
            ...(firstContent.values || {}),
            containerPadding: '16px',
            text: html,
          },
        };

        firstColumn.contents = [textContent];
        designClone.body.rows = [firstRow];

        return designClone;
      };

      editor.exportHtml(({ design }) => {
        try {
          const nextDesign = applyIntoDesign(design);
          try {
            editor.loadDesign(nextDesign);
            setTimeout(() => {
              syncEditorContent();
              resolve();
            }, 300);
          } catch {
            // Some editor builds may not support html block; fallback to text block.
            const fallbackDesign = applyIntoDesignAsTextFallback(design);
            editor.loadDesign(fallbackDesign);
            setTimeout(() => {
              syncEditorContent();
              resolve();
            }, 300);
          }
        } catch (error) {
          reject(error);
        }
      });
    });
  };

  useImperativeHandle(ref, () => ({
    exportHtml() {
      return new Promise((resolve, reject) => {
        const editor = editorRef.current?.editor;
        if (!editor) {
          reject(new Error('Editor is not ready yet.'));
          return;
        }

        editor.exportHtml(({ html, design }) => {
          resolve({
            html,
            design,
            text: extractTextFromHtml(html),
          });
        });
      });
    },
    clear() {
      const editor = editorRef.current?.editor;
      if (!editor) {
        return;
      }

      applyGeneratedContentInternal(DEFAULT_TEMPLATE_HTML).catch(() => {
        editor.loadDesign(BLANK_DESIGN);
        onContentChange?.({ html: '', design: BLANK_DESIGN, text: '' });
      });
    },
    loadDesign(design) {
      const editor = editorRef.current?.editor;
      if (!editor || !design) {
        return;
      }

      const safeDesign = {
        ...BLANK_DESIGN,
        ...design,
        body: {
          ...BLANK_DESIGN.body,
          ...(design.body || {}),
          rows: Array.isArray(design?.body?.rows) ? design.body.rows : [],
          values: {
            ...BLANK_DESIGN.body.values,
            ...(design?.body?.values || {}),
          },
        },
      };

      try {
        editor.loadDesign(safeDesign);
      } catch {
        editor.loadDesign(BLANK_DESIGN);
      }
      setTimeout(syncEditorContent, 250);
    },
    applyGeneratedContent(html) {
      return applyGeneratedContentInternal(html || DEFAULT_TEMPLATE_HTML);
    },
  }));

  return (
    <div className="compose-email-editor" onFocusCapture={onFocus} onBlurCapture={onBlur}>
      <EmailEditor
        ref={editorRef}
        onReady={handleReady}
        minHeight={360}
        options={{
          appearance: {
            theme: 'dark',
            panels: {
              tools: {
                dock: 'left',
              },
            },
          },
          features: {
            stockImages: true,
          },
        }}
      />
    </div>
  );
});

export default ComposeEmailEditor;

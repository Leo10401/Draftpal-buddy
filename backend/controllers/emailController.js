const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const { parse } = require('csv-parse/sync');
const http = require('http');
const https = require('https');
const User = require('../models/User');
const AutomationLog = require('../models/AutomationLog');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SHEET_ROWS = 300;
const MAX_ATTACHMENTS_PER_RECIPIENT = 10;

function normalizeHeaderName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getTokenColumns(template) {
  if (!template) {
    return [];
  }

  const tokenSet = new Set();
  const pattern = /\$\$\$([a-zA-Z0-9_ -]+)\$\$\$/g;
  let match = pattern.exec(template);
  while (match) {
    tokenSet.add(normalizeHeaderName(match[1]));
    match = pattern.exec(template);
  }

  return [...tokenSet].filter(Boolean);
}

function replaceTokens(template, rowValues) {
  if (!template) {
    return '';
  }

  return String(template).replace(/\$\$\$([a-zA-Z0-9_ -]+)\$\$\$/g, (_, tokenName) => {
    const key = normalizeHeaderName(tokenName);
    return rowValues[key] || '';
  });
}

function sanitizeSubject(subject) {
  return String(subject || '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function splitAttachmentUrls(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function inferFileNameFromUrl(fileUrl, fallbackIndex) {
  try {
    const parsed = new URL(fileUrl);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) {
      return decodeURIComponent(last);
    }
  } catch {
    // Keep fallback.
  }

  return `attachment-${fallbackIndex}`;
}

function normalizeSheetCsvUrl(sheetLink) {
  const raw = String(sheetLink || '').trim();
  if (!raw) {
    throw new Error('Google Sheet link is required.');
  }

  if (!isValidHttpUrl(raw)) {
    throw new Error('Sheet link must be a valid http/https URL.');
  }

  if (raw.includes('output=csv') || raw.includes('format=csv')) {
    return raw;
  }

  const sheetIdMatch = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!sheetIdMatch) {
    return raw;
  }

  const sheetId = sheetIdMatch[1];
  const parsed = new URL(raw);
  const gidFromQuery = parsed.searchParams.get('gid');
  const gidFromHash = parsed.hash && parsed.hash.includes('gid=') ? parsed.hash.split('gid=')[1] : '';
  const gid = gidFromQuery || gidFromHash || '0';

  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

async function writeComposeLog({
  userId,
  level = 'info',
  channel,
  to,
  message,
  messageId = '',
  rowNumber = null,
  sourceId = '',
  sourceName = '',
  sourceLink = '',
  metadata = {},
}) {
  try {
    await AutomationLog.create({
      userId,
      level,
      stepType: 'send-email',
      stepId: channel,
      message,
      metadata: {
        email: to || '',
        rowNumber,
        messageId,
        sourceId,
        sourceName,
        sourceLink,
        channel,
        ...metadata,
      },
    });
  } catch (error) {
    console.error('Compose log write error:', error.message);
  }
}

function fetchUrlText(targetUrl, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error('Too many redirects while fetching sheet URL.'));
      return;
    }

    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch {
      reject(new Error('Invalid sheet URL.'));
      return;
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(parsed, (response) => {
      const statusCode = response.statusCode || 500;
      const location = response.headers.location;

      if ([301, 302, 303, 307, 308].includes(statusCode) && location) {
        const redirectUrl = new URL(location, parsed).toString();
        response.resume();
        fetchUrlText(redirectUrl, redirects + 1).then(resolve).catch(reject);
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        reject(new Error(`Failed to fetch sheet CSV (status ${statusCode}).`));
        response.resume();
        return;
      }

      let data = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        data += chunk;
      });
      response.on('end', () => {
        resolve(data);
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Unable to fetch sheet URL: ${error.message}`));
    });
  });
}

function parseSheetRows(csvText) {
  const records = parse(csvText, {
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  });

  if (!Array.isArray(records) || records.length < 2) {
    throw new Error('Sheet must contain a header row and at least one data row.');
  }

  const rawHeaders = records[0].map((cell) => String(cell || '').trim());
  const normalizedHeaders = [];
  const seen = {};

  rawHeaders.forEach((header, index) => {
    const base = normalizeHeaderName(header) || `column_${index + 1}`;
    const nextCount = (seen[base] || 0) + 1;
    seen[base] = nextCount;
    normalizedHeaders.push(nextCount === 1 ? base : `${base}_${nextCount}`);
  });

  const rows = records.slice(1).map((cells, rowIndex) => {
    const values = {};
    normalizedHeaders.forEach((key, cellIndex) => {
      values[key] = String(cells[cellIndex] || '').trim();
    });

    return {
      rowNumber: rowIndex + 2,
      values,
    };
  });

  return {
    headers: normalizedHeaders,
    rows,
  };
}

function getEmailColumn(headers) {
  const candidates = ['email', 'mail', 'recipient_email', 'email_address'];
  return candidates.find((candidate) => headers.includes(candidate)) || null;
}

function getNameColumn(headers) {
  const candidates = ['name', 'full_name', 'recipient_name', 'student_name'];
  return candidates.find((candidate) => headers.includes(candidate)) || null;
}

function getAttachmentColumns(headers) {
  return headers.filter((key) => key.startsWith('attachment') || key.startsWith('certificate') || key.startsWith('file_'));
}

function buildRecipientAttachments(rowValues, attachmentColumns) {
  const attachmentUrls = [];
  const invalidUrls = [];

  attachmentColumns.forEach((column) => {
    splitAttachmentUrls(rowValues[column]).forEach((url) => {
      if (!isValidHttpUrl(url)) {
        invalidUrls.push(url);
        return;
      }
      attachmentUrls.push(url);
    });
  });

  const uniqueUrls = [...new Set(attachmentUrls)].slice(0, MAX_ATTACHMENTS_PER_RECIPIENT);
  const attachments = uniqueUrls.map((url, index) => ({
    filename: inferFileNameFromUrl(url, index + 1),
    path: url,
  }));

  return {
    attachments,
    invalidUrls,
    truncated: attachmentUrls.length > MAX_ATTACHMENTS_PER_RECIPIENT,
  };
}

async function buildSheetPreviewPayload({ sheetLink, subjectTemplate, bodyTemplate }) {
  const csvUrl = normalizeSheetCsvUrl(sheetLink);
  const csvText = await fetchUrlText(csvUrl);
  const { headers, rows } = parseSheetRows(csvText);

  if (rows.length > MAX_SHEET_ROWS) {
    throw new Error(`Sheet has ${rows.length} rows. Maximum supported rows per batch is ${MAX_SHEET_ROWS}.`);
  }

  const emailColumn = getEmailColumn(headers);
  if (!emailColumn) {
    throw new Error('Sheet must include an email column (email or mail).');
  }

  const nameColumn = getNameColumn(headers);
  const attachmentColumns = getAttachmentColumns(headers);
  const templateTokens = [...new Set([...getTokenColumns(subjectTemplate), ...getTokenColumns(bodyTemplate)])];
  const missingTokenColumns = templateTokens.filter((token) => !headers.includes(token));

  const validRecipients = [];
  const invalidRows = [];

  rows.forEach((row) => {
    const email = row.values[emailColumn];
    if (!EMAIL_REGEX.test(email)) {
      invalidRows.push({
        rowNumber: row.rowNumber,
        reason: 'Invalid email value',
        email,
      });
      return;
    }

    const { attachments, invalidUrls, truncated } = buildRecipientAttachments(row.values, attachmentColumns);
    validRecipients.push({
      rowNumber: row.rowNumber,
      email,
      name: nameColumn ? row.values[nameColumn] : '',
      values: row.values,
      attachments,
      invalidAttachmentUrls: invalidUrls,
      attachmentTruncated: truncated,
    });
  });

  return {
    csvUrl,
    headers,
    emailColumn,
    nameColumn,
    attachmentColumns,
    templateTokens,
    missingTokenColumns,
    validRecipients,
    invalidRows,
    totalRows: rows.length,
  };
}

// Fixed OAuth2 client setup and token refresh
const getOAuth2Client = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.googleTokens || !user.googleTokens.access_token) {
      throw new Error('No access token available. Please re-authenticate with Google.');
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.CLIENT_URL}/api/auth/callback/google`
    );

    // Set credentials from database
    oauth2Client.setCredentials({
      access_token: user.googleTokens.access_token,
      refresh_token: user.googleTokens.refresh_token,
      expiry_date: user.googleTokens.expiry_date,
    });

    // Only try to refresh if we have a refresh token
    if (user.googleTokens.refresh_token) {
      // Check if token is expired or about to expire
      const isTokenExpired = user.googleTokens.expiry_date ? user.googleTokens.expiry_date <= Date.now() + 60000 : true;

      if (isTokenExpired) {
        try {
          console.log('Access token expired, attempting to refresh...');
          const { credentials } = await oauth2Client.refreshAccessToken();

          // Update tokens in database
          user.googleTokens = {
            access_token: credentials.access_token,
            refresh_token: credentials.refresh_token || user.googleTokens.refresh_token,
            expiry_date: credentials.expiry_date,
          };

          await user.save();
          console.log('Access token refreshed successfully');
        } catch (refreshError) {
          console.error('Token refresh error:', refreshError);
          // Continue with existing token if refresh fails
        }
      }
    } else {
      console.warn(`User ${userId} has no refresh token - token refreshing unavailable`);
    }

    return oauth2Client;
  } catch (error) {
    console.error('OAuth2 client error:', error);
    throw new Error(`Authentication error: ${error.message}`);
  }
};

const createTransporter = (user, accessToken) => {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      type: 'OAuth2',
      user: user.email,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      refreshToken: user.googleTokens.refresh_token,
      accessToken,
    },
    debug: true,
  });
};

exports.sendEmail = async (req, res) => {
  try {
    const { to, subject, body, attachments } = req.body;

    // Validate required fields
    if (!to || !subject || !body) {
      return res.status(400).json({
        success: false,
        message: 'Please provide recipient, subject and message body',
      });
    }

    // Check if user has refresh token before attempting to send
    if (!req.user.googleTokens || !req.user.googleTokens.refresh_token) {
      return res.status(401).json({
        success: false,
        message: 'No refresh token available. Please log out and log back in to re-authenticate with Google.',
      });
    }

    // Get OAuth2 client with refreshed token
    const oauth2Client = await getOAuth2Client(req.user._id);
    const transporter = createTransporter(req.user, oauth2Client.credentials.access_token);

    // Email options
    const mailOptions = {
      from: req.user.email,
      to,
      subject: sanitizeSubject(subject),
      html: body,
      attachments: attachments || [],
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);

    await writeComposeLog({
      userId: req.user._id,
      level: 'info',
      channel: 'compose-single',
      to,
      messageId: info.messageId,
      sourceId: 'compose-manual',
      sourceName: 'Compose Manual',
      message: `Email sent to ${to}`,
      metadata: {
        subject: sanitizeSubject(subject),
      },
    });

    res.status(200).json({
      success: true,
      messageId: info.messageId,
      message: 'Email sent successfully',
    });
  } catch (error) {
    console.error('Send email error:', error);

    await writeComposeLog({
      userId: req.user?._id,
      level: 'error',
      channel: 'compose-single',
      to: req.body?.to,
      sourceId: 'compose-manual',
      sourceName: 'Compose Manual',
      message: `Failed sending email to ${req.body?.to || 'unknown recipient'}`,
      metadata: {
        subject: sanitizeSubject(req.body?.subject || ''),
        error: error.message,
      },
    });

    res.status(500).json({ success: false, message: error.message });
  }
};

exports.previewSheetSend = async (req, res) => {
  try {
    const { sheetLink, subjectTemplate, bodyTemplate } = req.body;

    if (!sheetLink) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a Google Sheet link.',
      });
    }

    const previewData = await buildSheetPreviewPayload({
      sheetLink,
      subjectTemplate,
      bodyTemplate,
    });

    return res.status(200).json({
      success: true,
      preview: {
        csvUrl: previewData.csvUrl,
        columns: previewData.headers,
        emailColumn: previewData.emailColumn,
        nameColumn: previewData.nameColumn,
        attachmentColumns: previewData.attachmentColumns,
        templateTokens: previewData.templateTokens,
        missingTokenColumns: previewData.missingTokenColumns,
        totalRows: previewData.totalRows,
        validRecipients: previewData.validRecipients.length,
        invalidRecipients: previewData.invalidRows.length,
        sampleRecipients: previewData.validRecipients.slice(0, 10).map((recipient) => ({
          rowNumber: recipient.rowNumber,
          email: recipient.email,
          name: recipient.name,
          attachmentCount: recipient.attachments.length,
          invalidAttachmentUrls: recipient.invalidAttachmentUrls,
          attachmentTruncated: recipient.attachmentTruncated,
        })),
        recipients: previewData.validRecipients.map((recipient) => ({
          rowNumber: recipient.rowNumber,
          email: recipient.email,
          name: recipient.name,
          attachmentCount: recipient.attachments.length,
          invalidAttachmentUrls: recipient.invalidAttachmentUrls,
          attachmentTruncated: recipient.attachmentTruncated,
        })),
        invalidRows: previewData.invalidRows.slice(0, 50),
      },
    });
  } catch (error) {
    console.error('Sheet preview error:', error);
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

exports.sendSheetBulk = async (req, res) => {
  try {
    const { sheetLink, subjectTemplate, bodyTemplate } = req.body;
    const selectedRowNumbers = Array.isArray(req.body.selectedRowNumbers)
      ? req.body.selectedRowNumbers
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0)
      : null;

    if (!sheetLink || !subjectTemplate || !bodyTemplate) {
      return res.status(400).json({
        success: false,
        message: 'Please provide sheetLink, subjectTemplate and bodyTemplate.',
      });
    }

    if (!req.user.googleTokens || !req.user.googleTokens.refresh_token) {
      return res.status(401).json({
        success: false,
        message: 'No refresh token available. Please log out and log back in to re-authenticate with Google.',
      });
    }

    const previewData = await buildSheetPreviewPayload({
      sheetLink,
      subjectTemplate,
      bodyTemplate,
    });

    let recipientsToSend = previewData.validRecipients;
    if (Array.isArray(selectedRowNumbers)) {
      const selectedSet = new Set(selectedRowNumbers);
      recipientsToSend = previewData.validRecipients.filter((recipient) => selectedSet.has(recipient.rowNumber));
      if (!recipientsToSend.length) {
        return res.status(400).json({
          success: false,
          message: 'No recipients selected for this campaign.',
        });
      }
    }

    if (!recipientsToSend.length) {
      return res.status(400).json({
        success: false,
        message: 'No valid recipients found in the provided sheet.',
        invalidRows: previewData.invalidRows,
      });
    }

    const oauth2Client = await getOAuth2Client(req.user._id);
    const transporter = createTransporter(req.user, oauth2Client.credentials.access_token);

    const results = [];
    let sent = 0;
    let failed = 0;
    const sheetSourceId = normalizeSheetCsvUrl(sheetLink);
    const sheetSourceName = 'Compose Sheet Upload';

    for (const recipient of recipientsToSend) {
      const personalizedSubject = sanitizeSubject(replaceTokens(subjectTemplate, recipient.values));
      const personalizedBody = replaceTokens(bodyTemplate, recipient.values);

      if (!personalizedSubject || !personalizedBody) {
        failed += 1;
        results.push({
          rowNumber: recipient.rowNumber,
          email: recipient.email,
          status: 'failed',
          reason: 'Resolved subject or body is empty.',
        });

        await writeComposeLog({
          userId: req.user._id,
          level: 'error',
          channel: 'compose-sheet',
          to: recipient.email,
          rowNumber: recipient.rowNumber,
          sourceId: sheetSourceId,
          sourceName: sheetSourceName,
          sourceLink: sheetLink,
          message: `Failed sending sheet email to ${recipient.email}`,
          metadata: {
            error: 'Resolved subject or body is empty.',
          },
        });

        continue;
      }

      const mailOptions = {
        from: req.user.email,
        to: recipient.email,
        subject: personalizedSubject,
        html: personalizedBody,
        attachments: recipient.attachments,
      };

      try {
        const info = await transporter.sendMail(mailOptions);
        sent += 1;
        results.push({
          rowNumber: recipient.rowNumber,
          email: recipient.email,
          status: 'sent',
          messageId: info.messageId,
          attachmentCount: recipient.attachments.length,
          invalidAttachmentUrls: recipient.invalidAttachmentUrls,
        });

        await writeComposeLog({
          userId: req.user._id,
          level: 'info',
          channel: 'compose-sheet',
          to: recipient.email,
          rowNumber: recipient.rowNumber,
          messageId: info.messageId,
          sourceId: sheetSourceId,
          sourceName: sheetSourceName,
          sourceLink: sheetLink,
          message: `Sheet email sent to ${recipient.email}`,
          metadata: {
            subject: personalizedSubject,
          },
        });
      } catch (error) {
        failed += 1;
        results.push({
          rowNumber: recipient.rowNumber,
          email: recipient.email,
          status: 'failed',
          reason: error.message,
          attachmentCount: recipient.attachments.length,
          invalidAttachmentUrls: recipient.invalidAttachmentUrls,
        });

        await writeComposeLog({
          userId: req.user._id,
          level: 'error',
          channel: 'compose-sheet',
          to: recipient.email,
          rowNumber: recipient.rowNumber,
          sourceId: sheetSourceId,
          sourceName: sheetSourceName,
          sourceLink: sheetLink,
          message: `Failed sending sheet email to ${recipient.email}`,
          metadata: {
            error: error.message,
          },
        });
      }
    }

    const skipped = previewData.invalidRows.length + (previewData.validRecipients.length - recipientsToSend.length);
    return res.status(200).json({
      success: failed === 0,
      partialSuccess: sent > 0 && failed > 0,
      message: failed === 0 ? 'Bulk email campaign completed successfully.' : 'Bulk email campaign completed with some failures.',
      summary: {
        totalRows: previewData.totalRows,
        processed: recipientsToSend.length,
        selectedRecipients: recipientsToSend.length,
        sent,
        failed,
        skipped,
      },
      invalidRows: previewData.invalidRows,
      results,
    });
  } catch (error) {
    console.error('Sheet bulk send error:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

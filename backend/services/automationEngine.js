const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const { parse } = require('csv-parse/sync');
const http = require('http');
const https = require('https');

const User = require('../models/User');
const AutomationEvent = require('../models/AutomationEvent');
const AutomationRun = require('../models/AutomationRun');
const AutomationLog = require('../models/AutomationLog');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SHEET_ROWS = 500;
const eventTimers = new Map();
const runningEvents = new Set();

function normalizeHeaderName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
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
    // Keep fallback name.
  }

  return `attachment-${fallbackIndex}`;
}

function getAttachmentColumns(headers) {
  return headers.filter((key) => key.startsWith('attachment') || key.startsWith('file') || key.startsWith('certificate'));
}

function buildRecipientAttachments(rowValues, attachmentColumns) {
  const urls = [];
  attachmentColumns.forEach((column) => {
    splitAttachmentUrls(rowValues[column]).forEach((candidate) => {
      if (isValidHttpUrl(candidate)) {
        urls.push(candidate);
      }
    });
  });

  const uniqueUrls = [...new Set(urls)];
  return uniqueUrls.map((url, index) => ({
    filename: inferFileNameFromUrl(url, index + 1),
    path: url,
  }));
}

function parseGroupList(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean);
  }

  return String(value)
    .split(/[\n,;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
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

async function getOAuth2Client(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found.');
  }

  if (!user.googleTokens || !user.googleTokens.access_token) {
    throw new Error('No Google access token found. Re-authenticate and try again.');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.CLIENT_URL}/api/auth/callback/google`
  );

  oauth2Client.setCredentials({
    access_token: user.googleTokens.access_token,
    refresh_token: user.googleTokens.refresh_token,
    expiry_date: user.googleTokens.expiry_date,
  });

  if (user.googleTokens.refresh_token) {
    const isTokenExpired = user.googleTokens.expiry_date ? user.googleTokens.expiry_date <= Date.now() + 60000 : true;
    if (isTokenExpired) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        user.googleTokens = {
          access_token: credentials.access_token,
          refresh_token: credentials.refresh_token || user.googleTokens.refresh_token,
          expiry_date: credentials.expiry_date,
        };
        await user.save();
      } catch (error) {
        console.error('Automation token refresh failed:', error.message);
      }
    }
  }

  return { oauth2Client, user };
}

function createTransporter(user, accessToken) {
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
  });
}

async function addLog({ eventId, runId, userId, level, stepType, stepId, message, metadata }) {
  await AutomationLog.create({
    eventId,
    runId,
    userId,
    level: level || 'info',
    stepType: stepType || 'system',
    stepId: stepId || '',
    message,
    metadata: metadata || {},
  });
}

function validateWorkflowGraph(eventInput) {
  const nodes = eventInput?.workflow?.nodes || [];
  const edges = eventInput?.workflow?.edges || [];

  if (!Array.isArray(nodes) || nodes.length === 0) {
    return { valid: false, message: 'Workflow must include at least one node.' };
  }

  const idSet = new Set();
  let timerCount = 0;
  for (const node of nodes) {
    if (!node.id || idSet.has(node.id)) {
      return { valid: false, message: 'Each workflow node needs a unique id.' };
    }
    idSet.add(node.id);
    if (node.type === 'timer') {
      timerCount += 1;
    }
  }

  if (timerCount !== 1) {
    return { valid: false, message: 'Workflow must contain exactly one timer node.' };
  }

  for (const edge of edges) {
    if (!idSet.has(edge.source) || !idSet.has(edge.target)) {
      return { valid: false, message: 'Workflow edges must reference valid node ids.' };
    }
  }

  return { valid: true };
}

function topologicalSort(nodes, edges) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const indegree = new Map();
  const adjacency = new Map();

  for (const node of nodes) {
    indegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    adjacency.get(edge.source).push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);
  }

  const queue = [];
  indegree.forEach((count, id) => {
    if (count === 0) {
      queue.push(id);
    }
  });

  const ordered = [];
  while (queue.length > 0) {
    const id = queue.shift();
    ordered.push(nodeMap.get(id));
    for (const next of adjacency.get(id)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) {
        queue.push(next);
      }
    }
  }

  if (ordered.length !== nodes.length) {
    throw new Error('Workflow graph contains a cycle. Please remove cyclic edges.');
  }

  return ordered;
}

function parseRecipientsFromSheet(source, parsedSheet) {
  const certColumn = normalizeHeaderName(source.certificateColumn || 'certificate_status');
  const certExpected = String(source.certificateAvailableValue || 'available').trim().toLowerCase();
  const emailColumn = normalizeHeaderName(source.recipientEmailColumn || 'email');
  const nameColumn = normalizeHeaderName(source.recipientNameColumn || 'name');

  const recipients = [];
  const skipped = [];
  const attachmentColumns = getAttachmentColumns(parsedSheet.headers || []);

  for (const row of parsedSheet.rows) {
    const status = String(row.values[certColumn] || '').trim().toLowerCase();
    const email = String(row.values[emailColumn] || '').trim();
    if (status !== certExpected) {
      skipped.push({ rowNumber: row.rowNumber, reason: 'certificate_not_available' });
      continue;
    }

    if (!EMAIL_REGEX.test(email)) {
      skipped.push({ rowNumber: row.rowNumber, reason: 'invalid_email', email });
      continue;
    }

    recipients.push({
      rowNumber: row.rowNumber,
      email,
      name: String(row.values[nameColumn] || '').trim(),
      values: row.values,
      attachments: buildRecipientAttachments(row.values, attachmentColumns),
      specialMessages: [],
      sourceId: source.id,
      sourceName: source.name,
      sourceLink: source.sheetLink,
    });
  }

  return { recipients, skipped };
}

async function getPreviouslySentEmailSet(eventId, beforeDate) {
  const logs = await AutomationLog.find({
    eventId,
    stepType: 'send-email',
    level: 'info',
    createdAt: { $lt: beforeDate },
    'metadata.email': { $exists: true },
  }).select('metadata.email');

  return new Set(
    logs
      .map((item) => String(item?.metadata?.email || '').trim().toLowerCase())
      .filter(Boolean)
  );
}

async function executeEventRun(eventId, trigger = 'manual') {
  const key = String(eventId);
  if (runningEvents.has(key)) {
    return { accepted: false, reason: 'already_running' };
  }

  runningEvents.add(key);

  let runRecord;
  try {
    const event = await AutomationEvent.findById(eventId);
    if (!event || !event.isEnabled) {
      runningEvents.delete(key);
      return { accepted: false, reason: 'event_not_found_or_disabled' };
    }

    runRecord = await AutomationRun.create({
      eventId: event._id,
      userId: event.userId,
      trigger,
      status: 'running',
      startedAt: new Date(),
    });

    const workflowNodes = topologicalSort(event.workflow.nodes || [], event.workflow.edges || []);

    const executionContext = {
      recipients: [],
      skippedRows: [],
      totalRows: 0,
      sheetsProcessed: 0,
      sent: 0,
      failed: 0,
      previouslySentEmails: null,
    };

    await addLog({
      eventId: event._id,
      runId: runRecord._id,
      userId: event.userId,
      level: 'info',
      message: `Run started via ${trigger}.`,
      stepType: 'system',
    });

    for (const node of workflowNodes) {
      if (node.type === 'timer') {
        await addLog({
          eventId: event._id,
          runId: runRecord._id,
          userId: event.userId,
          level: 'info',
          stepType: node.type,
          stepId: node.id,
          message: 'Timer step acknowledged for this run.',
        });
        continue;
      }

      if (node.type === 'sheet-check') {
        const targetSourceIds = Array.isArray(node.data?.sourceIds) ? node.data.sourceIds : [];
        const sourcesToUse = targetSourceIds.length
          ? event.sheetSources.filter((source) => targetSourceIds.includes(source.id))
          : event.sheetSources;

        for (const source of sourcesToUse) {
          try {
            const csvUrl = normalizeSheetCsvUrl(source.sheetLink);
            const csvText = await fetchUrlText(csvUrl);
            const parsed = parseSheetRows(csvText);

            if (parsed.rows.length > MAX_SHEET_ROWS) {
              throw new Error(`Sheet ${source.name} has ${parsed.rows.length} rows. Max is ${MAX_SHEET_ROWS}.`);
            }

            const { recipients, skipped } = parseRecipientsFromSheet(source, parsed);
            executionContext.recipients.push(...recipients);
            executionContext.skippedRows.push(
              ...skipped.map((item) => ({
                ...item,
                sourceId: source.id,
                sourceName: source.name,
              }))
            );
            executionContext.totalRows += parsed.rows.length;
            executionContext.sheetsProcessed += 1;

            await addLog({
              eventId: event._id,
              runId: runRecord._id,
              userId: event.userId,
              level: 'info',
              stepType: node.type,
              stepId: node.id,
              message: `Processed sheet ${source.name}. Eligible recipients: ${recipients.length}.`,
              metadata: {
                sourceId: source.id,
                rows: parsed.rows.length,
                eligible: recipients.length,
                skipped: skipped.length,
              },
            });
          } catch (error) {
            await addLog({
              eventId: event._id,
              runId: runRecord._id,
              userId: event.userId,
              level: 'error',
              stepType: node.type,
              stepId: node.id,
              message: `Failed to process sheet ${source.name}: ${error.message}`,
              metadata: {
                sourceId: source.id,
              },
            });
          }
        }
        continue;
      }

      if (node.type === 'condition') {
        const conditionData = node.data || {};
        const requireAttachment = Boolean(conditionData.requireAttachment);
        const requireEmail = conditionData.requireEmail !== false;
        const excludePreviouslySent = Boolean(conditionData.excludePreviouslySent);
        const nameStartsWith = String(conditionData.nameStartsWith || '').trim().toLowerCase();
        const groupColumn = normalizeHeaderName(conditionData.groupColumn || 'group');
        const allowedGroups = parseGroupList(conditionData.allowedGroups);
        const specialMessage = String(conditionData.specialMessage || '').trim();
        const specialMessageGroupColumn = normalizeHeaderName(conditionData.specialMessageGroupColumn || conditionData.groupColumn || 'group');
        const specialMessageGroups = parseGroupList(conditionData.specialMessageGroups);

        if (excludePreviouslySent && !executionContext.previouslySentEmails) {
          executionContext.previouslySentEmails = await getPreviouslySentEmailSet(event._id, runRecord.startedAt || new Date());
        }

        let filteredOut = 0;
        let specialApplied = 0;

        const nextRecipients = executionContext.recipients.filter((recipient) => {
          const emailLower = String(recipient.email || '').trim().toLowerCase();
          const nameLower = String(recipient.name || '').trim().toLowerCase();

          const hasEmail = EMAIL_REGEX.test(recipient.email || '');
          const hasAttachment = Array.isArray(recipient.attachments) && recipient.attachments.length > 0;
          const allowedByNamePrefix = !nameStartsWith || nameLower.startsWith(nameStartsWith);

          const groupValue = String(recipient.values?.[groupColumn] || '').trim().toLowerCase();
          const allowedByGroup = !allowedGroups.length || allowedGroups.includes(groupValue);

          const alreadySent = excludePreviouslySent
            ? executionContext.previouslySentEmails?.has(emailLower)
            : false;

          const passes =
            (!requireEmail || hasEmail) &&
            (!requireAttachment || hasAttachment) &&
            allowedByNamePrefix &&
            allowedByGroup &&
            !alreadySent;

          if (!passes) {
            filteredOut += 1;
            executionContext.skippedRows.push({
              rowNumber: recipient.rowNumber,
              sourceName: recipient.sourceName,
              reason: 'condition_filtered',
              email: recipient.email,
            });
            return false;
          }

          if (specialMessage && specialMessageGroups.length) {
            const specialGroupValue = String(recipient.values?.[specialMessageGroupColumn] || '').trim().toLowerCase();
            if (specialMessageGroups.includes(specialGroupValue)) {
              recipient.specialMessages = [...(recipient.specialMessages || []), specialMessage];
              specialApplied += 1;
            }
          }

          return true;
        });

        executionContext.recipients = nextRecipients;

        await addLog({
          eventId: event._id,
          runId: runRecord._id,
          userId: event.userId,
          level: 'info',
          stepType: node.type,
          stepId: node.id,
          message: `Condition step filtered ${filteredOut} recipient(s). Remaining: ${nextRecipients.length}.`,
          metadata: {
            filteredOut,
            remaining: nextRecipients.length,
            requireAttachment,
            requireEmail,
            excludePreviouslySent,
            nameStartsWith,
            allowedGroups,
            specialApplied,
          },
        });

        continue;
      }

      if (node.type === 'send-email') {
        if (!executionContext.recipients.length) {
          await addLog({
            eventId: event._id,
            runId: runRecord._id,
            userId: event.userId,
            level: 'info',
            stepType: node.type,
            stepId: node.id,
            message: 'No recipients available after sheet check. Email step skipped.',
          });
          continue;
        }

        const subjectTemplate = String(node.data?.subjectTemplate || 'Certificate available for $$$name$$$');
        const bodyTemplate = String(node.data?.bodyTemplate || '<p>Hello $$$name$$$, your certificate is now available.</p>');

        const { oauth2Client, user } = await getOAuth2Client(event.userId);
        const transporter = createTransporter(user, oauth2Client.credentials.access_token);

        for (const recipient of executionContext.recipients) {
          const subject = sanitizeSubject(replaceTokens(subjectTemplate, recipient.values));
          let body = replaceTokens(bodyTemplate, recipient.values);

          if (Array.isArray(recipient.specialMessages) && recipient.specialMessages.length) {
            const specialHtml = recipient.specialMessages
              .map((message) => `<p style="margin-top:12px;font-weight:600;color:#b91c1c;">${message}</p>`)
              .join('');
            body = `${body}${specialHtml}`;
          }

          if (!subject || !body) {
            executionContext.failed += 1;
            await addLog({
              eventId: event._id,
              runId: runRecord._id,
              userId: event.userId,
              level: 'error',
              stepType: node.type,
              stepId: node.id,
              message: `Skipped ${recipient.email}. Template resolved to empty subject or body.`,
              metadata: {
                email: recipient.email,
                rowNumber: recipient.rowNumber,
                sourceName: recipient.sourceName,
              },
            });
            continue;
          }

          try {
            const info = await transporter.sendMail({
              from: user.email,
              to: recipient.email,
              subject,
              html: body,
              attachments: recipient.attachments || [],
            });
            executionContext.sent += 1;
            await addLog({
              eventId: event._id,
              runId: runRecord._id,
              userId: event.userId,
              level: 'info',
              stepType: node.type,
              stepId: node.id,
              message: `Sent to ${recipient.email}.`,
              metadata: {
                email: recipient.email,
                rowNumber: recipient.rowNumber,
                sourceId: recipient.sourceId,
                sourceName: recipient.sourceName,
                sourceLink: recipient.sourceLink,
                messageId: info.messageId,
                attachmentCount: recipient.attachments?.length || 0,
              },
            });
          } catch (error) {
            executionContext.failed += 1;
            await addLog({
              eventId: event._id,
              runId: runRecord._id,
              userId: event.userId,
              level: 'error',
              stepType: node.type,
              stepId: node.id,
              message: `Failed to send ${recipient.email}: ${error.message}`,
              metadata: {
                email: recipient.email,
                rowNumber: recipient.rowNumber,
                sourceName: recipient.sourceName,
              },
            });
          }
        }

        continue;
      }

      if (node.type === 'log') {
        await addLog({
          eventId: event._id,
          runId: runRecord._id,
          userId: event.userId,
          level: 'info',
          stepType: node.type,
          stepId: node.id,
          message: 'Log step executed.',
          metadata: {
            totalRecipients: executionContext.recipients.length,
            sent: executionContext.sent,
            failed: executionContext.failed,
          },
        });
      }
    }

    const status = executionContext.failed > 0 && executionContext.sent > 0
      ? 'partial'
      : executionContext.failed > 0
        ? 'failed'
        : 'completed';

    runRecord.status = status;
    runRecord.finishedAt = new Date();
    runRecord.summary = {
      totalRows: executionContext.totalRows,
      eligibleRecipients: executionContext.recipients.length,
      sent: executionContext.sent,
      failed: executionContext.failed,
      skipped: executionContext.skippedRows.length,
      sheetsProcessed: executionContext.sheetsProcessed,
    };
    await runRecord.save();

    event.lastRunAt = new Date();
    event.nextRunAt = new Date(Date.now() + event.intervalMinutes * 60 * 1000);
    await event.save();

    await addLog({
      eventId: event._id,
      runId: runRecord._id,
      userId: event.userId,
      level: 'info',
      stepType: 'system',
      message: `Run finished with status ${status}.`,
      metadata: runRecord.summary,
    });

    return { accepted: true, runId: runRecord._id };
  } catch (error) {
    if (runRecord) {
      runRecord.status = 'failed';
      runRecord.finishedAt = new Date();
      runRecord.errorMessage = error.message;
      await runRecord.save();

      await addLog({
        eventId: runRecord.eventId,
        runId: runRecord._id,
        userId: runRecord.userId,
        level: 'error',
        stepType: 'system',
        message: `Run crashed: ${error.message}`,
      });
    }

    console.error('Automation run error:', error);
    return { accepted: false, reason: error.message };
  } finally {
    runningEvents.delete(key);
  }
}

function unscheduleEvent(eventId) {
  const key = String(eventId);
  const current = eventTimers.get(key);
  if (current) {
    clearInterval(current);
    eventTimers.delete(key);
  }
}

function scheduleEvent(event) {
  unscheduleEvent(event._id);

  if (!event.isEnabled) {
    return;
  }

  const intervalMs = Math.max(1, Number(event.intervalMinutes || 1)) * 60 * 1000;

  const timerId = setInterval(() => {
    executeEventRun(event._id, 'scheduled').catch((error) => {
      console.error(`Scheduled run failed for event ${event._id}:`, error.message);
    });
  }, intervalMs);

  eventTimers.set(String(event._id), timerId);
}

async function initializeScheduler() {
  const events = await AutomationEvent.find({ isEnabled: true }).select('_id intervalMinutes isEnabled');
  events.forEach((event) => {
    scheduleEvent(event);
  });
  console.log(`Automation scheduler initialized with ${events.length} active event(s).`);
}

async function rescheduleEventById(eventId) {
  const event = await AutomationEvent.findById(eventId);
  if (!event) {
    unscheduleEvent(eventId);
    return;
  }
  scheduleEvent(event);
}

module.exports = {
  validateWorkflowGraph,
  executeEventRun,
  initializeScheduler,
  scheduleEvent,
  unscheduleEvent,
  rescheduleEventById,
};

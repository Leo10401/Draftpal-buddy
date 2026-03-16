const AutomationEvent = require('../models/AutomationEvent');
const AutomationRun = require('../models/AutomationRun');
const AutomationLog = require('../models/AutomationLog');
const {
  validateWorkflowGraph,
  executeEventRun,
  rescheduleEventById,
  unscheduleEvent,
} = require('../services/automationEngine');

function toSafeEvent(eventDoc) {
  return {
    id: eventDoc._id,
    name: eventDoc.name,
    description: eventDoc.description,
    isEnabled: eventDoc.isEnabled,
    intervalMinutes: eventDoc.intervalMinutes,
    sheetSources: eventDoc.sheetSources,
    workflow: eventDoc.workflow,
    lastRunAt: eventDoc.lastRunAt,
    nextRunAt: eventDoc.nextRunAt,
    createdAt: eventDoc.createdAt,
    updatedAt: eventDoc.updatedAt,
  };
}

exports.listEvents = async (req, res) => {
  try {
    const events = await AutomationEvent.find({ userId: req.user._id }).sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      events: events.map(toSafeEvent),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createEvent = async (req, res) => {
  try {
    const {
      name,
      description,
      isEnabled = true,
      intervalMinutes,
      sheetSources,
      workflow,
    } = req.body;

    if (!name || !intervalMinutes || !Array.isArray(sheetSources)) {
      return res.status(400).json({
        success: false,
        message: 'name, intervalMinutes and sheetSources are required.',
      });
    }

    const graphValidation = validateWorkflowGraph({ workflow });
    if (!graphValidation.valid) {
      return res.status(400).json({
        success: false,
        message: graphValidation.message,
      });
    }

    const event = await AutomationEvent.create({
      userId: req.user._id,
      name: String(name).trim(),
      description: String(description || '').trim(),
      isEnabled: Boolean(isEnabled),
      intervalMinutes: Number(intervalMinutes),
      sheetSources,
      workflow,
      nextRunAt: new Date(Date.now() + Number(intervalMinutes) * 60 * 1000),
    });

    await rescheduleEventById(event._id);

    return res.status(201).json({
      success: true,
      event: toSafeEvent(event),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getEvent = async (req, res) => {
  try {
    const event = await AutomationEvent.findOne({ _id: req.params.eventId, userId: req.user._id });
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    return res.status(200).json({ success: true, event: toSafeEvent(event) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateEvent = async (req, res) => {
  try {
    const event = await AutomationEvent.findOne({ _id: req.params.eventId, userId: req.user._id });
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    const nextName = req.body.name ?? event.name;
    const nextDescription = req.body.description ?? event.description;
    const nextIsEnabled = req.body.isEnabled ?? event.isEnabled;
    const nextInterval = req.body.intervalMinutes ?? event.intervalMinutes;
    const nextSheetSources = req.body.sheetSources ?? event.sheetSources;
    const nextWorkflow = req.body.workflow ?? event.workflow;

    const graphValidation = validateWorkflowGraph({ workflow: nextWorkflow });
    if (!graphValidation.valid) {
      return res.status(400).json({
        success: false,
        message: graphValidation.message,
      });
    }

    event.name = String(nextName).trim();
    event.description = String(nextDescription || '').trim();
    event.isEnabled = Boolean(nextIsEnabled);
    event.intervalMinutes = Number(nextInterval);
    event.sheetSources = nextSheetSources;
    event.workflow = nextWorkflow;
    event.nextRunAt = event.isEnabled
      ? new Date(Date.now() + Number(event.intervalMinutes) * 60 * 1000)
      : null;

    await event.save();
    await rescheduleEventById(event._id);

    return res.status(200).json({ success: true, event: toSafeEvent(event) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    const event = await AutomationEvent.findOneAndDelete({ _id: req.params.eventId, userId: req.user._id });
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    unscheduleEvent(event._id);

    return res.status(200).json({ success: true, message: 'Event deleted.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.runEventNow = async (req, res) => {
  try {
    const event = await AutomationEvent.findOne({ _id: req.params.eventId, userId: req.user._id });
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    const result = await executeEventRun(event._id, 'manual');
    if (!result.accepted) {
      return res.status(409).json({ success: false, message: result.reason });
    }

    return res.status(200).json({
      success: true,
      message: 'Run started.',
      runId: result.runId,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.listEventRuns = async (req, res) => {
  try {
    const { eventId } = req.params;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));

    const event = await AutomationEvent.findOne({ _id: eventId, userId: req.user._id }).select('_id');
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    const runs = await AutomationRun.find({ eventId: event._id, userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit);

    return res.status(200).json({ success: true, runs });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getRunLogs = async (req, res) => {
  try {
    const { runId } = req.params;
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 200)));

    const run = await AutomationRun.findOne({ _id: runId, userId: req.user._id }).select('_id eventId');
    if (!run) {
      return res.status(404).json({ success: false, message: 'Run not found.' });
    }

    const logs = await AutomationLog.find({ runId: run._id, userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit);

    return res.status(200).json({ success: true, logs });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getEventSheetLogs = async (req, res) => {
  try {
    const { eventId } = req.params;
    const sourceId = String(req.query.sourceId || '').trim();
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 200)));

    const event = await AutomationEvent.findOne({ _id: eventId, userId: req.user._id }).select('sheetSources');
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    if (!sourceId) {
      const aggregate = await AutomationLog.aggregate([
        {
          $match: {
            eventId: event._id,
            userId: req.user._id,
            stepType: 'send-email',
            level: 'info',
          },
        },
        {
          $group: {
            _id: '$metadata.sourceId',
            totalSent: { $sum: 1 },
            lastSentAt: { $max: '$createdAt' },
            sourceName: { $last: '$metadata.sourceName' },
            sourceLink: { $last: '$metadata.sourceLink' },
          },
        },
      ]);

      const statMap = new Map(
        aggregate
          .filter((item) => item._id)
          .map((item) => [String(item._id), item])
      );

      const sources = (event.sheetSources || []).map((source) => {
        const stat = statMap.get(String(source.id));
        return {
          sourceId: source.id,
          sourceName: source.name,
          sourceLink: source.sheetLink,
          totalSent: stat?.totalSent || 0,
          lastSentAt: stat?.lastSentAt || null,
        };
      });

      return res.status(200).json({ success: true, mode: 'sources', sources });
    }

    const sourceExists = (event.sheetSources || []).some((source) => String(source.id) === sourceId);
    if (!sourceExists) {
      return res.status(404).json({ success: false, message: 'Sheet source not found in this event.' });
    }

    const logs = await AutomationLog.find({
      eventId: event._id,
      userId: req.user._id,
      stepType: 'send-email',
      level: 'info',
      'metadata.sourceId': sourceId,
    })
      .sort({ createdAt: -1 })
      .limit(limit);

    const entries = logs.map((item) => ({
      id: item._id,
      email: item.metadata?.email || '',
      rowNumber: item.metadata?.rowNumber || null,
      sourceId: item.metadata?.sourceId || sourceId,
      sourceName: item.metadata?.sourceName || '',
      sourceLink: item.metadata?.sourceLink || '',
      messageId: item.metadata?.messageId || '',
      sentAt: item.createdAt,
      message: item.message,
    }));

    return res.status(200).json({ success: true, mode: 'logs', sourceId, logs: entries });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAccountSheetLogs = async (req, res) => {
  try {
    const sourceId = String(req.query.sourceId || '').trim();
    const eventIdRaw = String(req.query.eventId || '').trim();
    const eventId = eventIdRaw && eventIdRaw !== 'compose' && eventIdRaw !== 'null' ? eventIdRaw : '';
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 200)));

    if (!sourceId) {
      const aggregate = await AutomationLog.aggregate([
        {
          $match: {
            userId: req.user._id,
            stepType: 'send-email',
            level: 'info',
          },
        },
        {
          $group: {
            _id: {
              eventId: '$eventId',
              sourceId: '$metadata.sourceId',
            },
            totalSent: { $sum: 1 },
            lastSentAt: { $max: '$createdAt' },
            sourceName: { $last: '$metadata.sourceName' },
            sourceLink: { $last: '$metadata.sourceLink' },
            channel: { $last: '$metadata.channel' },
          },
        },
        {
          $match: {
            '_id.sourceId': { $exists: true, $ne: null },
          },
        },
        {
          $sort: {
            lastSentAt: -1,
          },
        },
      ]);

      const eventIds = Array.from(
        new Set(
          aggregate
            .map((item) => item?._id?.eventId)
            .filter((id) => id)
            .map((id) => String(id))
        )
      );
      const events = await AutomationEvent.find({ _id: { $in: eventIds }, userId: req.user._id }).select('name');
      const eventNameMap = new Map(events.map((evt) => [String(evt._id), evt.name]));

      const sources = aggregate.map((item) => {
        const normalizedEventId = item._id.eventId ? String(item._id.eventId) : 'compose';
        const normalizedSourceId = String(item._id.sourceId);
        const isCompose = normalizedEventId === 'compose';
        return {
          eventId: normalizedEventId,
          eventName: isCompose ? 'Compose' : eventNameMap.get(normalizedEventId) || 'Deleted event',
          sourceId: normalizedSourceId,
          sourceName: item.sourceName || 'Unnamed sheet',
          sourceLink: item.sourceLink || '',
          totalSent: item.totalSent || 0,
          lastSentAt: item.lastSentAt || null,
          channel: item.channel || '',
        };
      });

      return res.status(200).json({
        success: true,
        mode: 'sources',
        sources,
      });
    }

    const query = {
      userId: req.user._id,
      stepType: 'send-email',
      level: 'info',
      'metadata.sourceId': sourceId,
    };

    let eventName = 'Compose';
    if (eventId) {
      const event = await AutomationEvent.findOne({ _id: eventId, userId: req.user._id }).select('name');
      if (!event) {
        return res.status(404).json({ success: false, message: 'Event not found.' });
      }
      query.eventId = eventId;
      eventName = event.name;
    } else {
      query.$or = [{ eventId: null }, { eventId: { $exists: false } }];
    }

    const logs = await AutomationLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit);

    const entries = logs.map((item) => ({
      id: item._id,
      eventId: eventId || 'compose',
      eventName,
      email: item.metadata?.email || '',
      rowNumber: item.metadata?.rowNumber || null,
      sourceId: item.metadata?.sourceId || sourceId,
      sourceName: item.metadata?.sourceName || '',
      sourceLink: item.metadata?.sourceLink || '',
      messageId: item.metadata?.messageId || '',
      channel: item.metadata?.channel || '',
      sentAt: item.createdAt,
      message: item.message,
    }));

    return res.status(200).json({
      success: true,
      mode: 'logs',
      eventId: eventId || 'compose',
      sourceId,
      logs: entries,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

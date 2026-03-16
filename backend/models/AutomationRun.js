const mongoose = require('mongoose');

const AutomationRunSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AutomationEvent',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    trigger: {
      type: String,
      enum: ['manual', 'scheduled'],
      default: 'manual',
    },
    status: {
      type: String,
      enum: ['running', 'completed', 'failed', 'partial'],
      default: 'running',
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    finishedAt: {
      type: Date,
      default: null,
    },
    summary: {
      totalRows: {
        type: Number,
        default: 0,
      },
      eligibleRecipients: {
        type: Number,
        default: 0,
      },
      sent: {
        type: Number,
        default: 0,
      },
      failed: {
        type: Number,
        default: 0,
      },
      skipped: {
        type: Number,
        default: 0,
      },
      sheetsProcessed: {
        type: Number,
        default: 0,
      },
    },
    errorMessage: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

AutomationRunSchema.index({ eventId: 1, createdAt: -1 });

module.exports = mongoose.model('AutomationRun', AutomationRunSchema);

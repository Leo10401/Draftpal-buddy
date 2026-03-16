const mongoose = require('mongoose');

const AutomationLogSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AutomationEvent',
      index: true,
      default: null,
    },
    runId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AutomationRun',
      index: true,
      default: null,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    level: {
      type: String,
      enum: ['info', 'error'],
      default: 'info',
    },
    stepType: {
      type: String,
      trim: true,
      default: 'system',
    },
    stepId: {
      type: String,
      trim: true,
      default: '',
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

AutomationLogSchema.index({ runId: 1, createdAt: -1 });

module.exports = mongoose.model('AutomationLog', AutomationLogSchema);

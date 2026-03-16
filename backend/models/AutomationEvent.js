const mongoose = require('mongoose');

const SheetSourceSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    sheetLink: {
      type: String,
      required: true,
      trim: true,
    },
    certificateColumn: {
      type: String,
      default: 'certificate_status',
      trim: true,
    },
    certificateAvailableValue: {
      type: String,
      default: 'available',
      trim: true,
    },
    recipientEmailColumn: {
      type: String,
      default: 'email',
      trim: true,
    },
    recipientNameColumn: {
      type: String,
      default: 'name',
      trim: true,
    },
  },
  { _id: false }
);

const WorkflowNodeSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['timer', 'sheet-check', 'condition', 'send-email', 'log'],
    },
    label: {
      type: String,
      trim: true,
    },
    position: {
      x: {
        type: Number,
        default: 0,
      },
      y: {
        type: Number,
        default: 0,
      },
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { _id: false }
);

const WorkflowEdgeSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
    },
    source: {
      type: String,
      required: true,
    },
    target: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const AutomationEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 800,
      default: '',
    },
    isEnabled: {
      type: Boolean,
      default: true,
    },
    intervalMinutes: {
      type: Number,
      required: true,
      min: 1,
      max: 10080,
    },
    sheetSources: {
      type: [SheetSourceSchema],
      default: [],
      validate: {
        validator: function validateSources(value) {
          return Array.isArray(value) && value.length > 0;
        },
        message: 'At least one sheet source is required.',
      },
    },
    workflow: {
      nodes: {
        type: [WorkflowNodeSchema],
        default: [],
      },
      edges: {
        type: [WorkflowEdgeSchema],
        default: [],
      },
    },
    lastRunAt: {
      type: Date,
      default: null,
    },
    nextRunAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

AutomationEventSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('AutomationEvent', AutomationEventSchema);

const mongoose = require('mongoose');

const behaviorLogSchema = new mongoose.Schema({
  prisonerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Prisoner',
    required: true,
    index: true
  },
  behaviorType: {
    type: String,
    enum: ['positive', 'negative', 'neutral'],
    required: true,
    index: true
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    required: true,
    default: 'medium'
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  location: {
    type: String,
    required: true,
    trim: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  witnesses: [{
    type: String,
    trim: true
  }],
  actionTaken: {
    type: String,
    trim: true,
    maxlength: 500
  },
  recordedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  attachments: [{
    filename: String,
    url: String,
    uploadDate: {
      type: Date,
      default: Date.now
    }
  }],
  followUpRequired: {
    type: Boolean,
    default: false
  },
  followUpDate: {
    type: Date
  },
  followUpNotes: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'resolved', 'escalated'],
    default: 'pending'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewDate: {
    type: Date
  },
  reviewNotes: {
    type: String,
    trim: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for efficient querying
behaviorLogSchema.index({ prisonerId: 1, date: -1 });
behaviorLogSchema.index({ behaviorType: 1, severity: 1 });
behaviorLogSchema.index({ status: 1, followUpRequired: 1 });
behaviorLogSchema.index({ date: -1 });

// Virtual for calculating time since incident
behaviorLogSchema.virtual('daysSinceIncident').get(function() {
  const now = new Date();
  const diff = now - this.date;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
});

// Pre-save middleware to update timestamps
behaviorLogSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Static method to get behavior statistics for a prisoner
behaviorLogSchema.statics.getPrisonerStats = async function(prisonerId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const stats = await this.aggregate([
    {
      $match: {
        prisonerId: mongoose.Types.ObjectId(prisonerId),
        date: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$behaviorType',
        count: { $sum: 1 },
        avgSeverity: { $avg: {
          $switch: {
            branches: [
              { case: { $eq: ['$severity', 'low'] }, then: 1 },
              { case: { $eq: ['$severity', 'medium'] }, then: 2 },
              { case: { $eq: ['$severity', 'high'] }, then: 3 },
              { case: { $eq: ['$severity', 'critical'] }, then: 4 }
            ],
            default: 0
          }
        }}
      }
    }
  ]);
  
  return stats;
};

// Static method to get trending behavior issues
behaviorLogSchema.statics.getTrendingIssues = async function(days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const trending = await this.aggregate([
    {
      $match: {
        date: { $gte: startDate },
        behaviorType: 'negative'
      }
    },
    {
      $group: {
        _id: '$tags',
        count: { $sum: 1 },
        averageSeverity: {
          $avg: {
            $switch: {
              branches: [
                { case: { $eq: ['$severity', 'low'] }, then: 1 },
                { case: { $eq: ['$severity', 'medium'] }, then: 2 },
                { case: { $eq: ['$severity', 'high'] }, then: 3 },
                { case: { $eq: ['$severity', 'critical'] }, then: 4 }
              ],
              default: 0
            }
          }
        }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);
  
  return trending;
};

// Instance method to mark as reviewed
behaviorLogSchema.methods.markAsReviewed = async function(reviewerId, notes) {
  this.status = 'reviewed';
  this.reviewedBy = reviewerId;
  this.reviewDate = new Date();
  this.reviewNotes = notes;
  return this.save();
};

// Instance method to escalate
behaviorLogSchema.methods.escalate = async function(notes) {
  this.status = 'escalated';
  this.followUpRequired = true;
  if (notes) {
    this.followUpNotes = notes;
  }
  return this.save();
};

const BehaviorLog = mongoose.model('BehaviorLog', behaviorLogSchema);

module.exports = BehaviorLog;

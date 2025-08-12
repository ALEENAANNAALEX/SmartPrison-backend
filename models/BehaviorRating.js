const mongoose = require('mongoose');

const behaviorRatingSchema = new mongoose.Schema({
  ratingId: {
    type: String,
    required: true,
    unique: true
  },
  inmateId: {
    type: String,
    required: true
  },
  inmateName: {
    type: String,
    required: true
  },
  weekStartDate: {
    type: Date,
    required: true
  },
  behavior: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  cooperation: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  workEthic: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  socialInteraction: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  ruleCompliance: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  averageRating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comments: {
    type: String,
    default: ''
  },
  ratedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  ratedAt: {
    type: Date,
    default: Date.now
  },
  period: {
    type: String,
    enum: ['Weekly', 'Monthly', 'Quarterly'],
    default: 'Weekly'
  },
  approved: {
    type: Boolean,
    default: false
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index for efficient queries
behaviorRatingSchema.index({ inmateId: 1, weekStartDate: -1 });
behaviorRatingSchema.index({ ratedBy: 1, ratedAt: -1 });
behaviorRatingSchema.index({ averageRating: 1, ratedAt: -1 });

module.exports = mongoose.model('BehaviorRating', behaviorRatingSchema);

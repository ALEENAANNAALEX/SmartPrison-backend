const mongoose = require('mongoose');

const prisonerRatingSchema = new mongoose.Schema({
  prisonerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Prisoner',
    required: true,
    unique: true,
    index: true
  },
  // Current overall rating (updated from BehaviorRating aggregations)
  currentRating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },
  // Historical ratings snapshot
  ratingHistory: [{
    date: {
      type: Date,
      required: true
    },
    rating: {
      type: Number,
      min: 0,
      max: 5
    },
    reason: String
  }],
  // Category-specific current averages
  categoryRatings: {
    cooperation: {
      type: Number,
      min: 0,
      max: 5,
      default: 0
    },
    discipline: {
      type: Number,
      min: 0,
      max: 5,
      default: 0
    },
    respect: {
      type: Number,
      min: 0,
      max: 5,
      default: 0
    },
    workEthic: {
      type: Number,
      min: 0,
      max: 5,
      default: 0
    }
  },
  // Performance tier
  tier: {
    type: String,
    enum: ['excellent', 'good', 'average', 'poor', 'critical'],
    default: 'average'
  },
  // Total number of ratings received
  totalRatings: {
    type: Number,
    default: 0,
    min: 0
  },
  // Last rating date
  lastRatingDate: {
    type: Date
  },
  // Improvement metrics
  improvementRate: {
    type: Number,
    default: 0 // Positive means improving, negative means declining
  },
  // Achievements and milestones
  achievements: [{
    title: {
      type: String,
      required: true
    },
    description: String,
    dateEarned: {
      type: Date,
      default: Date.now
    },
    category: {
      type: String,
      enum: ['cooperation', 'discipline', 'respect', 'workEthic', 'general']
    }
  }],
  // Warning flags
  warnings: [{
    type: {
      type: String,
      enum: ['behavior', 'discipline', 'attitude', 'cooperation']
    },
    description: String,
    issueDate: {
      type: Date,
      default: Date.now
    },
    resolved: {
      type: Boolean,
      default: false
    },
    resolvedDate: Date
  }],
  // Goals and targets
  goals: [{
    category: String,
    targetRating: {
      type: Number,
      min: 1,
      max: 5
    },
    targetDate: Date,
    achieved: {
      type: Boolean,
      default: false
    },
    achievedDate: Date
  }],
  // Notes from staff
  staffNotes: [{
    note: String,
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    date: {
      type: Date,
      default: Date.now
    }
  }],
  // Metadata
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

// Indexes
prisonerRatingSchema.index({ currentRating: -1 });
prisonerRatingSchema.index({ tier: 1 });
prisonerRatingSchema.index({ lastRatingDate: -1 });

// Virtual for rating grade
prisonerRatingSchema.virtual('grade').get(function() {
  if (this.currentRating >= 4.5) return 'A+';
  if (this.currentRating >= 4.0) return 'A';
  if (this.currentRating >= 3.5) return 'B+';
  if (this.currentRating >= 3.0) return 'B';
  if (this.currentRating >= 2.5) return 'C+';
  if (this.currentRating >= 2.0) return 'C';
  if (this.currentRating >= 1.5) return 'D';
  return 'F';
});

// Pre-save middleware
prisonerRatingSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Update tier based on current rating
  if (this.currentRating >= 4.5) {
    this.tier = 'excellent';
  } else if (this.currentRating >= 3.5) {
    this.tier = 'good';
  } else if (this.currentRating >= 2.5) {
    this.tier = 'average';
  } else if (this.currentRating >= 1.5) {
    this.tier = 'poor';
  } else {
    this.tier = 'critical';
  }
  
  next();
});

// Static method to update rating from BehaviorRating
prisonerRatingSchema.statics.updateFromBehaviorRatings = async function(prisonerId, behaviorRatings) {
  if (!behaviorRatings || behaviorRatings.length === 0) return;
  
  // Calculate averages
  const avgOverall = behaviorRatings.reduce((sum, r) => sum + r.overallRating, 0) / behaviorRatings.length;
  const avgCooperation = behaviorRatings.reduce((sum, r) => sum + r.cooperation, 0) / behaviorRatings.length;
  const avgDiscipline = behaviorRatings.reduce((sum, r) => sum + r.discipline, 0) / behaviorRatings.length;
  const avgRespect = behaviorRatings.reduce((sum, r) => sum + r.respect, 0) / behaviorRatings.length;
  const avgWorkEthic = behaviorRatings.reduce((sum, r) => sum + r.workEthic, 0) / behaviorRatings.length;
  
  // Get or create prisoner rating
  let prisonerRating = await this.findOne({ prisonerId });
  
  if (!prisonerRating) {
    prisonerRating = new this({ prisonerId });
  }
  
  // Calculate improvement rate
  if (prisonerRating.ratingHistory.length > 0) {
    const lastHistoricalRating = prisonerRating.ratingHistory[prisonerRating.ratingHistory.length - 1].rating;
    prisonerRating.improvementRate = parseFloat((avgOverall - lastHistoricalRating).toFixed(2));
  }
  
  // Add to history if rating changed significantly
  if (!prisonerRating.currentRating || Math.abs(prisonerRating.currentRating - avgOverall) >= 0.2) {
    prisonerRating.ratingHistory.push({
      date: new Date(),
      rating: parseFloat(avgOverall.toFixed(2)),
      reason: 'Updated from behavior ratings'
    });
    
    // Keep only last 50 history entries
    if (prisonerRating.ratingHistory.length > 50) {
      prisonerRating.ratingHistory = prisonerRating.ratingHistory.slice(-50);
    }
  }
  
  // Update current values
  prisonerRating.currentRating = parseFloat(avgOverall.toFixed(2));
  prisonerRating.categoryRatings = {
    cooperation: parseFloat(avgCooperation.toFixed(2)),
    discipline: parseFloat(avgDiscipline.toFixed(2)),
    respect: parseFloat(avgRespect.toFixed(2)),
    workEthic: parseFloat(avgWorkEthic.toFixed(2))
  };
  prisonerRating.totalRatings = behaviorRatings.length;
  prisonerRating.lastRatingDate = behaviorRatings[0].ratingDate;
  
  await prisonerRating.save();
  return prisonerRating;
};

// Instance method to add achievement
prisonerRatingSchema.methods.addAchievement = function(title, description, category) {
  this.achievements.push({
    title,
    description,
    category,
    dateEarned: new Date()
  });
  return this.save();
};

// Instance method to add warning
prisonerRatingSchema.methods.addWarning = function(type, description) {
  this.warnings.push({
    type,
    description,
    issueDate: new Date(),
    resolved: false
  });
  return this.save();
};

// Instance method to resolve warning
prisonerRatingSchema.methods.resolveWarning = function(warningId) {
  const warning = this.warnings.id(warningId);
  if (warning) {
    warning.resolved = true;
    warning.resolvedDate = new Date();
  }
  return this.save();
};

// Instance method to add goal
prisonerRatingSchema.methods.setGoal = function(category, targetRating, targetDate) {
  this.goals.push({
    category,
    targetRating,
    targetDate,
    achieved: false
  });
  return this.save();
};

const PrisonerRating = mongoose.model('PrisonerRating', prisonerRatingSchema);

module.exports = PrisonerRating;

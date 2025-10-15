const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    required: true,
    enum: ['Security', 'Medical', 'Rehabilitation', 'Work', 'Visitation', 'Maintenance', 'Education', 'Recreation']
  },
  description: {
    type: String,
    trim: true
  },
  date: {
    type: Date,
    required: true
  },
  startTime: {
    type: String,
    required: true,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
  },
  endTime: {
    type: String,
    required: true,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
  },
  shift: {
    type: String,
    required: true,
    enum: ['day', 'night'],
    default: 'day'
  },
  location: {
    type: String,
    required: true,
    enum: [
      'Main Gate', 'Control Room',
      'Medical Room', 'Kitchen', 'Visitor Area', 'Library', 'Admin Office', 'Staff Room', 'Workshop', 'Isolation',
      'Block A - Cells', 'Block A - Dining Room', 'Block A - Yard', 'Block A - Common Area',
      'Block B - Cells', 'Block B - Dining Room', 'Block B - Yard', 'Block B - Common Area'
    ]
  },
  assignedStaff: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  priority: {
    type: String,
    required: true,
    enum: ['High', 'Medium', 'Low'],
    default: 'Medium'
  },
  status: {
    type: String,
    required: true,
    enum: ['Scheduled', 'In Progress', 'Completed', 'Cancelled', 'Postponed'],
    default: 'Scheduled'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  notes: {
    type: String,
    trim: true
  },
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringPattern: {
    type: String,
    enum: ['daily', 'weekly', 'monthly'],
    required: function() {
      return this.isRecurring;
    }
  },
  recurringEndDate: {
    type: Date,
    required: function() {
      return this.isRecurring;
    }
  }
}, {
  timestamps: true
});

// Index for efficient queries
scheduleSchema.index({ date: 1, startTime: 1 });
scheduleSchema.index({ location: 1, date: 1 });
scheduleSchema.index({ assignedStaff: 1, date: 1 });
scheduleSchema.index({ status: 1, date: 1 });
scheduleSchema.index({ createdBy: 1 });

// Virtual for duration calculation
scheduleSchema.virtual('duration').get(function() {
  const start = new Date(`2000-01-01T${this.startTime}:00`);
  const end = new Date(`2000-01-01T${this.endTime}:00`);
  const diffMs = end - start;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `${diffHours}h ${diffMinutes}m`;
});

// Ensure end time is after start time (with night shift support)
scheduleSchema.pre('save', function(next) {
  const start = new Date(`2000-01-01T${this.startTime}:00`);
  const end = new Date(`2000-01-01T${this.endTime}:00`);
  
  // Check if this is a night shift (spans midnight)
  const isNightShift = start.getHours() >= 21 || end.getHours() <= 9;
  
  if (isNightShift) {
    // For night shifts, end time can be earlier (next day)
    // Only validate if it's the same day and end is before start
    if (start.getHours() < 21 && end.getHours() > 9) {
      return next(new Error('End time must be after start time'));
    }
  } else {
    // For day shifts, normal validation
    if (end <= start) {
      return next(new Error('End time must be after start time'));
    }
  }
  
  next();
});

module.exports = mongoose.model('Schedule', scheduleSchema);

const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema({
  requestId: {
    type: String,
    required: true,
    unique: true
  },
  staffId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  leaveType: {
    type: String,
    required: true,
    enum: ['Annual Leave', 'Sick Leave', 'Emergency Leave', 'Personal Leave', 'Maternity Leave']
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  totalDays: {
    type: Number,
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  emergencyContact: {
    type: String,
    default: ''
  },
  coverageArrangement: {
    type: String,
    default: ''
  },
  additionalNotes: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
    default: 'Pending'
  },
  submittedDate: {
    type: Date,
    default: Date.now
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedDate: {
    type: Date,
    default: null
  },
  comments: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Index for efficient queries
leaveRequestSchema.index({ staffId: 1, status: 1 });
leaveRequestSchema.index({ status: 1, submittedDate: -1 });

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);

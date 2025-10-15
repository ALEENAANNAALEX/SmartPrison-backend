const mongoose = require('mongoose');

const ALLOWED_SLOTS = ['10:00', '11:00', '14:00', '15:00', '16:00']; // 10-11 am, 11-12 am, 2-3 pm, 3-4 pm, 4-5 pm

const visitSchema = new mongoose.Schema({
  prisoner: { type: mongoose.Schema.Types.ObjectId, ref: 'Prisoner', required: true },
  visitor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  visitDate: { type: Date, required: true }, // normalized to midnight UTC/local
  visitTime: { type: String, enum: ALLOWED_SLOTS, required: true },
  location: { type: String, enum: ['Visitor Area', 'Other'], default: 'Visitor Area' },
  purpose: { type: String },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled', 'completed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

// Normalize visitDate to the start of the day and validate visiting days
visitSchema.pre('save', function(next) {
  if (this.visitDate instanceof Date) {
    const d = new Date(this.visitDate);
    d.setHours(0, 0, 0, 0);
    this.visitDate = d;
    
    // TEMPORARY: Skip day validation for admin approvals
    // Skip validation if status is being changed to approved/rejected (admin action)
    if (this.isModified('status') && ['approved', 'rejected'].includes(this.status)) {
      console.log('🔓 Skipping day validation for admin action');
      return next();
    }
    
    // For Visitor Area, only allow Tuesday (2), Thursday (4), Saturday (6)
    if (this.location === 'Visitor Area') {
      const dayOfWeek = d.getDay(); // 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
      if (![2, 4, 6].includes(dayOfWeek)) {
        return next(new Error('Visits to Visitor Area are only allowed on Tuesday, Thursday, and Saturday'));
      }
    }
  }
  next();
});

// Enforce: only one visit per prisoner per day
visitSchema.index({ prisoner: 1, visitDate: 1 }, { unique: true });
// For capacity queries per slot
visitSchema.index({ visitDate: 1, visitTime: 1 });

module.exports = {
  Visit: mongoose.model('Visit', visitSchema),
  ALLOWED_SLOTS
};
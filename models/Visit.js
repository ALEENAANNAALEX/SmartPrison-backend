const mongoose = require('mongoose');

const ALLOWED_SLOTS = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];

const visitSchema = new mongoose.Schema({
  prisoner: { type: mongoose.Schema.Types.ObjectId, ref: 'Prisoner', required: true },
  visitor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  visitDate: { type: Date, required: true }, // normalized to midnight UTC/local
  visitTime: { type: String, enum: ALLOWED_SLOTS, required: true },
  purpose: { type: String },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled', 'completed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

// Normalize visitDate to the start of the day
visitSchema.pre('save', function(next) {
  if (this.visitDate instanceof Date) {
    const d = new Date(this.visitDate);
    d.setHours(0, 0, 0, 0);
    this.visitDate = d;
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
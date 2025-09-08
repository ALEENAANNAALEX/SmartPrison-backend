const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema({
  general: {
    prisonName: { type: String, default: 'Smart Prison Management System' },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    capacity: { type: Number, default: 1000 },
  },
  security: {
    sessionTimeout: { type: Number, default: 30 },
    passwordMinLength: { type: Number, default: 8 },
    requireSpecialChars: { type: Boolean, default: true },
    maxLoginAttempts: { type: Number, default: 3 },
    lockoutDuration: { type: Number, default: 15 },
  },
  visits: {
    maxVisitorsPerSession: { type: Number, default: 3 },
    visitDuration: { type: Number, default: 60 },
    advanceBookingDays: { type: Number, default: 7 },
    dailyVisitSlots: { type: Number, default: 8 },
    weekendVisits: { type: Boolean, default: true },
    holidayVisits: { type: Boolean, default: false },
  },
  updatedAt: { type: Date, default: Date.now },
});

SettingsSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Settings', SettingsSchema);
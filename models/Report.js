const mongoose = require('mongoose');

// Behavioral Report Schema
const behavioralReportSchema = new mongoose.Schema({
  prisoner: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Prisoner', 
    required: true 
  },
  
  reportedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  reportType: {
    type: String,
    enum: ['positive', 'negative', 'neutral'],
    required: true
  },
  
  category: {
    type: String,
    enum: ['discipline', 'cooperation', 'aggression', 'leadership', 'work_performance', 'education', 'other'],
    required: true
  },
  
  severity: {
    type: String,
    enum: ['minor', 'moderate', 'major', 'critical'],
    default: 'minor'
  },
  
  title: { type: String, required: true },
  description: { type: String, required: true },
  
  // Incident details
  incidentDate: { type: Date, required: true },
  location: { type: String },
  witnessesPresent: [{ type: String }],
  
  // Actions taken
  actionTaken: { type: String },
  disciplinaryAction: {
    type: String,
    enum: ['none', 'warning', 'privilege_loss', 'solitary_confinement', 'work_restriction', 'other']
  },
  
  // Follow-up
  followUpRequired: { type: Boolean, default: false },
  followUpDate: { type: Date },
  followUpNotes: { type: String },
  
  // Review status
  reviewStatus: {
    type: String,
    enum: ['pending', 'reviewed', 'approved', 'rejected'],
    default: 'pending'
  },
  
  reviewedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  
  reviewDate: { type: Date },
  reviewNotes: { type: String },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Incident Report Schema
const incidentReportSchema = new mongoose.Schema({
  incidentNumber: { type: String, required: true, unique: true },
  
  title: { type: String, required: true },
  description: { type: String, required: true },
  
  incidentType: {
    type: String,
    enum: ['fight', 'escape_attempt', 'contraband', 'medical_emergency', 'fire', 'riot', 'theft', 'assault', 'other'],
    required: true
  },
  
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    required: true
  },
  
  // Location and time
  location: { type: String, required: true },
  block: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'PrisonBlock' 
  },
  incidentDate: { type: Date, required: true },
  
  // People involved
  prisonersInvolved: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Prisoner' 
  }],
  
  staffInvolved: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  
  witnesses: [{
    name: { type: String },
    type: { type: String, enum: ['prisoner', 'staff', 'visitor', 'other'] },
    statement: { type: String }
  }],
  
  // Response and resolution
  responseTime: { type: Number }, // in minutes
  actionsTaken: [{ type: String }],
  
  injuries: [{
    person: { type: String },
    type: { type: String },
    severity: { type: String, enum: ['minor', 'moderate', 'severe'] },
    medicalAttention: { type: Boolean, default: false }
  }],
  
  propertyDamage: {
    occurred: { type: Boolean, default: false },
    description: { type: String },
    estimatedCost: { type: Number }
  },
  
  // Reporting
  reportedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  // Investigation
  investigationStatus: {
    type: String,
    enum: ['pending', 'ongoing', 'completed', 'closed'],
    default: 'pending'
  },
  
  investigatedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  
  investigationNotes: { type: String },
  
  // Review and approval
  reviewStatus: {
    type: String,
    enum: ['pending', 'reviewed', 'approved'],
    default: 'pending'
  },
  
  reviewedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  
  reviewDate: { type: Date },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Weekly Activity Report Schema
const weeklyActivityReportSchema = new mongoose.Schema({
  weekStartDate: { type: Date, required: true },
  weekEndDate: { type: Date, required: true },
  
  block: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'PrisonBlock',
    required: true 
  },
  
  reportedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  // Statistics
  statistics: {
    totalPrisoners: { type: Number, default: 0 },
    newAdmissions: { type: Number, default: 0 },
    releases: { type: Number, default: 0 },
    transfers: { type: Number, default: 0 },
    incidents: { type: Number, default: 0 },
    disciplinaryActions: { type: Number, default: 0 },
    medicalEmergencies: { type: Number, default: 0 },
    visits: { type: Number, default: 0 }
  },
  
  // Activities
  activities: [{
    name: { type: String },
    type: { type: String, enum: ['education', 'work', 'recreation', 'medical', 'religious', 'other'] },
    participants: { type: Number },
    duration: { type: Number }, // in hours
    notes: { type: String }
  }],
  
  // Issues and concerns
  issues: [{
    category: { type: String },
    description: { type: String },
    severity: { type: String, enum: ['low', 'medium', 'high'] },
    status: { type: String, enum: ['open', 'resolved', 'escalated'] }
  }],
  
  // Recommendations
  recommendations: [{ type: String }],
  
  // Overall assessment
  overallRating: {
    type: String,
    enum: ['excellent', 'good', 'satisfactory', 'needs_improvement', 'poor'],
    default: 'satisfactory'
  },
  
  summary: { type: String },
  
  // Review status
  reviewStatus: {
    type: String,
    enum: ['pending', 'reviewed', 'approved'],
    default: 'pending'
  },
  
  reviewedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  
  reviewDate: { type: Date },
  reviewNotes: { type: String },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Update timestamps before saving
behavioralReportSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

incidentReportSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

weeklyActivityReportSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = {
  BehavioralReport: mongoose.model('BehavioralReport', behavioralReportSchema),
  IncidentReport: mongoose.model('IncidentReport', incidentReportSchema),
  WeeklyActivityReport: mongoose.model('WeeklyActivityReport', weeklyActivityReportSchema)
};

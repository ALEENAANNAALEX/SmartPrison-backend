const mongoose = require('mongoose');

// Visit Rules Schema
const visitRulesSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  // Allow string, array, or object for compatibility
  rules: { type: mongoose.Schema.Types.Mixed, default: '' },
  restrictions: { type: mongoose.Schema.Types.Mixed, default: '' },
  prohibitedItems: { type: mongoose.Schema.Types.Mixed, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  allowedVisitorTypes: { type: mongoose.Schema.Types.Mixed, default: '' },
  securityChecks: { type: mongoose.Schema.Types.Mixed, default: '' },
  category: {
    type: String,
    enum: ['conduct', 'safety', 'hygiene', 'work', 'education', 'recreation', 'medical', 'general'],
    default: 'general',
    required: false
  },
  severity: {
    type: String,
    enum: ['minor', 'major', 'critical'],
    default: 'minor',
    required: false
  },
  // Visit frequency and duration
  visitingHours: {
    maxVisitsPerWeek: { type: Number, default: 2 },
    maxVisitsPerMonth: { type: Number, default: 8 },
    maxVisitDuration: { type: Number, default: 60 },
    maxVisitorsPerSession: { type: Number, default: 3 },
    minVisitorAge: { type: Number, default: 18 }
  },
  version: { type: String, required: false },
  isActive: { type: Boolean, default: true },
  effectiveDate: { type: Date, default: Date.now },
  expiryDate: { type: Date },
  // Store additional frontend fields for compatibility
  frontendData: {
    rules: { type: mongoose.Schema.Types.Mixed, default: [] },
    restrictions: { type: mongoose.Schema.Types.Mixed, default: [] },
    eligibilityCriteria: { type: mongoose.Schema.Types.Mixed, default: [] },
    category: { type: String, default: 'general' }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Parole Rules Schema
const paroleRulesSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  
  // Eligibility criteria
  eligibilityCriteria: {
    minimumSentenceServed: { type: Number }, // percentage
    minimumTimeServed: { type: Number }, // in months
    behaviorScoreRequired: { type: Number, default: 70 },
    noMajorIncidents: { type: Boolean, default: true },
    completedPrograms: [{ type: String }]
  },
  
  // Parole conditions
  conditions: [{
    condition: { type: String, required: true },
    mandatory: { type: Boolean, default: true },
    description: { type: String }
  }],
  
  // Reporting requirements
  reportingRequirements: {
    frequency: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'weekly' },
    method: { type: String, enum: ['in_person', 'phone', 'electronic'], default: 'in_person' },
    officer: { type: String }
  },
  
  // Restrictions
  restrictions: {
    travelRestrictions: { type: String },
    employmentRequirements: { type: String },
    residenceRequirements: { type: String },
    associationRestrictions: { type: String },
    substanceRestrictions: { type: String }
  },
  
  // Violation consequences
  violationConsequences: [{
    violationType: { type: String },
    consequence: { type: String },
    severity: { type: String, enum: ['minor', 'major', 'severe'] }
  }],
  
  // Status and versioning
  version: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  effectiveDate: { type: Date, default: Date.now },
  expiryDate: { type: Date },
  
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// General Prison Rules Schema
const prisonRulesSchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: {
    type: String,
    enum: ['conduct', 'safety', 'security', 'hygiene', 'work', 'education', 'recreation', 'medical', 'general'],
    required: true
  },
  
  description: { type: String, required: true },
  
  // Rule details
  rules: [{
    ruleNumber: { type: String },
    ruleText: { type: String, required: true },
    severity: { type: String, enum: ['minor', 'major', 'critical'], default: 'minor' },
    penalty: { type: String }
  }],
  
  // Applicability
  applicableToBlocks: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'PrisonBlock' 
  }],
  
  applicableToSecurityLevels: [{
    type: String,
    enum: ['minimum', 'medium', 'maximum', 'supermax']
  }],
  
  // Enforcement
  enforcementGuidelines: { type: String },
  reportingProcedure: { type: String },
  
  // Exceptions
  exceptions: [{
    condition: { type: String },
    description: { type: String },
    approvalRequired: { type: Boolean, default: true }
  }],
  
  // Status and versioning
  version: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  effectiveDate: { type: Date, default: Date.now },
  expiryDate: { type: Date },
  
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  approvedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  
  approvalDate: { type: Date },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Update timestamps before saving
visitRulesSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

paroleRulesSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

prisonRulesSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = {
  VisitRules: mongoose.model('VisitRules', visitRulesSchema),
  ParoleRules: mongoose.model('ParoleRules', paroleRulesSchema),
  PrisonRules: mongoose.model('PrisonRules', prisonRulesSchema)
};

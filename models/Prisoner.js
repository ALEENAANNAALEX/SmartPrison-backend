const mongoose = require('mongoose');

const prisonerSchema = new mongoose.Schema({
  // Personal Information
  prisonerNumber: { type: String, required: true, unique: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  middleName: { type: String },
  dateOfBirth: { type: Date, required: true },
  gender: { type: String, enum: ['male', 'female', 'other'], required: true },
  nationality: { type: String, default: 'Indian' },
  
  // Physical Description
  height: { type: Number }, // in cm
  weight: { type: Number }, // in kg
  eyeColor: { type: String },
  hairColor: { type: String },
  distinguishingMarks: [{ type: String }],
  photograph: { type: String }, // URL to photo
  governmentId: { type: String }, // URL to uploaded government ID (image or PDF)
  
  // Contact Information
  address: {
    street: { type: String },
    city: { type: String },
    state: { type: String },
    pincode: { type: String },
    country: { type: String, default: 'India' }
  },
  
  // Primary emergency contact (kept for backward compatibility)
  emergencyContact: {
    name: { type: String },
    relationship: { type: String },
    phone: { type: String },
    address: { type: String }
  },

  // Multiple emergency contacts support
  emergencyContacts: [{
    name: { type: String, required: true },
    relationship: { type: String },
    phone: { type: String },
    address: { type: String }
  }],
  
  // Legal Information
  charges: [{
    charge: { type: String, required: true },
    section: { type: String }, // IPC section
    severity: { type: String, enum: ['minor', 'major', 'heinous'] },
    dateOfCharge: { type: Date }
  }],
  
  sentenceDetails: {
    sentenceType: { type: String, enum: ['life', 'death', 'fixed_term', 'indefinite'] },
    sentenceLength: { type: Number }, // in months
    startDate: { type: Date },
    expectedReleaseDate: { type: Date },
    paroleEligibilityDate: { type: Date }
  },
  
  courtDetails: {
    courtName: { type: String },
    judgeNumber: { type: String },
    caseNumber: { type: String },
    lawyerName: { type: String },
    lawyerContact: { type: String }
  },
  
  // Prison Assignment
  currentBlock: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'PrisonBlock',
    required: true 
  },
  cellNumber: { type: String },
  admissionDate: { type: Date, default: Date.now },
  
  // Behavior and Classification
  securityLevel: {
    type: String,
    enum: ['minimum', 'medium', 'maximum', 'supermax'],
    default: 'medium'
  },
  
  behaviorScore: { type: Number, default: 50, min: 0, max: 100 },
  riskLevel: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  
  // Medical Information
  medicalInfo: {
    bloodGroup: { type: String },
    allergies: [{ type: String }],
    chronicConditions: [{ type: String }],
    medications: [{
      name: { type: String },
      dosage: { type: String },
      frequency: { type: String }
    }],
    lastCheckup: { type: Date },
    medicalNotes: { type: String }
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'released', 'transferred', 'deceased', 'escaped'],
    default: 'active'
  },
  
  // Visits and Activities
  visitHistory: [{
    visitorName: { type: String },
    relationship: { type: String },
    visitDate: { type: Date },
    duration: { type: Number }, // in minutes
    notes: { type: String }
  }],
  
  workAssignment: {
    job: { type: String },
    department: { type: String },
    startDate: { type: Date },
    salary: { type: Number },
    performance: { type: String, enum: ['poor', 'average', 'good', 'excellent'] }
  },
  
  educationPrograms: [{
    program: { type: String },
    startDate: { type: Date },
    completionDate: { type: Date },
    status: { type: String, enum: ['enrolled', 'completed', 'dropped'] },
    grade: { type: String }
  }],
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Update the updatedAt field before saving
prisonerSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual for full name
prisonerSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.middleName ? this.middleName + ' ' : ''}${this.lastName}`;
});

// Virtual for age
prisonerSchema.virtual('age').get(function() {
  if (!this.dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
});

module.exports = mongoose.model('Prisoner', prisonerSchema);

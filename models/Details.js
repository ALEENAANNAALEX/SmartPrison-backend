const mongoose = require('mongoose');

const detailsSchema = new mongoose.Schema({
  // Reference to the main user record
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  userRole: {
    type: String,
    required: true,
    enum: ['admin', 'warden', 'visitor', 'user', 'staff'],
    index: true
  },
  userEmail: {
    type: String,
    required: true,
    index: true
  },
  
  // Common fields for all roles
  personalInfo: {
    fullName: String,
    dateOfBirth: Date,
    gender: {
      type: String,
      enum: ['male', 'female', 'other', null],
      default: null
    },
    nationality: {
      type: String,
      default: 'Indian'
    },
    maritalStatus: {
      type: String,
      enum: ['single', 'married', 'divorced', 'widowed']
    },
    profilePicture: String
  },
  
  // Contact Information
  contactInfo: {
    primaryPhone: String,
    secondaryPhone: String,
    email: String,
    address: {
      street: String,
      city: String,
      state: String,
      pinCode: String,
      country: { type: String, default: 'India' }
    },
    emergencyContact: {
      name: String,
      relationship: String,
      phone: String,
      email: String
    }
  },
  
  // Identification Documents
  identification: {
    aadharNumber: String,
    panNumber: String,
    passportNumber: String,
    drivingLicense: String,
    voterIdNumber: String,
    documents: [{
      type: {
        type: String,
        enum: ['aadhar', 'pan', 'passport', 'driving_license', 'voter_id', 'other']
      },
      number: String,
      issuedDate: Date,
      expiryDate: Date,
      issuingAuthority: String,
      documentUrl: String,
      verified: { type: Boolean, default: false },
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin'
      },
      verifiedAt: Date
    }]
  },
  
  // Role-specific details
  roleSpecificDetails: {
    // For Wardens
    wardenDetails: {
      employeeId: String,
      department: String,
      rank: String,
      yearsOfService: Number,
      facility: String,
      experience: String,
      specialization: String,
      shift: {
        type: String,
        enum: ['day', 'night', 'rotating']
      },
      assignedBlocks: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Block'
      }],
      certifications: [{
        name: String,
        issuedBy: String,
        issuedDate: Date,
        expiryDate: Date,
        certificateUrl: String
      }],
      trainingRecords: [{
        trainingName: String,
        completedDate: Date,
        instructor: String,
        duration: String,
        certificateUrl: String
      }]
    },
    
    // For Visitors
    visitorDetails: {
      relationshipToPrisoner: {
        type: String,
        enum: ['family', 'friend', 'lawyer', 'social_worker', 'other']
      },
      prisonerRelations: [{
        prisonerId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Prisoner'
        },
        relationship: String,
        approved: { type: Boolean, default: false },
        approvedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Warden'
        },
        approvedAt: Date
      }],
      backgroundCheck: {
        status: {
          type: String,
          enum: ['pending', 'cleared', 'flagged', 'rejected'],
          default: 'pending'
        },
        checkedDate: Date,
        checkedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Admin'
        },
        notes: String
      },
      visitHistory: {
        totalVisits: { type: Number, default: 0 },
        lastVisitDate: Date,
        restrictions: [{
          type: {
            type: String,
            enum: ['time_limit', 'supervised_only', 'no_contact', 'banned']
          },
          reason: String,
          startDate: Date,
          endDate: Date,
          isActive: { type: Boolean, default: true }
        }]
      }
    },
    
    // For Admins
    adminDetails: {
      employeeId: String,
      department: String,
      position: String,
      clearanceLevel: {
        type: Number,
        min: 1,
        max: 10
      },
      permissions: {
        userManagement: { type: Boolean, default: false },
        wardenManagement: { type: Boolean, default: false },
        visitorManagement: { type: Boolean, default: false },
        prisonerManagement: { type: Boolean, default: false },
        systemSettings: { type: Boolean, default: false },
        reports: { type: Boolean, default: false },
        auditLogs: { type: Boolean, default: false },
        emergencyOverride: { type: Boolean, default: false }
      },
      workSchedule: {
        type: String,
        enum: ['regular', 'flexible', 'on_call']
      },
      twoFactorEnabled: { type: Boolean, default: false },
      lastPasswordChange: Date
    }
  },
  
  // Medical Information (optional)
  medicalInfo: {
    bloodGroup: {
      type: String,
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
    },
    allergies: [String],
    medications: [String],
    medicalConditions: [String],
    emergencyMedicalContact: {
      doctorName: String,
      hospitalName: String,
      phone: String
    }
  },
  
  // Status and Verification
  verificationStatus: {
    isVerified: { type: Boolean, default: false },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    },
    verifiedAt: Date,
    verificationNotes: String
  },
  
  // Audit Trail
  auditTrail: [{
    action: String,
    field: String,
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    changedAt: { type: Date, default: Date.now },
    ipAddress: String,
    reason: String
  }],
  
  // Metadata
  isActive: { type: Boolean, default: true },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  collection: 'details'
});

// Indexes for better performance
detailsSchema.index({ userId: 1, userRole: 1 });
detailsSchema.index({ userEmail: 1 });
detailsSchema.index({ userRole: 1 });
detailsSchema.index({ 'personalInfo.fullName': 1 });
detailsSchema.index({ 'contactInfo.primaryPhone': 1 });
detailsSchema.index({ 'identification.aadharNumber': 1 });
detailsSchema.index({ 'roleSpecificDetails.wardenDetails.employeeId': 1 });
detailsSchema.index({ 'verificationStatus.isVerified': 1 });

// Virtual for full address
detailsSchema.virtual('fullAddress').get(function() {
  if (!this.contactInfo?.address) return '';
  const { street, city, state, pinCode, country } = this.contactInfo.address;
  return [street, city, state, pinCode, country].filter(Boolean).join(', ');
});

// Method to add audit trail entry
detailsSchema.methods.addAuditEntry = function(action, field, oldValue, newValue, changedBy, ipAddress = '', reason = '') {
  this.auditTrail.push({
    action,
    field,
    oldValue,
    newValue,
    changedBy,
    ipAddress,
    reason,
    changedAt: new Date()
  });
  
  // Keep only last 100 audit entries
  if (this.auditTrail.length > 100) {
    this.auditTrail = this.auditTrail.slice(-100);
  }
  
  return this.save();
};

// Method to verify details
detailsSchema.methods.verify = function(verifiedBy, notes = '') {
  this.verificationStatus.isVerified = true;
  this.verificationStatus.verifiedBy = verifiedBy;
  this.verificationStatus.verifiedAt = new Date();
  this.verificationStatus.verificationNotes = notes;
  
  return this.save();
};

// Static method to find by role
detailsSchema.statics.findByRole = function(role) {
  return this.find({ userRole: role, isActive: true });
};

// Static method to find by user ID
detailsSchema.statics.findByUserId = function(userId) {
  return this.findOne({ userId, isActive: true });
};

// Static method to find verified details
detailsSchema.statics.findVerified = function(role = null) {
  const query = { 'verificationStatus.isVerified': true, isActive: true };
  if (role) query.userRole = role;
  return this.find(query);
};

module.exports = mongoose.model('Details', detailsSchema);

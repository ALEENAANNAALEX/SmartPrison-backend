const mongoose = require('mongoose');

const prisonBlockSchema = new mongoose.Schema({
  name: { type: String, required: true },
  blockCode: { type: String, required: true, unique: true },
  description: { type: String },
  
  // Capacity and occupancy
  totalCapacity: { type: Number, required: true },
  currentOccupancy: { type: Number, default: 0 },
  
  // Cells count (replaces floor/wing in UI)
  cells: { type: Number },
  
  // Security and classification
  securityLevel: {
    type: String,
    enum: ['minimum', 'medium', 'maximum', 'supermax'],
    required: true
  },
  
  // Block type
  blockType: {
    type: String,
    enum: ['general', 'isolation', 'medical', 'protective', 'death_row'],
    default: 'general'
  },
  
  // Location and facilities
  floor: { type: Number },
  wing: { type: String },
  facilities: [{
    name: { type: String },
    description: { type: String },
    isOperational: { type: Boolean, default: true }
  }],
  
  // Staff assignments
  assignedWardens: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  
  headWarden: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  
  // Status and operations
  isActive: { type: Boolean, default: true },
  isUnderMaintenance: { type: Boolean, default: false },
  
  // Rules specific to this block
  blockRules: [{
    rule: { type: String },
    severity: { type: String, enum: ['low', 'medium', 'high'] },
    createdAt: { type: Date, default: Date.now }
  }],
  
  // Statistics
  statistics: {
    totalIncidents: { type: Number, default: 0 },
    lastIncidentDate: { type: Date },
    averageBehaviorScore: { type: Number, default: 0 },
    lastInspectionDate: { type: Date },
    inspectionScore: { type: Number }
  },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Update the updatedAt field before saving
prisonBlockSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('PrisonBlock', prisonBlockSchema);

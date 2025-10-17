const express = require('express');
const router = express.Router();
const BehaviorLog = require('../models/BehaviorLog');
const Prisoner = require('../models/Prisoner');
const { authenticate } = require('../middleware/auth');

// Get all behavior logs with filters
router.get('/logs', authenticate, async (req, res) => {
  try {
    const { prisonerId, startDate, endDate, behaviorType, severity } = req.query;
    
    let query = {};
    
    if (prisonerId) query.prisonerId = prisonerId;
    if (behaviorType) query.behaviorType = behaviorType;
    if (severity) query.severity = severity;
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }
    
    const logs = await BehaviorLog.find(query)
      .populate('prisonerId', 'name prisonerNumber')
      .populate('recordedBy', 'name email')
      .sort({ date: -1 });
    
    res.json(logs);
  } catch (error) {
    console.error('Error fetching behavior logs:', error);
    res.status(500).json({ error: 'Failed to fetch behavior logs' });
  }
});

// Get behavior summary for a prisoner
router.get('/summary/:prisonerId', authenticate, async (req, res) => {
  try {
    const { prisonerId } = req.params;
    const { months = 6 } = req.query;
    
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - parseInt(months));
    
    const logs = await BehaviorLog.find({
      prisonerId,
      date: { $gte: startDate }
    }).sort({ date: -1 });
    
    // Calculate behavior statistics
    const stats = {
      totalIncidents: logs.length,
      positive: logs.filter(l => l.behaviorType === 'positive').length,
      negative: logs.filter(l => l.behaviorType === 'negative').length,
      neutral: logs.filter(l => l.behaviorType === 'neutral').length,
      bySeverity: {
        low: logs.filter(l => l.severity === 'low').length,
        medium: logs.filter(l => l.severity === 'medium').length,
        high: logs.filter(l => l.severity === 'high').length,
        critical: logs.filter(l => l.severity === 'critical').length,
      },
      recentLogs: logs.slice(0, 10),
      behaviorScore: calculateBehaviorScore(logs)
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching behavior summary:', error);
    res.status(500).json({ error: 'Failed to fetch behavior summary' });
  }
});

// Create new behavior log
router.post('/logs', authenticate, async (req, res) => {
  try {
    const {
      prisonerId,
      behaviorType,
      severity,
      description,
      location,
      witnesses,
      actionTaken
    } = req.body;
    
    // Validate prisoner exists
    const prisoner = await Prisoner.findById(prisonerId);
    if (!prisoner) {
      return res.status(404).json({ error: 'Prisoner not found' });
    }
    
    const behaviorLog = new BehaviorLog({
      prisonerId,
      behaviorType,
      severity,
      description,
      location,
      witnesses: witnesses || [],
      actionTaken: actionTaken || '',
      recordedBy: req.user._id,
      date: new Date()
    });
    
    await behaviorLog.save();
    
    // Update prisoner's behavior rating
    await updatePrisonerBehaviorRating(prisonerId);
    
    res.status(201).json({
      message: 'Behavior log created successfully',
      log: behaviorLog
    });
  } catch (error) {
    console.error('Error creating behavior log:', error);
    res.status(500).json({ error: 'Failed to create behavior log' });
  }
});

// Update behavior log
router.put('/logs/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const log = await BehaviorLog.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).populate('prisonerId', 'name prisonerNumber');
    
    if (!log) {
      return res.status(404).json({ error: 'Behavior log not found' });
    }
    
    // Recalculate prisoner behavior rating
    await updatePrisonerBehaviorRating(log.prisonerId);
    
    res.json({
      message: 'Behavior log updated successfully',
      log
    });
  } catch (error) {
    console.error('Error updating behavior log:', error);
    res.status(500).json({ error: 'Failed to update behavior log' });
  }
});

// Delete behavior log
router.delete('/logs/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const log = await BehaviorLog.findByIdAndDelete(id);
    
    if (!log) {
      return res.status(404).json({ error: 'Behavior log not found' });
    }
    
    // Recalculate prisoner behavior rating
    await updatePrisonerBehaviorRating(log.prisonerId);
    
    res.json({ message: 'Behavior log deleted successfully' });
  } catch (error) {
    console.error('Error deleting behavior log:', error);
    res.status(500).json({ error: 'Failed to delete behavior log' });
  }
});

// Get behavior trends
router.get('/trends', authenticate, async (req, res) => {
  try {
    const { startDate, endDate, blockId } = req.query;
    
    let matchStage = {};
    if (startDate || endDate) {
      matchStage.date = {};
      if (startDate) matchStage.date.$gte = new Date(startDate);
      if (endDate) matchStage.date.$lte = new Date(endDate);
    }
    
    const trends = await BehaviorLog.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' },
            behaviorType: '$behaviorType'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);
    
    res.json(trends);
  } catch (error) {
    console.error('Error fetching behavior trends:', error);
    res.status(500).json({ error: 'Failed to fetch behavior trends' });
  }
});

// Helper function to calculate behavior score (0-100)
function calculateBehaviorScore(logs) {
  if (logs.length === 0) return 50; // Neutral starting score
  
  let score = 50;
  const weights = {
    positive: { low: 2, medium: 4, high: 6, critical: 8 },
    negative: { low: -2, medium: -4, high: -6, critical: -8 },
    neutral: { low: 0, medium: 0, high: 0, critical: 0 }
  };
  
  // Recent logs have more weight
  logs.forEach((log, index) => {
    const recencyFactor = 1 - (index / logs.length) * 0.5; // 100% to 50% weight
    const weight = weights[log.behaviorType]?.[log.severity] || 0;
    score += weight * recencyFactor;
  });
  
  return Math.max(0, Math.min(100, Math.round(score)));
}

// Helper function to update prisoner's behavior rating
async function updatePrisonerBehaviorRating(prisonerId) {
  try {
    const logs = await BehaviorLog.find({ prisonerId })
      .sort({ date: -1 })
      .limit(50); // Consider last 50 logs
    
    const behaviorScore = calculateBehaviorScore(logs);
    
    await Prisoner.findByIdAndUpdate(prisonerId, {
      behaviorScore,
      lastBehaviorUpdate: new Date()
    });
  } catch (error) {
    console.error('Error updating prisoner behavior rating:', error);
  }
}

module.exports = router;

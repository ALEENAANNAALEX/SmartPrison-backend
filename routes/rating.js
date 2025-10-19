const express = require('express');
const router = express.Router();
const BehaviorRating = require('../models/BehaviorRating');
const Prisoner = require('../models/Prisoner');
const { authenticate } = require('../middleware/auth');

// Get all ratings with filters
router.get('/', authenticate, async (req, res) => {
  try {
    const { prisonerId, ratedBy, minRating, maxRating, startDate, endDate } = req.query;
    
    let query = {};
    
    if (prisonerId) query.prisonerId = prisonerId;
    if (ratedBy) query.ratedBy = ratedBy;
    
    if (minRating || maxRating) {
      query.overallRating = {};
      if (minRating) query.overallRating.$gte = parseFloat(minRating);
      if (maxRating) query.overallRating.$lte = parseFloat(maxRating);
    }
    
    if (startDate || endDate) {
      query.ratingDate = {};
      if (startDate) query.ratingDate.$gte = new Date(startDate);
      if (endDate) query.ratingDate.$lte = new Date(endDate);
    }
    
    const ratings = await BehaviorRating.find(query)
      .populate('prisonerId', 'name prisonerNumber')
      .populate('ratedBy', 'name email role')
      .sort({ ratingDate: -1 })
      .limit(100);
    
    res.json(ratings);
  } catch (error) {
    console.error('Error fetching ratings:', error);
    res.status(500).json({ error: 'Failed to fetch ratings' });
  }
});

// Get rating summary for a prisoner
router.get('/summary/:prisonerId', authenticate, async (req, res) => {
  try {
    const { prisonerId } = req.params;
    const { months = 6 } = req.query;
    
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - parseInt(months));
    
    const ratings = await BehaviorRating.find({
      prisonerId,
      ratingDate: { $gte: startDate }
    }).sort({ ratingDate: -1 });
    
    if (ratings.length === 0) {
      return res.json({
        prisonerId,
        totalRatings: 0,
        averageRating: 0,
        trend: 'neutral',
        ratings: []
      });
    }
    
    // Calculate averages
    const totalRatings = ratings.length;
    const avgOverall = ratings.reduce((sum, r) => sum + r.overallRating, 0) / totalRatings;
    const avgCooperation = ratings.reduce((sum, r) => sum + r.cooperation, 0) / totalRatings;
    const avgDiscipline = ratings.reduce((sum, r) => sum + r.discipline, 0) / totalRatings;
    const avgRespect = ratings.reduce((sum, r) => sum + r.respect, 0) / totalRatings;
    const avgWorkEthic = ratings.reduce((sum, r) => sum + r.workEthic, 0) / totalRatings;
    
    // Calculate trend (comparing recent vs older ratings)
    const recentRatings = ratings.slice(0, Math.ceil(totalRatings / 3));
    const olderRatings = ratings.slice(-Math.ceil(totalRatings / 3));
    
    const recentAvg = recentRatings.reduce((sum, r) => sum + r.overallRating, 0) / recentRatings.length;
    const olderAvg = olderRatings.reduce((sum, r) => sum + r.overallRating, 0) / olderRatings.length;
    
    let trend = 'neutral';
    const trendDiff = recentAvg - olderAvg;
    if (trendDiff > 0.3) trend = 'improving';
    else if (trendDiff < -0.3) trend = 'declining';
    
    res.json({
      prisonerId,
      totalRatings,
      averageRating: parseFloat(avgOverall.toFixed(2)),
      categoryAverages: {
        cooperation: parseFloat(avgCooperation.toFixed(2)),
        discipline: parseFloat(avgDiscipline.toFixed(2)),
        respect: parseFloat(avgRespect.toFixed(2)),
        workEthic: parseFloat(avgWorkEthic.toFixed(2))
      },
      trend,
      trendPercentage: parseFloat((trendDiff * 20).toFixed(1)), // Convert to percentage
      recentRatings: ratings.slice(0, 5),
      highestRating: Math.max(...ratings.map(r => r.overallRating)),
      lowestRating: Math.min(...ratings.map(r => r.overallRating))
    });
  } catch (error) {
    console.error('Error fetching rating summary:', error);
    res.status(500).json({ error: 'Failed to fetch rating summary' });
  }
});

// Create new rating
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      prisonerId,
      cooperation,
      discipline,
      respect,
      workEthic,
      notes,
      period
    } = req.body;
    
    // Validate prisoner exists
    const prisoner = await Prisoner.findById(prisonerId);
    if (!prisoner) {
      return res.status(404).json({ error: 'Prisoner not found' });
    }
    
    // Validate ratings are within range
    const ratings = [cooperation, discipline, respect, workEthic];
    if (ratings.some(r => r < 1 || r > 5)) {
      return res.status(400).json({ error: 'All ratings must be between 1 and 5' });
    }
    
    // Calculate overall rating (average of all categories)
    const overallRating = (cooperation + discipline + respect + workEthic) / 4;
    
    const rating = new BehaviorRating({
      prisonerId,
      cooperation,
      discipline,
      respect,
      workEthic,
      overallRating: parseFloat(overallRating.toFixed(2)),
      notes: notes || '',
      period: period || 'monthly',
      ratedBy: req.user._id,
      ratingDate: new Date()
    });
    
    await rating.save();
    
    // Update prisoner's overall rating
    await updatePrisonerRating(prisonerId);
    
    res.status(201).json({
      message: 'Rating created successfully',
      rating
    });
  } catch (error) {
    console.error('Error creating rating:', error);
    res.status(500).json({ error: 'Failed to create rating' });
  }
});

// Update rating
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Recalculate overall rating if any category changed
    if (updates.cooperation || updates.discipline || updates.respect || updates.workEthic) {
      const rating = await BehaviorRating.findById(id);
      if (!rating) {
        return res.status(404).json({ error: 'Rating not found' });
      }
      
      const cooperation = updates.cooperation || rating.cooperation;
      const discipline = updates.discipline || rating.discipline;
      const respect = updates.respect || rating.respect;
      const workEthic = updates.workEthic || rating.workEthic;
      
      updates.overallRating = parseFloat(((cooperation + discipline + respect + workEthic) / 4).toFixed(2));
    }
    
    const rating = await BehaviorRating.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).populate('prisonerId', 'name prisonerNumber');
    
    if (!rating) {
      return res.status(404).json({ error: 'Rating not found' });
    }
    
    // Update prisoner's overall rating
    await updatePrisonerRating(rating.prisonerId);
    
    res.json({
      message: 'Rating updated successfully',
      rating
    });
  } catch (error) {
    console.error('Error updating rating:', error);
    res.status(500).json({ error: 'Failed to update rating' });
  }
});

// Delete rating
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const rating = await BehaviorRating.findByIdAndDelete(id);
    
    if (!rating) {
      return res.status(404).json({ error: 'Rating not found' });
    }
    
    // Update prisoner's overall rating
    await updatePrisonerRating(rating.prisonerId);
    
    res.json({ message: 'Rating deleted successfully' });
  } catch (error) {
    console.error('Error deleting rating:', error);
    res.status(500).json({ error: 'Failed to delete rating' });
  }
});

// Get rating analytics
router.get('/analytics', authenticate, async (req, res) => {
  try {
    const { startDate, endDate, blockId } = req.query;
    
    let matchStage = {};
    if (startDate || endDate) {
      matchStage.ratingDate = {};
      if (startDate) matchStage.ratingDate.$gte = new Date(startDate);
      if (endDate) matchStage.ratingDate.$lte = new Date(endDate);
    }
    
    const analytics = await BehaviorRating.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalRatings: { $sum: 1 },
          avgOverall: { $avg: '$overallRating' },
          avgCooperation: { $avg: '$cooperation' },
          avgDiscipline: { $avg: '$discipline' },
          avgRespect: { $avg: '$respect' },
          avgWorkEthic: { $avg: '$workEthic' },
          maxRating: { $max: '$overallRating' },
          minRating: { $min: '$overallRating' }
        }
      }
    ]);
    
    // Get rating distribution
    const distribution = await BehaviorRating.aggregate([
      { $match: matchStage },
      {
        $bucket: {
          groupBy: '$overallRating',
          boundaries: [1, 2, 3, 4, 5, 6],
          default: 'Other',
          output: {
            count: { $sum: 1 }
          }
        }
      }
    ]);
    
    res.json({
      summary: analytics[0] || {},
      distribution
    });
  } catch (error) {
    console.error('Error fetching rating analytics:', error);
    res.status(500).json({ error: 'Failed to fetch rating analytics' });
  }
});

// Get top rated prisoners
router.get('/top-rated', authenticate, async (req, res) => {
  try {
    const { limit = 10, months = 3 } = req.query;
    
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - parseInt(months));
    
    const topRated = await BehaviorRating.aggregate([
      { $match: { ratingDate: { $gte: startDate } } },
      {
        $group: {
          _id: '$prisonerId',
          avgRating: { $avg: '$overallRating' },
          ratingCount: { $sum: 1 }
        }
      },
      { $match: { ratingCount: { $gte: 2 } } }, // Must have at least 2 ratings
      { $sort: { avgRating: -1 } },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'prisoners',
          localField: '_id',
          foreignField: '_id',
          as: 'prisoner'
        }
      },
      { $unwind: '$prisoner' },
      {
        $project: {
          prisonerId: '$_id',
          name: '$prisoner.name',
          prisonerNumber: '$prisoner.prisonerNumber',
          averageRating: { $round: ['$avgRating', 2] },
          totalRatings: '$ratingCount'
        }
      }
    ]);
    
    res.json(topRated);
  } catch (error) {
    console.error('Error fetching top rated prisoners:', error);
    res.status(500).json({ error: 'Failed to fetch top rated prisoners' });
  }
});

// Helper function to update prisoner's overall rating
async function updatePrisonerRating(prisonerId) {
  try {
    const recentRatings = await BehaviorRating.find({ prisonerId })
      .sort({ ratingDate: -1 })
      .limit(10); // Consider last 10 ratings
    
    if (recentRatings.length === 0) {
      await Prisoner.findByIdAndUpdate(prisonerId, {
        overallRating: 0,
        lastRatingUpdate: new Date()
      });
      return;
    }
    
    const avgRating = recentRatings.reduce((sum, r) => sum + r.overallRating, 0) / recentRatings.length;
    
    await Prisoner.findByIdAndUpdate(prisonerId, {
      overallRating: parseFloat(avgRating.toFixed(2)),
      lastRatingUpdate: new Date()
    });
  } catch (error) {
    console.error('Error updating prisoner rating:', error);
  }
}

module.exports = router;

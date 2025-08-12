const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Details = require('../models/Details');
const LeaveRequest = require('../models/LeaveRequest');
const { IncidentReport } = require('../models/Report');
const BehaviorRating = require('../models/BehaviorRating');

// Middleware to check if user is staff
const requireStaff = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key_here');
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ msg: 'Token is not valid' });
    }

    if (user.role !== 'staff') {
      return res.status(403).json({ msg: 'Access denied. Staff role required.' });
    }

    req.user = { userId: user._id, role: user.role };
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ msg: 'Token is not valid' });
  }
};

// ===== LEAVE REQUESTS MANAGEMENT =====

// Get staff's own leave requests
router.get('/leave-requests', requireStaff, async (req, res) => {
  try {
    console.log('📋 GET /leave-requests called by staff:', req.user.userId);
    
    const leaveRequests = await LeaveRequest.find({ staffId: req.user.userId })
      .populate('staffId', 'name email')
      .sort({ createdAt: -1 });

    console.log(`📋 Found ${leaveRequests.length} leave requests for staff`);

    res.json({
      success: true,
      requests: leaveRequests,
      count: leaveRequests.length
    });
  } catch (error) {
    console.error('Get leave requests error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Submit new leave request
router.post('/leave-requests', requireStaff, async (req, res) => {
  try {
    console.log('📝 POST /leave-requests called by staff:', req.user.userId);
    console.log('📝 Request data:', req.body);

    const {
      leaveType,
      startDate,
      endDate,
      totalDays,
      reason,
      emergencyContact,
      coverageArrangement,
      additionalNotes
    } = req.body;

    // Generate request ID
    const requestCount = await LeaveRequest.countDocuments();
    const requestId = `LR${String(requestCount + 1).padStart(3, '0')}`;

    const leaveRequest = new LeaveRequest({
      requestId,
      staffId: req.user.userId,
      leaveType,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      totalDays,
      reason,
      emergencyContact,
      coverageArrangement,
      additionalNotes,
      status: 'Pending',
      submittedDate: new Date()
    });

    await leaveRequest.save();

    console.log('✅ Leave request created:', requestId);

    res.json({
      success: true,
      message: 'Leave request submitted successfully',
      request: leaveRequest
    });
  } catch (error) {
    console.error('Submit leave request error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// ===== INCIDENT REPORTS MANAGEMENT =====

// Submit new incident report
router.post('/incident-reports', requireStaff, async (req, res) => {
  try {
    console.log('📝 POST /incident-reports called by staff:', req.user.userId);
    console.log('📝 Request data:', req.body);

    const {
      title,
      description,
      severity,
      location,
      involvedInmates,
      witnesses,
      actionTaken,
      dateTime,
      reportedBy
    } = req.body;

    // Generate incident ID
    const incidentCount = await IncidentReport.countDocuments();
    const incidentId = `INC${String(incidentCount + 1).padStart(3, '0')}`;

    const incidentReport = new IncidentReport({
      incidentId,
      title,
      description,
      severity,
      location,
      involvedInmates,
      witnesses,
      actionTaken,
      dateTime: new Date(dateTime),
      reportedBy: req.user.userId,
      reportedAt: new Date(),
      status: 'Under Investigation'
    });

    await incidentReport.save();

    console.log('✅ Incident report created:', incidentId);

    res.json({
      success: true,
      message: 'Incident report submitted successfully',
      report: incidentReport
    });
  } catch (error) {
    console.error('Submit incident report error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// ===== BEHAVIOR RATINGS MANAGEMENT =====

// Submit new behavior rating
router.post('/behavior-ratings', requireStaff, async (req, res) => {
  try {
    console.log('📝 POST /behavior-ratings called by staff:', req.user.userId);
    console.log('📝 Request data:', req.body);

    const {
      inmateId,
      inmateName,
      weekStartDate,
      behavior,
      cooperation,
      workEthic,
      socialInteraction,
      ruleCompliance,
      averageRating,
      comments
    } = req.body;

    // Generate rating ID
    const ratingCount = await BehaviorRating.countDocuments();
    const ratingId = `BR${String(ratingCount + 1).padStart(3, '0')}`;

    const behaviorRating = new BehaviorRating({
      ratingId,
      inmateId,
      inmateName,
      weekStartDate: new Date(weekStartDate),
      behavior,
      cooperation,
      workEthic,
      socialInteraction,
      ruleCompliance,
      averageRating,
      comments,
      ratedBy: req.user.userId,
      ratedAt: new Date()
    });

    await behaviorRating.save();

    console.log('✅ Behavior rating created:', ratingId);

    res.json({
      success: true,
      message: 'Behavior rating submitted successfully',
      rating: behaviorRating
    });
  } catch (error) {
    console.error('Submit behavior rating error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();

// Import models
const User = require('../models/User');
const Prisoner = require('../models/Prisoner');
const PrisonBlock = require('../models/PrisonBlock');
const Report = require('../models/Report');
const { VisitRules, ParoleRules, PrisonRules } = require('../models/Rules');

// Import report models if they exist separately
const BehavioralReport = Report; // Assuming Report model handles behavioral reports
const IncidentReport = Report; // Assuming Report model handles incident reports
const WeeklyActivityReport = Report; // Assuming Report model handles weekly reports

// Middleware to check if user is admin
const requireAdmin = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const user = await User.findById(decoded.id);
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ msg: 'Access denied. Admin privileges required.' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};

// Dashboard Statistics (for new admin dashboard)
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalVisits = await User.aggregate([
      { $unwind: { path: '$visitHistory', preserveNullAndEmptyArrays: true } },
      { $group: { _id: null, count: { $sum: 1 } } }
    ]);
    const pendingRequests = await User.aggregate([
      { $unwind: { path: '$visitHistory', preserveNullAndEmptyArrays: true } },
      { $match: { 'visitHistory.status': 'pending' } },
      { $group: { _id: null, count: { $sum: 1 } } }
    ]);
    const activeInmates = await Prisoner.countDocuments({ status: 'active' });
    const totalStaff = await User.countDocuments({
      role: { $in: ['warden', 'staff'] }
    });

    res.json({
      totalUsers: totalUsers || 0,
      totalVisits: totalVisits[0]?.count || 0,
      pendingRequests: pendingRequests[0]?.count || 0,
      activeInmates: activeInmates || 0,
      totalStaff: totalStaff || 0
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Recent Activity
router.get('/recent-activity', requireAdmin, async (req, res) => {
  try {
    const recentActivity = [
      {
        description: 'New user registered',
        timestamp: '2 hours ago'
      },
      {
        description: 'Visit request approved',
        timestamp: '4 hours ago'
      },
      {
        description: 'New inmate added',
        timestamp: '1 day ago'
      }
    ];
    res.json(recentActivity);
  } catch (error) {
    console.error('Recent activity error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Pending Requests
router.get('/pending-requests', requireAdmin, async (req, res) => {
  try {
    const pendingRequests = await User.aggregate([
      { $unwind: { path: '$visitHistory', preserveNullAndEmptyArrays: true } },
      { $match: { 'visitHistory.status': 'pending' } },
      { $limit: 10 },
      {
        $project: {
          id: '$visitHistory._id',
          visitorName: '$name',
          inmateName: '$visitHistory.inmateName',
          requestedDate: '$visitHistory.visitDate'
        }
      }
    ]);
    res.json(pendingRequests);
  } catch (error) {
    console.error('Pending requests error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Approve Request
router.put('/approve-request/:requestId', requireAdmin, async (req, res) => {
  try {
    // This is a simplified implementation
    // In a real system, you'd update the specific visit request
    res.json({ success: true, msg: 'Request approved successfully' });
  } catch (error) {
    console.error('Approve request error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Reject Request
router.put('/reject-request/:requestId', requireAdmin, async (req, res) => {
  try {
    // This is a simplified implementation
    // In a real system, you'd update the specific visit request
    res.json({ success: true, msg: 'Request rejected successfully' });
  } catch (error) {
    console.error('Reject request error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Dashboard Statistics (original endpoint)
router.get('/dashboard/stats', requireAdmin, async (req, res) => {
  try {
    const stats = {
      totalPrisoners: await Prisoner.countDocuments({ status: 'active' }),
      totalBlocks: await PrisonBlock.countDocuments({ isActive: true }),
      totalWardens: await User.countDocuments({ role: 'warden', 'wardenDetails.isActive': true }),
      totalStaff: await User.countDocuments({ role: 'staff' }),
      
      // Recent activity
      recentIncidents: await IncidentReport.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }),
      
      pendingReports: await BehavioralReport.countDocuments({ reviewStatus: 'pending' }),
      
      // Capacity utilization
      blockCapacity: await PrisonBlock.aggregate([
        {
          $group: {
            _id: null,
            totalCapacity: { $sum: '$totalCapacity' },
            currentOccupancy: { $sum: '$currentOccupancy' }
          }
        }
      ]),
      
      // Security level distribution
      securityLevelDistribution: await Prisoner.aggregate([
        {
          $group: {
            _id: '$securityLevel',
            count: { $sum: 1 }
          }
        }
      ])
    };
    
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// ===== PRISON BLOCK MANAGEMENT =====

// Get all prison blocks
router.get('/blocks', requireAdmin, async (req, res) => {
  try {
    const blocks = await PrisonBlock.find()
      .populate('assignedWardens', 'name email wardenDetails')
      .populate('headWarden', 'name email wardenDetails')
      .sort({ createdAt: -1 });
    
    res.json({ success: true, blocks });
  } catch (error) {
    console.error('Get blocks error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Create new prison block
router.post('/blocks', requireAdmin, async (req, res) => {
  try {
    const {
      name,
      blockCode,
      description,
      totalCapacity,
      securityLevel,
      blockType,
      floor,
      wing,
      facilities
    } = req.body;
    
    // Check if block code already exists
    const existingBlock = await PrisonBlock.findOne({ blockCode });
    if (existingBlock) {
      return res.status(400).json({ msg: 'Block code already exists' });
    }
    
    const newBlock = new PrisonBlock({
      name,
      blockCode,
      description,
      totalCapacity,
      securityLevel,
      blockType,
      floor,
      wing,
      facilities: facilities || []
    });
    
    await newBlock.save();
    
    res.json({ success: true, block: newBlock, msg: 'Prison block created successfully' });
  } catch (error) {
    console.error('Create block error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Update prison block
router.put('/blocks/:id', requireAdmin, async (req, res) => {
  try {
    const block = await PrisonBlock.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('assignedWardens', 'name email wardenDetails')
     .populate('headWarden', 'name email wardenDetails');
    
    if (!block) {
      return res.status(404).json({ msg: 'Prison block not found' });
    }
    
    res.json({ success: true, block, msg: 'Prison block updated successfully' });
  } catch (error) {
    console.error('Update block error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Delete prison block
router.delete('/blocks/:id', requireAdmin, async (req, res) => {
  try {
    // Check if block has prisoners
    const prisonersInBlock = await Prisoner.countDocuments({ 
      currentBlock: req.params.id, 
      status: 'active' 
    });
    
    if (prisonersInBlock > 0) {
      return res.status(400).json({ 
        msg: `Cannot delete block. ${prisonersInBlock} prisoners are currently assigned to this block.` 
      });
    }
    
    const block = await PrisonBlock.findByIdAndDelete(req.params.id);
    if (!block) {
      return res.status(404).json({ msg: 'Prison block not found' });
    }
    
    res.json({ success: true, msg: 'Prison block deleted successfully' });
  } catch (error) {
    console.error('Delete block error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Assign warden to block
router.post('/blocks/:blockId/assign-warden', requireAdmin, async (req, res) => {
  try {
    const { wardenId, isHeadWarden } = req.body;
    
    // Verify warden exists and has warden role
    const warden = await User.findById(wardenId);
    if (!warden || warden.role !== 'warden') {
      return res.status(400).json({ msg: 'Invalid warden ID' });
    }
    
    const block = await PrisonBlock.findById(req.params.blockId);
    if (!block) {
      return res.status(404).json({ msg: 'Prison block not found' });
    }
    
    // Add to assigned wardens if not already assigned
    if (!block.assignedWardens.includes(wardenId)) {
      block.assignedWardens.push(wardenId);
    }
    
    // Set as head warden if specified
    if (isHeadWarden) {
      block.headWarden = wardenId;
    }
    
    await block.save();
    
    // Update warden's assigned blocks
    if (!warden.wardenDetails.assignedBlocks.includes(req.params.blockId)) {
      warden.wardenDetails.assignedBlocks.push(req.params.blockId);
      await warden.save();
    }
    
    const updatedBlock = await PrisonBlock.findById(req.params.blockId)
      .populate('assignedWardens', 'name email wardenDetails')
      .populate('headWarden', 'name email wardenDetails');
    
    res.json({ success: true, block: updatedBlock, msg: 'Warden assigned successfully' });
  } catch (error) {
    console.error('Assign warden error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// ===== WARDEN MANAGEMENT =====

// Get all wardens
router.get('/wardens', requireAdmin, async (req, res) => {
  try {
    const wardens = await User.find({ role: 'warden' })
      .populate('wardenDetails.assignedBlocks', 'name blockCode')
      .select('-password')
      .sort({ createdAt: -1 });
    
    res.json({ success: true, wardens });
  } catch (error) {
    console.error('Get wardens error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Create new warden
router.post('/wardens', requireAdmin, async (req, res) => {
  try {
    console.log('📝 Creating new warden with data:', req.body);
    
    const {
      name,
      email,
      phone,
      assignedBlocks,
      shift,
      experience,
      specialization
    } = req.body;

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ msg: 'Name and email are required' });
    }

    // Validate name
    if (name.trim().length < 2) {
      return res.status(400).json({ msg: 'Name must be at least 2 characters' });
    }
    if (!/^[a-zA-Z\s-']+$/.test(name)) {
      return res.status(400).json({ msg: 'Name can only contain letters, spaces, hyphens, and apostrophes' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ msg: 'Please enter a valid email address' });
    }

    // Validate phone if provided
    if (phone && phone.trim()) {
      const digitsOnly = phone.replace(/\D/g, '');
      if (digitsOnly.length !== 10) {
        return res.status(400).json({ msg: 'Phone number must be exactly 10 digits' });
      }
      if (!/^[6-9]/.test(digitsOnly)) {
        return res.status(400).json({ msg: 'Phone number must start with 6, 7, 8, or 9' });
      }
    }

    // Validate experience if provided
    if (experience && experience !== '') {
      const exp = parseInt(experience);
      if (isNaN(exp) || exp < 0 || exp > 50) {
        return res.status(400).json({ msg: 'Experience must be a valid number between 0 and 50' });
      }
    }

    // Validate shift
    const validShifts = ['day', 'night', 'rotating'];
    if (!shift || !validShifts.includes(shift)) {
      return res.status(400).json({ msg: 'Please select a valid shift' });
    }

    // Validate specialization if provided
    if (specialization && specialization.trim()) {
      if (specialization.trim().length < 3) {
        return res.status(400).json({ msg: 'Specialization must be at least 3 characters if provided' });
      }
      if (!/^[a-zA-Z\s,.-]+$/.test(specialization.trim())) {
        return res.status(400).json({ msg: 'Specialization can only contain letters, spaces, commas, periods, and hyphens' });
      }
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ msg: 'Email already exists' });
    }

    // Auto-generate employee ID
    const generateEmployeeId = async () => {
      const prefix = 'W';
      
      console.log('🔍 Generating employee ID with prefix:', prefix);
      
      // Find the highest existing employee ID
      const existingWardens = await User.find({
        role: 'warden',
        'wardenDetails.employeeId': { $regex: `^${prefix}\\d+$` }
      }).select('wardenDetails.employeeId');
      
      console.log('📋 Existing wardens with matching prefix:', existingWardens);
      
      let maxNumber = 100; // Start from 101
      existingWardens.forEach(warden => {
        if (warden.wardenDetails && warden.wardenDetails.employeeId) {
          const match = warden.wardenDetails.employeeId.match(/^W(\d+)$/);
          if (match) {
            const number = parseInt(match[1]);
            console.log('🔢 Found existing number:', number);
            if (number > maxNumber) {
              maxNumber = number;
            }
          }
        }
      });
      
      // Generate new employee ID with incremented number
      const newNumber = maxNumber + 1;
      const newEmployeeId = `${prefix}${newNumber}`;
      console.log('✨ Generated new employee ID:', newEmployeeId);
      return newEmployeeId;
    };

    const employeeId = await generateEmployeeId();
    console.log('🆔 Final employee ID:', employeeId);

    // Auto-generate a secure 8-character password
    const crypto = require('crypto');
    const autoGeneratedPassword = crypto.randomBytes(4).toString('hex'); // 8 character password

    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(autoGeneratedPassword, 10);
    
    const newWarden = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: 'warden',
      authProvider: 'local',
      phoneNumber: phone ? phone.replace(/\D/g, '') : undefined,
      wardenDetails: {
        employeeId,
        assignedBlocks: assignedBlocks || [],
        shift,
        experience: experience ? parseInt(experience) : undefined,
        specialization: specialization ? specialization.trim() : undefined,
        isActive: true
      }
    });
    
    console.log('💾 Saving warden with details:', {
      name: newWarden.name,
      email: newWarden.email,
      employeeId: newWarden.wardenDetails.employeeId,
      shift: newWarden.wardenDetails.shift,
      experience: newWarden.wardenDetails.experience,
      assignedBlocks: newWarden.wardenDetails.assignedBlocks
    });
    
    await newWarden.save();
    console.log('✅ Warden saved successfully');

    // Send email with auto-generated password
    try {
      const nodemailer = require('nodemailer');

      // Create transporter (using the same config as in server.js)
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Welcome to Prison Management System - Warden Account Created',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Welcome to Prison Management System</h2>
            <p>Dear ${name},</p>
            <p>Your warden account has been successfully created. Here are your login credentials and details:</p>

            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <p><strong>Employee ID:</strong> ${employeeId}</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Temporary Password:</strong> <code style="background-color: #e0e0e0; padding: 2px 5px; border-radius: 3px;">${autoGeneratedPassword}</code></p>
              <p><strong>Shift:</strong> ${shift.charAt(0).toUpperCase() + shift.slice(1)} Shift</p>
              ${experience ? `<p><strong>Experience:</strong> ${experience} years</p>` : ''}
              ${specialization ? `<p><strong>Specialization:</strong> ${specialization}</p>` : ''}
            </div>

            <p><strong>Important:</strong> Please change your password after your first login for security purposes.</p>

            <p>You can access the system at: <a href="http://localhost:5174/login">Prison Management System</a></p>

            <p>If you have any questions, please contact the system administrator.</p>

            <p>Best regards,<br>Prison Management System Team</p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log(`✅ Warden credentials sent to ${email}`);

    } catch (emailError) {
      console.error('❌ Failed to send email:', emailError);
      // Don't fail the warden creation if email fails
    }

    // Remove password from response
    const wardenResponse = newWarden.toObject();
    delete wardenResponse.password;

    res.json({
      success: true,
      warden: wardenResponse,
      msg: 'Warden created successfully. Login credentials have been sent to their email address.'
    });
  } catch (error) {
    console.error('Create warden error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Update warden
router.put('/wardens/:id', requireAdmin, async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      assignedBlocks,
      shift,
      experience,
      specialization
    } = req.body;

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ msg: 'Name and email are required' });
    }

    // Validate name
    if (name.trim().length < 2) {
      return res.status(400).json({ msg: 'Name must be at least 2 characters' });
    }
    if (!/^[a-zA-Z\s-']+$/.test(name)) {
      return res.status(400).json({ msg: 'Name can only contain letters, spaces, hyphens, and apostrophes' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ msg: 'Please enter a valid email address' });
    }

    // Validate phone if provided
    if (phone && phone.trim()) {
      const digitsOnly = phone.replace(/\D/g, '');
      if (digitsOnly.length !== 10) {
        return res.status(400).json({ msg: 'Phone number must be exactly 10 digits' });
      }
      if (!/^[6-9]/.test(digitsOnly)) {
        return res.status(400).json({ msg: 'Phone number must start with 6, 7, 8, or 9' });
      }
    }

    // Validate experience if provided
    if (experience && experience !== '') {
      const exp = parseInt(experience);
      if (isNaN(exp) || exp < 0 || exp > 50) {
        return res.status(400).json({ msg: 'Experience must be a valid number between 0 and 50' });
      }
    }

    // Validate shift
    const validShifts = ['day', 'night', 'rotating'];
    if (!shift || !validShifts.includes(shift)) {
      return res.status(400).json({ msg: 'Please select a valid shift' });
    }

    // Validate specialization if provided
    if (specialization && specialization.trim()) {
      if (specialization.trim().length < 3) {
        return res.status(400).json({ msg: 'Specialization must be at least 3 characters if provided' });
      }
      if (!/^[a-zA-Z\s,.-]+$/.test(specialization.trim())) {
        return res.status(400).json({ msg: 'Specialization can only contain letters, spaces, commas, periods, and hyphens' });
      }
    }

    // Check if email already exists (excluding current warden)
    const existingUser = await User.findOne({ 
      email: email.toLowerCase().trim(), 
      _id: { $ne: req.params.id } 
    });
    if (existingUser) {
      return res.status(400).json({ msg: 'Email already exists' });
    }

    // Find and update warden
    const warden = await User.findById(req.params.id);
    if (!warden || warden.role !== 'warden') {
      return res.status(404).json({ msg: 'Warden not found' });
    }

    // Update warden fields
    warden.name = name.trim();
    warden.email = email.toLowerCase().trim();
    warden.phoneNumber = phone ? phone.replace(/\D/g, '') : undefined;
    
    // Update warden details (preserve employeeId)
    warden.wardenDetails = {
      ...warden.wardenDetails,
      assignedBlocks: assignedBlocks || [],
      shift,
      experience: experience ? parseInt(experience) : undefined,
      specialization: specialization ? specialization.trim() : undefined
    };

    await warden.save();

    // Remove password from response
    const wardenResponse = warden.toObject();
    delete wardenResponse.password;

    res.json({
      success: true,
      warden: wardenResponse,
      msg: 'Warden updated successfully'
    });
  } catch (error) {
    console.error('Update warden error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Delete warden
router.delete('/wardens/:id', requireAdmin, async (req, res) => {
  try {
    const warden = await User.findById(req.params.id);
    if (!warden || warden.role !== 'warden') {
      return res.status(404).json({ msg: 'Warden not found' });
    }

    // Check if warden is assigned to any blocks
    if (warden.wardenDetails && warden.wardenDetails.assignedBlocks && warden.wardenDetails.assignedBlocks.length > 0) {
      // Remove warden from all assigned blocks
      await PrisonBlock.updateMany(
        { assignedWardens: req.params.id },
        { $pull: { assignedWardens: req.params.id } }
      );
      
      // Remove as head warden if applicable
      await PrisonBlock.updateMany(
        { headWarden: req.params.id },
        { $unset: { headWarden: 1 } }
      );
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      msg: 'Warden deleted successfully'
    });
  } catch (error) {
    console.error('Delete warden error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// ===== PRISONER MANAGEMENT =====

// Get all prisoners
router.get('/prisoners', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, block, securityLevel, status } = req.query;

    // Build filter
    const filter = {};
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { prisonerNumber: { $regex: search, $options: 'i' } }
      ];
    }
    if (block) filter.currentBlock = block;
    if (securityLevel) filter.securityLevel = securityLevel;
    if (status) filter.status = status;

    const prisoners = await Prisoner.find(filter)
      .populate('currentBlock', 'name blockCode')
      .select('-medicalInfo -visitHistory') // Exclude sensitive data
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Prisoner.countDocuments(filter);

    res.json({
      success: true,
      prisoners,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Get prisoners error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Get single prisoner details
router.get('/prisoners/:id', requireAdmin, async (req, res) => {
  try {
    const prisoner = await Prisoner.findById(req.params.id)
      .populate('currentBlock', 'name blockCode securityLevel');

    if (!prisoner) {
      return res.status(404).json({ msg: 'Prisoner not found' });
    }

    res.json({ success: true, prisoner });
  } catch (error) {
    console.error('Get prisoner error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Create new prisoner
router.post('/prisoners', requireAdmin, async (req, res) => {
  try {
    const {
      prisonerNumber,
      firstName,
      lastName,
      middleName,
      dateOfBirth,
      gender,
      currentBlock,
      charges,
      sentenceDetails,
      securityLevel
    } = req.body;

    // Check if prisoner number already exists
    const existingPrisoner = await Prisoner.findOne({ prisonerNumber });
    if (existingPrisoner) {
      return res.status(400).json({ msg: 'Prisoner number already exists' });
    }

    // Verify block exists
    const block = await PrisonBlock.findById(currentBlock);
    if (!block) {
      return res.status(400).json({ msg: 'Invalid prison block' });
    }

    // Check block capacity
    if (block.currentOccupancy >= block.totalCapacity) {
      return res.status(400).json({ msg: 'Prison block is at full capacity' });
    }

    const newPrisoner = new Prisoner({
      prisonerNumber,
      firstName,
      lastName,
      middleName,
      dateOfBirth,
      gender,
      currentBlock,
      charges: charges || [],
      sentenceDetails: sentenceDetails || {},
      securityLevel: securityLevel || 'medium'
    });

    await newPrisoner.save();

    // Update block occupancy
    block.currentOccupancy += 1;
    await block.save();

    const populatedPrisoner = await Prisoner.findById(newPrisoner._id)
      .populate('currentBlock', 'name blockCode');

    res.json({ success: true, prisoner: populatedPrisoner, msg: 'Prisoner added successfully' });
  } catch (error) {
    console.error('Create prisoner error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Update prisoner
router.put('/prisoners/:id', requireAdmin, async (req, res) => {
  try {
    const prisoner = await Prisoner.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('currentBlock', 'name blockCode');

    if (!prisoner) {
      return res.status(404).json({ msg: 'Prisoner not found' });
    }

    res.json({ success: true, prisoner, msg: 'Prisoner updated successfully' });
  } catch (error) {
    console.error('Update prisoner error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// ===== REPORTS MANAGEMENT =====

// Get behavioral reports
router.get('/reports/behavioral', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, prisoner, reportType } = req.query;

    const filter = {};
    if (status) filter.reviewStatus = status;
    if (prisoner) filter.prisoner = prisoner;
    if (reportType) filter.reportType = reportType;

    const reports = await BehavioralReport.find(filter)
      .populate('prisoner', 'firstName lastName prisonerNumber currentBlock')
      .populate('reportedBy', 'name email')
      .populate('reviewedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await BehavioralReport.countDocuments(filter);

    res.json({
      success: true,
      reports,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Get behavioral reports error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Review behavioral report
router.put('/reports/behavioral/:id/review', requireAdmin, async (req, res) => {
  try {
    const { reviewStatus, reviewNotes } = req.body;

    const report = await BehavioralReport.findByIdAndUpdate(
      req.params.id,
      {
        reviewStatus,
        reviewNotes,
        reviewedBy: req.user._id,
        reviewDate: new Date()
      },
      { new: true }
    ).populate('prisoner', 'firstName lastName prisonerNumber')
     .populate('reportedBy', 'name email')
     .populate('reviewedBy', 'name email');

    if (!report) {
      return res.status(404).json({ msg: 'Report not found' });
    }

    res.json({ success: true, report, msg: 'Report reviewed successfully' });
  } catch (error) {
    console.error('Review report error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Get incident reports
router.get('/reports/incidents', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, severity, status, block } = req.query;

    const filter = {};
    if (severity) filter.severity = severity;
    if (status) filter.reviewStatus = status;
    if (block) filter.block = block;

    const reports = await IncidentReport.find(filter)
      .populate('block', 'name blockCode')
      .populate('prisonersInvolved', 'firstName lastName prisonerNumber')
      .populate('reportedBy', 'name email')
      .populate('reviewedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await IncidentReport.countDocuments(filter);

    res.json({
      success: true,
      reports,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Get incident reports error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Get weekly activity reports
router.get('/reports/weekly', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, block, status } = req.query;

    const filter = {};
    if (block) filter.block = block;
    if (status) filter.reviewStatus = status;

    const reports = await WeeklyActivityReport.find(filter)
      .populate('block', 'name blockCode')
      .populate('reportedBy', 'name email')
      .populate('reviewedBy', 'name email')
      .sort({ weekStartDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await WeeklyActivityReport.countDocuments(filter);

    res.json({
      success: true,
      reports,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Get weekly reports error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// ===== RULES AND POLICIES MANAGEMENT =====

// Get visit rules
router.get('/rules/visits', requireAdmin, async (req, res) => {
  try {
    console.log('📋 Fetching visit rules from MongoDB...');

    const rules = await VisitRules.find()
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    console.log(`📊 Found ${rules.length} rules in MongoDB`);

    // Helper to always return array
    const toArray = (val) => {
      if (Array.isArray(val)) return val;
      if (typeof val === 'string' && val.trim() !== '') return [val];
      return [];
    };

    // Helper for allowedVisitorTypes
    const toVisitorTypeArray = (val) => {
      if (Array.isArray(val)) {
        if (val.length > 0 && typeof val[0] === 'object' && val[0].type) {
          return val.map(vt => vt.type);

        } else if (typeof val[0] === 'string') {
          return val;
        }
      }
      if (typeof val === 'string' && val.trim() !== '') return [val];
      return [];
    };

    // Helper for specialConditions
    const toSpecialConditionArray = (val) => {
      if (Array.isArray(val)) {
        if (val.length > 0 && typeof val[0] === 'object' && val[0].condition) {
          return val.map(sc => sc.condition);
        } else if (typeof val[0] === 'string') {
          return val;
        }
      }
      if (typeof val === 'string' && val.trim() !== '') return [val];
      return [];
    };

    // Helper for securityChecks
    const toSecurityChecksArray = (val) => {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        return Object.keys(val).filter(key => val[key] === true);
      }
      if (Array.isArray(val)) return val;
      if (typeof val === 'string' && val.trim() !== '') return [val];
      return [];
    };

    const transformedRules = rules.map(rule => ({
      _id: rule._id,
      title: rule.title,
      description: rule.description,
      category: rule.frontendData?.category || rule.category || 'general',
      rules: toArray(rule.frontendData?.rules ?? rule.rules),
      restrictions: toArray(rule.frontendData?.restrictions ?? rule.restrictions),
      eligibilityCriteria: toArray(rule.frontendData?.eligibilityCriteria ?? rule.eligibilityCriteria),
      prohibitedItems: toArray(rule.prohibitedItems),
      allowedVisitorTypes: toVisitorTypeArray(rule.allowedVisitorTypes),
      specialConditions: toSpecialConditionArray(rule.specialConditions),
      securityChecks: toSecurityChecksArray(rule.securityChecks),

      visitingHours: {
        maxVisitsPerWeek: rule.visitingHours?.maxVisitsPerWeek || 2,
        maxVisitsPerMonth: rule.visitingHours?.maxVisitsPerMonth || 8,
        maxVisitDuration: rule.visitingHours?.maxVisitDuration || 60,
        maxVisitorsPerSession: rule.visitingHours?.maxVisitorsPerSession || 3,
        minVisitorAge: rule.visitingHours?.minVisitorAge || 18
      },
      isActive: rule.isActive,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
      createdBy: rule.createdBy
    }));

    console.log('📤 Sending transformed rules to frontend:', transformedRules.length);

    res.json({ success: true, rules: transformedRules });
  } catch (error) {
    console.error('Get visit rules error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Create/Update visit rules
router.post('/rules/visits', requireAdmin, async (req, res) => {
  try {
    console.log('📝 Creating visit rule with data:', JSON.stringify(req.body, null, 2));

    // Transform frontend data to match MongoDB schema (with safe fallbacks)
    const transformedData = {
      title: req.body.title || 'Visit rules',
      description: req.body.description || req.body.title || 'Visit rules',
      version: req.body.version || '1.0',
      isActive: req.body.isActive !== undefined ? req.body.isActive : true,
      createdBy: req.user?._id,

      // Transform visitor types from simple strings to schema format
      allowedVisitorTypes: (req.body.allowedVisitorTypes || []).map(type => ({
        type: String(type).toLowerCase().includes('family') ? 'family' :
              String(type).toLowerCase().includes('lawyer') || String(type).toLowerCase().includes('legal') ? 'lawyer' :
              String(type).toLowerCase().includes('religious') ? 'religious' : 'friend',
        restrictions: ''
      })),

      // Transform security checks from array to object
      securityChecks: {
        idVerification: (req.body.securityChecks || []).some(check =>
          String(check).toLowerCase().includes('id') || String(check).toLowerCase().includes('verification')),
        backgroundCheck: (req.body.securityChecks || []).some(check =>
          String(check).toLowerCase().includes('background')),
        metalDetector: (req.body.securityChecks || []).some(check =>
          String(check).toLowerCase().includes('metal') || String(check).toLowerCase().includes('detector')),
        bagSearch: (req.body.securityChecks || []).some(check =>
          String(check).toLowerCase().includes('bag') || String(check).toLowerCase().includes('search'))
      },

      // Keep prohibited items as simple array
      prohibitedItems: Array.isArray(req.body.prohibitedItems) ? req.body.prohibitedItems : (req.body.prohibitedItems ? [req.body.prohibitedItems] : []),

      // Transform special conditions to schema format
      specialConditions: (req.body.specialConditions || []).map(condition => ({
        condition: condition,
        description: condition,
        applicableToBlocks: []
      })),

      // Visiting hours configuration
      visitingHours: {
        maxVisitsPerWeek: req.body.visitingHours?.maxVisitsPerWeek ?? 2,
        maxVisitsPerMonth: req.body.visitingHours?.maxVisitsPerMonth ?? 8,
        maxVisitDuration: req.body.visitingHours?.maxVisitDuration ?? 60,
        maxVisitorsPerSession: req.body.visitingHours?.maxVisitorsPerSession ?? 3,
        minVisitorAge: req.body.visitingHours?.minVisitorAge ?? 18
      },

      // Store additional frontend fields in a custom field for compatibility
      frontendData: {
        rules: req.body.rules ?? [],
        restrictions: req.body.restrictions ?? [],
        eligibilityCriteria: req.body.eligibilityCriteria ?? [],
        category: req.body.category || 'general'
      }
    };

    console.log('🔄 Transformed data for MongoDB:', JSON.stringify(transformedData, null, 2));

    const newRule = new VisitRules(transformedData);
    await newRule.save();

    console.log('✅ Rule saved to MongoDB:', newRule._id);

    // Deactivate previous rules with the same title if creating a new active version
    if (transformedData.isActive) {
      await VisitRules.updateMany({ title: transformedData.title, _id: { $ne: newRule._id } }, { isActive: false });
    }

    const populatedRule = await VisitRules.findById(newRule._id)
      .populate('createdBy', 'name email');

    // Transform back to frontend format for response
    const responseRule = {
      _id: populatedRule._id,
      title: populatedRule.title,
      description: populatedRule.description,
      category: populatedRule.frontendData?.category || 'general',
      rules: Array.isArray(populatedRule.frontendData?.rules) ? populatedRule.frontendData.rules : (populatedRule.frontendData?.rules ? [populatedRule.frontendData.rules] : []),
      restrictions: Array.isArray(populatedRule.frontendData?.restrictions) ? populatedRule.frontendData.restrictions : (populatedRule.frontendData?.restrictions ? [populatedRule.frontendData.restrictions] : []),
      eligibilityCriteria: Array.isArray(populatedRule.frontendData?.eligibilityCriteria) ? populatedRule.frontendData.eligibilityCriteria : (populatedRule.frontendData?.eligibilityCriteria ? [populatedRule.frontendData.eligibilityCriteria] : []),
      prohibitedItems: Array.isArray(populatedRule.prohibitedItems) ? populatedRule.prohibitedItems : (populatedRule.prohibitedItems ? [populatedRule.prohibitedItems] : []),
      allowedVisitorTypes: Array.isArray(populatedRule.allowedVisitorTypes) ? populatedRule.allowedVisitorTypes.map(vt => (vt && vt.type) ? vt.type : String(vt)) : [],
      specialConditions: Array.isArray(populatedRule.specialConditions) ? populatedRule.specialConditions.map(sc => (sc && sc.condition) ? sc.condition : String(sc)) : [],
      securityChecks: Object.keys(populatedRule.securityChecks || {}).filter(key =>
        populatedRule.securityChecks && populatedRule.securityChecks[key] === true),
      visitingHours: {
        maxVisitsPerWeek: populatedRule.visitingHours?.maxVisitsPerWeek || 2,
        maxVisitsPerMonth: populatedRule.visitingHours?.maxVisitsPerMonth || 8,
        maxVisitDuration: populatedRule.visitingHours?.maxVisitDuration || 60,
        maxVisitorsPerSession: populatedRule.visitingHours?.maxVisitorsPerSession || 3,
        minVisitorAge: populatedRule.visitingHours?.minVisitorAge || 18
      },
      isActive: populatedRule.isActive,
      createdAt: populatedRule.createdAt,
      updatedAt: populatedRule.updatedAt,
      createdBy: populatedRule.createdBy
    };

    console.log('📤 Sending response:', JSON.stringify(responseRule, null, 2));

    res.json({ success: true, rule: responseRule, msg: 'Visit rules created successfully' });
  } catch (error) {
    console.error('Create visit rules error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Update visit rules
router.put('/rules/visits/:id', requireAdmin, async (req, res) => {
  try {
    console.log('📝 Updating visit rule with ID:', req.params.id);
    console.log('📝 Update data:', JSON.stringify(req.body, null, 2));

    // Find the existing rule
    const existingRule = await VisitRules.findById(req.params.id);
    if (!existingRule) {
      return res.status(404).json({ msg: 'Visit rule not found' });
    }

    // Transform frontend data to match MongoDB schema (preserve existing values when not provided)
    const transformedData = {
      title: req.body.title ?? existingRule.title,
      description: req.body.description ?? existingRule.description ?? 'Visit rules',
      version: req.body.version || existingRule.version || '1.0',
      isActive: req.body.isActive !== undefined ? req.body.isActive : (existingRule.isActive ?? true),
      updatedAt: new Date(),

      // Transform visiting hours from frontend format to schema format
      visitingHours: {
        maxVisitsPerWeek: req.body.visitingHours?.maxVisitsPerWeek ?? existingRule.visitingHours?.maxVisitsPerWeek ?? 2,
        maxVisitsPerMonth: req.body.visitingHours?.maxVisitsPerMonth ?? existingRule.visitingHours?.maxVisitsPerMonth ?? 8,
        maxVisitDuration: req.body.visitingHours?.maxVisitDuration ?? existingRule.visitingHours?.maxVisitDuration ?? 60,
        maxVisitorsPerSession: req.body.visitingHours?.maxVisitorsPerSession ?? existingRule.visitingHours?.maxVisitorsPerSession ?? 3,
        minVisitorAge: req.body.visitingHours?.minVisitorAge ?? existingRule.visitingHours?.minVisitorAge ?? 18
      },

      // Transform visitor types from simple strings to schema format
      allowedVisitorTypes: (Array.isArray(req.body.allowedVisitorTypes) && req.body.allowedVisitorTypes.length > 0)
        ? req.body.allowedVisitorTypes.map(type => ({
            type: type.toLowerCase().includes('family') ? 'family' :
                  type.toLowerCase().includes('lawyer') || type.toLowerCase().includes('legal') ? 'lawyer' :
                  type.toLowerCase().includes('religious') ? 'religious' : 'friend',
            restrictions: ''
          }))
        : existingRule.allowedVisitorTypes,

      // Transform security checks from array to object
      securityChecks: Array.isArray(req.body.securityChecks)
        ? {
            idVerification: req.body.securityChecks.some(check =>
              String(check).toLowerCase().includes('id') || String(check).toLowerCase().includes('verification')),
            backgroundCheck: req.body.securityChecks.some(check =>
              String(check).toLowerCase().includes('background')),
            metalDetector: req.body.securityChecks.some(check =>
              String(check).toLowerCase().includes('metal') || String(check).toLowerCase().includes('detector')),
            bagSearch: req.body.securityChecks.some(check =>
              String(check).toLowerCase().includes('bag') || String(check).toLowerCase().includes('search'))
          }
        : (existingRule.securityChecks || {}),

      // Keep prohibited items as simple array
      prohibitedItems: (req.body.prohibitedItems ?? existingRule.prohibitedItems) || [],

      // Transform special conditions to schema format
      specialConditions: Array.isArray(req.body.specialConditions)
        ? req.body.specialConditions.map(condition => ({
            condition,
            description: condition,
            applicableToBlocks: []
          }))
        : existingRule.specialConditions,

      // Store additional frontend fields in a custom field for compatibility
      frontendData: {
        rules: req.body.rules ?? (existingRule.frontendData?.rules || []),
        restrictions: req.body.restrictions ?? (existingRule.frontendData?.restrictions || []),
        eligibilityCriteria: req.body.eligibilityCriteria ?? (existingRule.frontendData?.eligibilityCriteria || []),
        category: req.body.category ?? (existingRule.frontendData?.category || 'general')
      }
    };

    console.log('🔄 Transformed update data for MongoDB:', JSON.stringify(transformedData, null, 2));

    // Update the rule
    Object.assign(existingRule, transformedData);
    await existingRule.save();
    const updatedRule = await VisitRules.findById(existingRule._id).populate('createdBy', 'name email');


    console.log('✅ Rule updated in MongoDB:', updatedRule._id);

    // Transform back to frontend format for response
    const responseRule = {
      _id: updatedRule._id,
      title: updatedRule.title,
      description: updatedRule.description,
      category: updatedRule.frontendData?.category || 'general',
      rules: Array.isArray(updatedRule.frontendData?.rules) ? updatedRule.frontendData.rules : (updatedRule.frontendData?.rules ? [updatedRule.frontendData.rules] : []),
      restrictions: Array.isArray(updatedRule.frontendData?.restrictions) ? updatedRule.frontendData.restrictions : (updatedRule.frontendData?.restrictions ? [updatedRule.frontendData.restrictions] : []),
      eligibilityCriteria: Array.isArray(updatedRule.frontendData?.eligibilityCriteria) ? updatedRule.frontendData.eligibilityCriteria : (updatedRule.frontendData?.eligibilityCriteria ? [updatedRule.frontendData.eligibilityCriteria] : []),
      prohibitedItems: Array.isArray(updatedRule.prohibitedItems) ? updatedRule.prohibitedItems : (updatedRule.prohibitedItems ? [updatedRule.prohibitedItems] : []),
      allowedVisitorTypes: Array.isArray(updatedRule.allowedVisitorTypes) ? updatedRule.allowedVisitorTypes.map(vt => (vt && vt.type) ? vt.type : String(vt)) : [],
      specialConditions: Array.isArray(updatedRule.specialConditions) ? updatedRule.specialConditions.map(sc => (sc && sc.condition) ? sc.condition : String(sc)) : [],
      securityChecks: Object.keys(updatedRule.securityChecks || {}).filter(key =>
        updatedRule.securityChecks && updatedRule.securityChecks[key] === true),
      visitingHours: {
        maxVisitsPerWeek: updatedRule.visitingHours?.maxVisitsPerWeek || 2,
        maxVisitsPerMonth: updatedRule.visitingHours?.maxVisitsPerMonth || 8,
        maxVisitDuration: updatedRule.visitingHours?.maxVisitDuration || 60,
        maxVisitorsPerSession: updatedRule.visitingHours?.maxVisitorsPerSession || 3,
        minVisitorAge: updatedRule.visitingHours?.minVisitorAge || 18
      },
      isActive: updatedRule.isActive,
      createdAt: updatedRule.createdAt,
      updatedAt: updatedRule.updatedAt,
      createdBy: updatedRule.createdBy
    };

    console.log('📤 Sending update response:', JSON.stringify(responseRule, null, 2));

    res.json({ success: true, rule: responseRule, msg: 'Visit rules updated successfully' });
  } catch (error) {
    console.error('Update visit rules error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Delete visit rules
router.delete('/rules/visits/:id', requireAdmin, async (req, res) => {
  try {
    console.log('🗑️ Deleting visit rule with ID:', req.params.id);

    const deletedRule = await VisitRules.findByIdAndDelete(req.params.id);
    if (!deletedRule) {
      return res.status(404).json({ msg: 'Visit rule not found' });
    }

    console.log('✅ Rule deleted from MongoDB:', deletedRule._id);
    res.json({ success: true, msg: 'Visit rule deleted successfully' });
  } catch (error) {
    console.error('Delete visit rules error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Get parole rules
router.get('/rules/parole', requireAdmin, async (req, res) => {
  try {
    const rules = await ParoleRules.find()
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    res.json({ success: true, rules });
  } catch (error) {
    console.error('Get parole rules error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Create/Update parole rules
router.post('/rules/parole', requireAdmin, async (req, res) => {
  try {
    const ruleData = {
      ...req.body,
      createdBy: req.user._id,
      version: req.body.version || '1.0'
    };

    // Deactivate previous rules if creating new version
    if (req.body.isActive) {
      await ParoleRules.updateMany({}, { isActive: false });
    }

    const newRule = new ParoleRules(ruleData);
    await newRule.save();

    const populatedRule = await ParoleRules.findById(newRule._id)
      .populate('createdBy', 'name email');

    res.json({ success: true, rule: populatedRule, msg: 'Parole rules created successfully' });
  } catch (error) {
    console.error('Create parole rules error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Get prison rules
router.get('/rules/prison', requireAdmin, async (req, res) => {
  try {
    console.log('📋 Fetching prison rules from MongoDB...');

    const { category } = req.query;
    const filter = {};
    if (category) filter.category = category;

    const rules = await PrisonRules.find(filter)
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('applicableToBlocks', 'name blockCode')
      .sort({ createdAt: -1 });

    console.log(`📊 Found ${rules.length} prison rules in MongoDB`);

    // Transform MongoDB data to frontend format
    const transformedRules = rules.map(rule => ({
      _id: rule._id,
      title: rule.title,
      description: rule.description,
      category: rule.category,
      ruleNumber: rule.frontendData?.ruleNumber || '',
      severity: rule.frontendData?.severity || 'minor',
      consequences: rule.frontendData?.consequences || [],
      applicableBlocks: rule.frontendData?.applicableBlocks || [],
      isActive: rule.isActive,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
      createdBy: rule.createdBy
    }));

    console.log('📤 Sending transformed prison rules to frontend:', transformedRules.length);

    res.json({ success: true, rules: transformedRules });
  } catch (error) {
    console.error('Get prison rules error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Create prison rules
router.post('/rules/prison', requireAdmin, async (req, res) => {
  try {
    console.log('📝 Creating prison rule with data:', JSON.stringify(req.body, null, 2));

    // Transform frontend data to match MongoDB schema
    const transformedData = {
      title: req.body.title,
      description: req.body.description,
      category: req.body.category || 'general',
      version: req.body.version || '1.0',
      isActive: req.body.isActive !== undefined ? req.body.isActive : true,
      createdBy: req.user._id,

      // Transform rules from simple array to schema format
      rules: (req.body.consequences || []).map((consequence, index) => ({
        ruleNumber: req.body.ruleNumber || `R${Date.now()}-${index + 1}`,
        ruleText: consequence,
        severity: req.body.severity || 'minor',
        penalty: consequence
      })),

      // Handle applicable blocks
      applicableToBlocks: [], // Will be populated later if needed
      applicableToSecurityLevels: ['minimum', 'medium', 'maximum'], // Default to all

      // Store additional frontend fields
      frontendData: {
        ruleNumber: req.body.ruleNumber,
        severity: req.body.severity,
        consequences: req.body.consequences || [],
        applicableBlocks: req.body.applicableBlocks || []
      }
    };

    console.log('🔄 Transformed prison rule data:', JSON.stringify(transformedData, null, 2));

    const newRule = new PrisonRules(transformedData);
    await newRule.save();

    console.log('✅ Prison rule saved to MongoDB:', newRule._id);

    const populatedRule = await PrisonRules.findById(newRule._id)
      .populate('createdBy', 'name email')
      .populate('applicableToBlocks', 'name blockCode');

    // Transform back to frontend format
    const responseRule = {
      _id: populatedRule._id,
      title: populatedRule.title,
      description: populatedRule.description,
      category: populatedRule.category,
      ruleNumber: populatedRule.frontendData?.ruleNumber || '',
      severity: populatedRule.frontendData?.severity || 'minor',
      consequences: populatedRule.frontendData?.consequences || [],
      applicableBlocks: populatedRule.frontendData?.applicableBlocks || [],
      isActive: populatedRule.isActive,
      createdAt: populatedRule.createdAt,
      updatedAt: populatedRule.updatedAt,
      createdBy: populatedRule.createdBy
    };

    console.log('📤 Sending prison rule response:', JSON.stringify(responseRule, null, 2));

    res.json({ success: true, rule: responseRule, msg: 'Prison rules created successfully' });
  } catch (error) {
    console.error('Create prison rules error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Update prison rules
router.put('/rules/prison/:id', requireAdmin, async (req, res) => {
  try {
    const existingRule = await PrisonRules.findById(req.params.id);
    if (!existingRule) {
      return res.status(404).json({ msg: 'Rule not found' });
    }

    // Map UI severity (low/medium/high) to model enum (minor/major/critical)
    const mapSeverityUiToModel = (s) => {
      if (s === 'low') return 'minor';
      if (s === 'medium') return 'major';
      if (s === 'high') return 'critical';
      return s || 'minor';
    };

    // Normalize incoming rules from either req.body.rules (array of objects)
    // or req.body.consequences (array of strings)
    let incomingRules = [];
    if (Array.isArray(req.body.rules) && req.body.rules.length > 0) {
      incomingRules = req.body.rules;
    } else if (Array.isArray(req.body.consequences) && req.body.consequences.length > 0) {
      incomingRules = req.body.consequences.map((c, idx) => ({
        ruleNumber: req.body.ruleNumber || `R${Date.now()}-${idx + 1}`,
        ruleText: c,
        severity: mapSeverityUiToModel(req.body.severity) || 'minor',
        penalty: c
      }));
    } else {
      incomingRules = existingRule.rules || [];
    }

    const normalizedRules = incomingRules.map((r, idx) => {
      if (typeof r === 'string') {
        return {
          ruleNumber: req.body.ruleNumber || `R${Date.now()}-${idx + 1}`,
          ruleText: r,
          severity: mapSeverityUiToModel(req.body.severity) || 'minor',
          penalty: r
        };
      }
      return {
        ruleNumber: r.ruleNumber || req.body.ruleNumber || `R${Date.now()}-${idx + 1}`,
        ruleText: r.ruleText || r.text || '',
        severity: mapSeverityUiToModel(r.severity || req.body.severity || (existingRule.rules?.[0]?.severity) || 'minor'),
        penalty: r.penalty || r.ruleText || r.text || ''
      };
    });

    const updateDoc = {
      title: req.body.title ?? existingRule.title,
      description: req.body.description ?? existingRule.description,
      category: req.body.category ?? existingRule.category,
      version: req.body.version || existingRule.version || '1.0',
      isActive: req.body.isActive !== undefined ? req.body.isActive : existingRule.isActive,
      rules: normalizedRules,
      frontendData: {
        ruleNumber: req.body.ruleNumber ?? (existingRule.frontendData?.ruleNumber || ''),
        severity: req.body.severity ?? (existingRule.frontendData?.severity || 'medium'),
        consequences: Array.isArray(req.body.consequences)
          ? req.body.consequences
          : (existingRule.frontendData?.consequences || []),
        applicableBlocks: Array.isArray(req.body.applicableBlocks)
          ? req.body.applicableBlocks
          : (existingRule.frontendData?.applicableBlocks || [])
      }
    };

    const updatedRule = await PrisonRules.findByIdAndUpdate(
      req.params.id,
      updateDoc,
      { new: true, runValidators: true }
    )
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('applicableToBlocks', 'name blockCode');

    const responseRule = {
      _id: updatedRule._id,
      title: updatedRule.title,
      description: updatedRule.description,
      category: updatedRule.category,
      ruleNumber: updatedRule.frontendData?.ruleNumber || '',
      severity: updatedRule.frontendData?.severity || 'medium',
      consequences: Array.isArray(updatedRule.frontendData?.consequences) ? updatedRule.frontendData.consequences : [],
      applicableBlocks: Array.isArray(updatedRule.frontendData?.applicableBlocks) ? updatedRule.frontendData.applicableBlocks : [],
      isActive: updatedRule.isActive,
      createdAt: updatedRule.createdAt,
      updatedAt: updatedRule.updatedAt,
      createdBy: updatedRule.createdBy
    };

    res.json({ success: true, rule: responseRule, msg: 'Prison rules updated successfully' });
  } catch (error) {
    console.error('Update prison rules error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Delete prison rules
router.delete('/rules/prison/:id', requireAdmin, async (req, res) => {
  try {
    const rule = await PrisonRules.findByIdAndDelete(req.params.id);
    if (!rule) {
      return res.status(404).json({ msg: 'Rule not found' });
    }
    res.json({ success: true, msg: 'Prison rule deleted successfully' });
  } catch (error) {
    console.error('Delete prison rules error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Approve prison rules
router.put('/rules/prison/:id/approve', requireAdmin, async (req, res) => {
  try {
    const rule = await PrisonRules.findByIdAndUpdate(
      req.params.id,
      {
        approvedBy: req.user._id,
        approvalDate: new Date(),
        isActive: true
      },
      { new: true }
    ).populate('createdBy', 'name email')
     .populate('approvedBy', 'name email')
     .populate('applicableToBlocks', 'name blockCode');

    if (!rule) {
      return res.status(404).json({ msg: 'Rule not found' });
    }

    res.json({ success: true, rule, msg: 'Rule approved successfully' });
  } catch (error) {
    console.error('Approve rule error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// ===== USER MANAGEMENT =====

// Get all users
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 });
    
    res.json({ success: true, users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Create new user
router.post('/users', requireAdmin, async (req, res) => {
  try {
    const { name, email, password, role, phone, address, gender, nationality, isActive } = req.body;

    // Validate required fields
    if (!name || !email || !password || !role) {
      return res.status(400).json({ msg: 'Name, email, password, and role are required' });
    }

    // Validate phone number if provided
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length !== 10 || !/^[6-9]/.test(cleanPhone)) {
        return res.status(400).json({ msg: 'Phone number must be exactly 10 digits starting with 6, 7, 8, or 9' });
      }
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ msg: 'Email already exists' });
    }

    // Hash password
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role,
      phoneNumber: phone,
      address,
      gender,
      nationality,
      isActive: isActive !== undefined ? isActive : true,
      authProvider: 'local'
    });

    await newUser.save();

    // Return user without password
    const userResponse = await User.findById(newUser._id).select('-password');
    
    res.json({ 
      success: true, 
      user: userResponse, 
      msg: 'User created successfully' 
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Update user
router.put('/users/:id', requireAdmin, async (req, res) => {
  try {
    const { name, email, password, role, phone, address, gender, nationality, isActive } = req.body;
    const userId = req.params.id;

    // Check if user exists
    const existingUser = await User.findById(userId);
    if (!existingUser) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Email cannot be changed after account creation
    if (email && email !== existingUser.email) {
      return res.status(400).json({ msg: 'Email cannot be changed after account creation' });
    }

    // Validate phone number if provided
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length !== 10 || !/^[6-9]/.test(cleanPhone)) {
        return res.status(400).json({ msg: 'Phone number must be exactly 10 digits starting with 6, 7, 8, or 9' });
      }
    }

    // Prepare update data
    const updateData = {};
    if (name) updateData.name = name;
    // Email is not included in updates as it cannot be changed
    if (role) updateData.role = role;
    if (phone !== undefined) updateData.phoneNumber = phone;
    if (address !== undefined) updateData.address = address;
    if (gender !== undefined) updateData.gender = gender;
    if (nationality !== undefined) updateData.nationality = nationality;
    if (isActive !== undefined) updateData.isActive = isActive;

    // Hash password if provided
    if (password) {
      const bcrypt = require('bcryptjs');
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    res.json({ 
      success: true, 
      user: updatedUser, 
      msg: 'User updated successfully' 
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Delete user
router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Prevent admin from deleting themselves
    if (userId === req.user._id.toString()) {
      return res.status(400).json({ msg: 'Cannot delete your own account' });
    }

    // Delete user
    await User.findByIdAndDelete(userId);

    res.json({ success: true, msg: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Toggle user status
router.put('/users/:id/toggle-status', requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { isActive } = req.body;

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Prevent admin from deactivating themselves
    if (userId === req.user._id.toString() && !isActive) {
      return res.status(400).json({ msg: 'Cannot deactivate your own account' });
    }

    // Update user status
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { isActive },
      { new: true }
    ).select('-password');

    res.json({ 
      success: true, 
      user: updatedUser, 
      msg: `User ${isActive ? 'activated' : 'deactivated'} successfully` 
    });
  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Check email uniqueness
router.post('/check-email', requireAdmin, async (req, res) => {
  try {
    const { email, userId } = req.body;

    if (!email) {
      return res.status(400).json({ msg: 'Email is required' });
    }

    // Build query to exclude current user if editing
    const query = { email };
    if (userId) {
      query._id = { $ne: userId };
    }

    const existingUser = await User.findOne(query);
    
    res.json({ 
      success: true, 
      available: !existingUser,
      msg: existingUser ? 'Email already exists' : 'Email is available'
    });
  } catch (error) {
    console.error('Check email error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

module.exports = router;

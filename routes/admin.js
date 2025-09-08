const express = require('express');
const router = express.Router();

// Import models
const User = require('../models/User');
const Prisoner = require('../models/Prisoner');
const PrisonBlock = require('../models/PrisonBlock');
const Report = require('../models/Report');
const { VisitRules, ParoleRules, PrisonRules } = require('../models/Rules');
const { uploadPrisonerFiles, uploadBulkPrisoners, handleUploadError } = require('../middleware/upload');
const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse/sync');

// Import report models
const { BehavioralReport, IncidentReport, WeeklyActivityReport } = require('../models/Report');
const Settings = require('../models/Settings');

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
    const { Visit } = require('../models/Visit');
    const totalUsers = await User.countDocuments();

    // Count approved visits as scheduled total, pending as moderation queue
    const [approvedCount, pendingCount] = await Promise.all([
      Visit.countDocuments({ status: 'approved' }),
      Visit.countDocuments({ status: 'pending' })
    ]);

    const activeInmates = await Prisoner.countDocuments({ status: 'active' });
    const totalStaff = await User.countDocuments({
      role: { $in: ['warden', 'staff'] }
    });

    res.json({
      totalUsers: totalUsers || 0,
      totalVisits: approvedCount || 0,
      pendingRequests: pendingCount || 0,
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

// ===== TEMPLATE DOWNLOAD =====

// Download prisoner bulk upload template
router.get('/prisoners/template', requireAdmin, async (req, res) => {
  try {
    const xlsx = require('xlsx');
    
    // Get available blocks for reference
    const blocks = await PrisonBlock.find({ isActive: true }).select('name blockCode');
    
    // Create template with headers matching single prisoner form
    const headers = [
      'firstName',
      'lastName', 
      'middleName',
      'dateOfBirth',
      'gender',
      'prisonerNumber',
      'currentBlock',
      'securityLevel',
      'charges',
      'sentenceLength',
      'admissionDate',
      'cellNumber',
      'address',
      'emergencyContact_name',
      'emergencyContact_relationship',
      'emergencyContact_phone'
    ];

    // Instructions row
    const instructions = [
      'Enter first name',
      'Enter last name',
      'Enter middle name (optional)',
      'Format: YYYY-MM-DD (must be 18+ years old)',
      'male/female/other',
      'Enter prisoner number (e.g., P2024001)',
      `Block code (Available: ${blocks.map(b => b.blockCode).join(', ')})`,
      'minimum/medium/maximum/supermax',
      'Comma-separated charges',
      'Sentence length (e.g., 5 years)',
      'Format: YYYY-MM-DD (within last 6 months)',
      'Cell number (optional)',
      'Full address (street, city, state, pincode)',
      'Emergency contact name',
      'Relationship to prisoner',
      'Phone number'
    ];

    // Sample data
    const sampleData = [
      'John',
      'Doe',
      'Michael',
      '1990-05-15',
      'male',
      'P2024001',
      blocks.length > 0 ? blocks[0].blockCode : 'BLOCK-A',
      'medium',
      'Theft, Burglary',
      '5 years',
      '2024-01-15',
      'A-101',
      '123 Main Street, Mumbai, Maharashtra, 400001',
      'Jane Doe',
      'Sister',
      '9876543210'
    ];

    // Create worksheet
    const wsData = [
      ['PRISONER BULK UPLOAD TEMPLATE'],
      [],
      ['INSTRUCTIONS:'],
      ['1. Fill in all required fields'],
      ['2. Enter unique prisoner numbers (e.g., P2024001, P2024002)'],
      ['3. Date format: YYYY-MM-DD'],
      ['4. Address should be complete in one field'],
      ['5. Save as CSV or Excel format'],
      [],
      headers,
      instructions,
      [],
      ['SAMPLE DATA:'],
      sampleData
    ];

    const ws = xlsx.utils.aoa_to_sheet(wsData);
    
    // Set column widths
    ws['!cols'] = headers.map(() => ({ wch: 20 }));
    
    // Merge title cell
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: headers.length - 1 } },
      { s: { r: 12, c: 0 }, e: { r: 12, c: headers.length - 1 } }
    ];

    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Prisoner Template');
    
    // Generate buffer
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Disposition', 'attachment; filename=prisoner-bulk-upload-template.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
    
  } catch (error) {
    console.error('Template download error:', error);
    res.status(500).json({ msg: 'Error generating template', error: error.message });
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

// Get unallocated blocks for warden assignment
router.get('/blocks/unallocated', requireAdmin, async (req, res) => {
  try {
    const unallocatedBlocks = await PrisonBlock.find({
      isActive: true,
      $or: [
        { assignedWardens: { $exists: false } },
        { assignedWardens: { $size: 0 } }
      ]
    })
      .populate('assignedWardens', 'name email wardenDetails')
      .populate('headWarden', 'name email wardenDetails')
      .sort({ createdAt: -1 });
    
    res.json({ success: true, blocks: unallocatedBlocks });
  } catch (error) {
    console.error('Get unallocated blocks error:', error);
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
      facilities,
      cells
    } = req.body;
    
    // Check if block code already exists
    const existingBlock = await PrisonBlock.findOne({ blockCode });
    if (existingBlock) {
      return res.status(400).json({ msg: 'Block code already exists' });
    }
    
    // Check total capacity limit
    const currentBlocks = await PrisonBlock.find({});
    const currentTotalCapacity = currentBlocks.reduce((sum, block) => sum + (block.totalCapacity || 0), 0);
    const newTotalCapacity = currentTotalCapacity + parseInt(totalCapacity);
    
    // Prison capacity limit (reads from Settings if available)
    const settingsDoc = await (Settings?.findOne ? Settings.findOne({}) : null);
    const PRISON_CAPACITY_LIMIT = settingsDoc?.general?.capacity ?? 1000;
    
    if (newTotalCapacity > PRISON_CAPACITY_LIMIT) {
      return res.status(400).json({ 
        msg: `Cannot create block. Total capacity would exceed prison limit of ${PRISON_CAPACITY_LIMIT}. Current total: ${currentTotalCapacity}, Requested: ${totalCapacity}` 
      });
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
      facilities: facilities || [],
      cells
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
    // If updating capacity, check limits
    if (req.body.totalCapacity) {
      const currentBlocks = await PrisonBlock.find({ _id: { $ne: req.params.id } });
      const currentTotalCapacity = currentBlocks.reduce((sum, block) => sum + (block.totalCapacity || 0), 0);
      const newTotalCapacity = currentTotalCapacity + parseInt(req.body.totalCapacity);
      
      // Prison capacity limit (reads from Settings if available)
      const settingsDoc = await (Settings?.findOne ? Settings.findOne({}) : null);
      const PRISON_CAPACITY_LIMIT = settingsDoc?.general?.capacity ?? 1000;
      
      if (newTotalCapacity > PRISON_CAPACITY_LIMIT) {
        return res.status(400).json({ 
          msg: `Cannot update block. Total capacity would exceed prison limit of ${PRISON_CAPACITY_LIMIT}. Current total (excluding this block): ${currentTotalCapacity}, Requested: ${req.body.totalCapacity}` 
        });
      }
    }

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

    // Check if all blocks are allocated to wardens
    const allBlocks = await PrisonBlock.find({ isActive: true });
    const blocksWithWardens = allBlocks.filter(block => 
      block.assignedWardens && block.assignedWardens.length > 0
    );
    
    if (allBlocks.length > 0 && blocksWithWardens.length === allBlocks.length) {
      return res.status(400).json({ 
        msg: 'Cannot add new warden. All prison blocks are already allocated to existing wardens.' 
      });
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

    // IMPORTANT: Do NOT hash here; User model pre-save hook will hash automatically
    const newWarden = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: autoGeneratedPassword,
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

    // Update PrisonBlock.assignedWardens for each assigned block
    if (assignedBlocks && assignedBlocks.length > 0) {
      await PrisonBlock.updateMany(
        { _id: { $in: assignedBlocks } },
        { $addToSet: { assignedWardens: newWarden._id } }
      );
      console.log('✅ Updated PrisonBlock.assignedWardens for assigned blocks');
    }

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

    const isDev = process.env.NODE_ENV !== 'production';
    res.json({
      success: true,
      warden: wardenResponse,
      ...(isDev ? { generatedPassword: autoGeneratedPassword } : {}),
      msg: isDev
        ? 'Warden created. Temporary password included in response for development only.'
        : 'Warden created successfully. Login credentials have been sent to their email address.'
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

    // Update PrisonBlock.assignedWardens for assigned blocks
    if (assignedBlocks && assignedBlocks.length > 0) {
      // First, remove warden from all blocks
      await PrisonBlock.updateMany(
        { assignedWardens: req.params.id },
        { $pull: { assignedWardens: req.params.id } }
      );
      
      // Then, add warden to newly assigned blocks
      await PrisonBlock.updateMany(
        { _id: { $in: assignedBlocks } },
        { $addToSet: { assignedWardens: req.params.id } }
      );
      console.log('✅ Updated PrisonBlock.assignedWardens for assigned blocks');
    } else {
      // If no blocks assigned, remove warden from all blocks
      await PrisonBlock.updateMany(
        { assignedWardens: req.params.id },
        { $pull: { assignedWardens: req.params.id } }
      );
      console.log('✅ Removed warden from all blocks');
    }

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
router.post('/prisoners', requireAdmin, uploadPrisonerFiles, handleUploadError, async (req, res) => {
  try {
    // Support JSON and multipart/form-data
    let {
      prisonerNumber,
      firstName,
      lastName,
      middleName,
      dateOfBirth,
      gender,
      currentBlock,
      charges,
      sentenceDetails,
      securityLevel,
      cellNumber,
      admissionDate,
      address,
      emergencyContact,
      emergencyContacts
    } = req.body;

    // Parse nested JSON strings if provided via form-data
    if (typeof address === 'string') {
      try { address = JSON.parse(address); } catch (e) { address = undefined; }
    }
    if (typeof emergencyContact === 'string') {
      try { emergencyContact = JSON.parse(emergencyContact); } catch (e) { emergencyContact = undefined; }
    }
    if (typeof emergencyContacts === 'string') {
      try { emergencyContacts = JSON.parse(emergencyContacts); } catch (e) { emergencyContacts = undefined; }
    }
    if (typeof sentenceDetails === 'string') {
      try { sentenceDetails = JSON.parse(sentenceDetails); } catch (e) { sentenceDetails = undefined; }
    }

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

    // Normalize fields
    const parsedCharges = Array.isArray(charges)
      ? charges
      : (typeof charges === 'string' && charges.trim() !== '')
        ? charges.split(',').map(c => ({ charge: c.trim() }))
        : [];

    const photoPath = (req.files && req.files.photograph && req.files.photograph[0])
      ? `/uploads/prisoner-photos/${path.basename(req.files.photograph[0].path)}`
      : undefined;
    const governmentIdPath = (req.files && req.files.governmentId && req.files.governmentId[0])
      ? `/uploads/prisoner-docs/${path.basename(req.files.governmentId[0].path)}`
      : undefined;

    // Compute expectedReleaseDate from admissionDate + sentenceLength (months)
    let sentenceDetailsFull = sentenceDetails || {};
    const sentenceLen = Number(sentenceDetailsFull?.sentenceLength ?? req.body?.sentenceLength);
    const startDate = sentenceDetailsFull?.startDate || admissionDate;
    if (sentenceLen && startDate) {
      const d = new Date(startDate);
      const day = d.getDate();
      d.setMonth(d.getMonth() + sentenceLen);
      // Handle overflow (e.g., Feb 30 -> last day of previous month)
      if (d.getDate() < day) d.setDate(0);
      sentenceDetailsFull = {
        ...sentenceDetailsFull,
        sentenceLength: sentenceLen,
        startDate: new Date(startDate),
        expectedReleaseDate: d
      };
    }

    // Normalize multiple emergency contacts and primary fallback
    let normalizedEmergencyContacts = Array.isArray(emergencyContacts)
      ? emergencyContacts.filter(c => c && (c.name || c.phone || c.relationship))
      : [];
    if (!normalizedEmergencyContacts.length && emergencyContact && typeof emergencyContact === 'object') {
      if (emergencyContact.name || emergencyContact.phone || emergencyContact.relationship) {
        normalizedEmergencyContacts = [emergencyContact];
      }
    }
    const primaryEmergencyContact = (emergencyContact && (emergencyContact.name || emergencyContact.phone || emergencyContact.relationship))
      ? emergencyContact
      : normalizedEmergencyContacts[0];

    const newPrisoner = new Prisoner({
      prisonerNumber,
      firstName,
      lastName,
      middleName,
      dateOfBirth,
      gender,
      currentBlock,
      cellNumber,
      admissionDate,
      address,
      emergencyContact: primaryEmergencyContact,
      emergencyContacts: normalizedEmergencyContacts,
      charges: parsedCharges,
      sentenceDetails: sentenceDetailsFull,
      securityLevel: securityLevel || 'medium',
      photograph: photoPath,
      governmentId: governmentIdPath
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

// Bulk upload prisoners via CSV/Excel + optional photos
// Supports new template format with auto-generated prisoner numbers
// CSV columns: firstName,lastName,middleName,dateOfBirth,gender,currentBlock,cellNumber,admissionDate,securityLevel,charges,address_*,emergencyContact_*,photoFilename
router.post('/prisoners/bulk', requireAdmin, uploadBulkPrisoners, handleUploadError, async (req, res) => {
  try {
    if (!req.files || !req.files.csvFile || req.files.csvFile.length === 0) {
      return res.status(400).json({ success: false, msg: 'CSV/Excel file is required' });
    }

    const csvFilePath = req.files.csvFile[0].path;
    const ext = path.extname(csvFilePath).toLowerCase();

    let records = [];
    if (ext === '.xlsx' || ext === '.xls') {
      // Parse Excel file
      try {
        const xlsx = require('xlsx');
        const workbook = xlsx.readFile(csvFilePath);
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawRecords = xlsx.utils.sheet_to_json(worksheet, { raw: false, defval: '' });
        
        // Filter out instruction rows and empty rows - using new fullName field
        records = rawRecords.filter(row => {
          return row.fullName && 
                 row.fullName !== 'fullName' && 
                 row.fullName !== 'John Michael Doe' &&
                 !row.fullName.startsWith('PRISONER') &&
                 !row.fullName.startsWith('INSTRUCTIONS') &&
                 !row.fullName.startsWith('SAMPLE');
        });
      } catch (e) {
        return res.status(400).json({ success: false, msg: 'Excel parsing failed: ' + e.message });
      }
    } else {
      // Parse CSV file
      const csvContent = fs.readFileSync(csvFilePath, 'utf-8');
      const rawRecords = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true });
      
      // Filter out instruction rows - using new fullName field
      records = rawRecords.filter(row => {
        return row.fullName && 
               row.fullName !== 'John Michael Doe' &&
               !row.fullName.startsWith('PRISONER') &&
               !row.fullName.startsWith('INSTRUCTIONS') &&
               !row.fullName.startsWith('SAMPLE');
      });
    }

    if (records.length === 0) {
      return res.status(400).json({ success: false, msg: 'No valid data rows found in the file' });
    }

    // Map original photo filenames to stored paths
    const photoMap = new Map();
    if (req.files.photos) {
      req.files.photos.forEach(p => {
        photoMap.set(p.originalname, `/uploads/prisoner-photos/${path.basename(p.path)}`);
      });
    }



    const results = [];
    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNumber = i + 1;
      
      try {
        // Validate required fields
        if (!row.firstName || !row.lastName) {
          results.push({ 
            row: rowNumber, 
            name: `${row.firstName || ''} ${row.lastName || ''}`.trim(),
            success: false, 
            msg: 'First name and last name are required' 
          });
          continue;
        }

        if (!row.dateOfBirth) {
          results.push({ 
            row: rowNumber, 
            name: `${row.firstName} ${row.lastName}`,
            success: false, 
            msg: 'Date of birth is required' 
          });
          continue;
        }

        // Resolve block by blockCode
        let block = null;
        if (row.currentBlock) {
          block = await PrisonBlock.findOne({ blockCode: row.currentBlock });
          if (!block) {
            // Try by name as fallback
            block = await PrisonBlock.findOne({ name: row.currentBlock });
          }
        }
        if (!block) {
          results.push({ 
            row: rowNumber, 
            name: `${row.firstName} ${row.lastName}`,
            success: false, 
            msg: `Invalid prison block: ${row.currentBlock}` 
          });
          continue;
        }
        if (block.currentOccupancy >= block.totalCapacity) {
          results.push({ 
            row: rowNumber, 
            name: `${row.firstName} ${row.lastName}`,
            success: false, 
            msg: `Prison block ${block.name} is at capacity` 
          });
          continue;
        }

        // Validate prisoner number
        if (!row.prisonerNumber) {
          results.push({ 
            row: rowNumber, 
            name: `${row.firstName} ${row.lastName}`,
            success: false, 
            msg: 'Prisoner number is required' 
          });
          continue;
        }

        // Check if prisoner number already exists
        const existingPrisoner = await Prisoner.findOne({ prisonerNumber: row.prisonerNumber });
        if (existingPrisoner) {
          results.push({ 
            row: rowNumber, 
            name: `${row.firstName} ${row.lastName}`,
            success: false, 
            msg: `Prisoner number ${row.prisonerNumber} already exists` 
          });
          continue;
        }

        // Parse address from single field
        const address = {};
        if (row.address) {
          // Try to parse the address - assume format: "street, city, state, pincode"
          const addressParts = row.address.split(',').map(part => part.trim());
          if (addressParts.length >= 1) address.street = addressParts[0];
          if (addressParts.length >= 2) address.city = addressParts[1];
          if (addressParts.length >= 3) address.state = addressParts[2];
          if (addressParts.length >= 4) address.pincode = addressParts[3];
        }

        // Build emergency contact object from separate fields
        const emergencyContact = {};
        if (row.emergencyContact_name) emergencyContact.name = row.emergencyContact_name;
        if (row.emergencyContact_relationship) emergencyContact.relationship = row.emergencyContact_relationship;
        if (row.emergencyContact_phone) emergencyContact.phone = row.emergencyContact_phone;

        // Parse charges
        const charges = row.charges
          ? String(row.charges).split(',').map(c => ({ charge: c.trim() }))
          : [];

        // Get photo path if available
        const photo = row.photoFilename && photoMap.get(row.photoFilename) 
          ? photoMap.get(row.photoFilename) 
          : undefined;

        // Validate age (must be 18+)
        const birthDate = new Date(row.dateOfBirth);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
        
        if (age < 18) {
          results.push({ 
            row: rowNumber, 
            name: `${row.firstName} ${row.lastName}`,
            success: false, 
            msg: `Prisoner must be at least 18 years old (current age: ${age})` 
          });
          continue;
        }

        const prisoner = new Prisoner({
          prisonerNumber: row.prisonerNumber.trim(),
          firstName: row.firstName.trim(),
          lastName: row.lastName.trim(),
          middleName: row.middleName ? row.middleName.trim() : undefined,
          dateOfBirth: birthDate,
          gender: row.gender || 'male',
          currentBlock: block._id,
          cellNumber: row.cellNumber ? row.cellNumber.trim() : undefined,
          admissionDate: row.admissionDate ? new Date(row.admissionDate) : new Date(),
          securityLevel: row.securityLevel || 'medium',
          charges,
          sentenceLength: row.sentenceLength ? row.sentenceLength.trim() : undefined,
          address: Object.keys(address).length > 0 ? address : undefined,
          emergencyContact: Object.keys(emergencyContact).length > 0 ? emergencyContact : undefined,
          photograph: photo
        });

        await prisoner.save();
        
        // Update block occupancy
        block.currentOccupancy += 1;
        await block.save();

        results.push({ 
          row: rowNumber, 
          name: `${row.firstName} ${row.lastName}`,
          prisonerNumber: row.prisonerNumber.trim(),
          success: true 
        });
        
      } catch (innerErr) {
        results.push({ 
          row: rowNumber, 
          name: `${row.firstName || ''} ${row.lastName || ''}`.trim(),
          success: false, 
          msg: innerErr.message 
        });
      }
    }

    // Summary statistics
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.json({ 
      success: true, 
      results,
      summary: {
        total: records.length,
        successful,
        failed
      }
    });
  } catch (error) {
    console.error('Bulk create prisoners error:', error);
    res.status(500).json({ success: false, msg: 'Server error', error: error.message });
  }
});

// Update prisoner
router.put('/prisoners/:id', requireAdmin, uploadPrisonerFiles, handleUploadError, async (req, res) => {
  try {
    // Normalize update payload similar to create route
    let update = { ...req.body };

    // Parse nested JSON strings if provided via form-data
    if (typeof update.address === 'string') {
      try { update.address = JSON.parse(update.address); } catch (e) {}
    }
    if (typeof update.emergencyContact === 'string') {
      try { update.emergencyContact = JSON.parse(update.emergencyContact); } catch (e) {}
    }
    if (typeof update.emergencyContacts === 'string') {
      try { update.emergencyContacts = JSON.parse(update.emergencyContacts); } catch (e) {}
    }
    if (typeof update.sentenceDetails === 'string') {
      try { update.sentenceDetails = JSON.parse(update.sentenceDetails); } catch (e) {}
    }

    // Accept uploaded files for updates as well
    const photoPath = (req.files && req.files.photograph && req.files.photograph[0])
      ? `/uploads/prisoner-photos/${path.basename(req.files.photograph[0].path)}`
      : undefined;
    const governmentIdPath = (req.files && req.files.governmentId && req.files.governmentId[0])
      ? `/uploads/prisoner-docs/${path.basename(req.files.governmentId[0].path)}`
      : undefined;
    if (photoPath) update.photograph = photoPath;
    if (governmentIdPath) update.governmentId = governmentIdPath;

    // Normalize charges to expected schema [{ charge }]
    if (typeof update.charges === 'string') {
      const trimmed = update.charges.trim();
      update.charges = trimmed ? trimmed.split(',').map(c => ({ charge: c.trim() })) : [];
    } else if (Array.isArray(update.charges)) {
      update.charges = update.charges.map(c => (typeof c === 'string' ? { charge: c.trim() } : c));
    }

    // Sync primary emergencyContact with first of emergencyContacts if needed
    if (Array.isArray(update.emergencyContacts)) {
      const list = update.emergencyContacts.filter(Boolean);
      if (!update.emergencyContact && list.length > 0) {
        update.emergencyContact = list[0];
      }
    }

    const prisoner = await Prisoner.findByIdAndUpdate(
      req.params.id,
      update,
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

// Delete prisoner
router.delete('/prisoners/:id', requireAdmin, async (req, res) => {
  try {
    const prisoner = await Prisoner.findById(req.params.id);
    if (!prisoner) {
      return res.status(404).json({ msg: 'Prisoner not found' });
    }

    // Decrement block occupancy if active
    if (prisoner.currentBlock && prisoner.status === 'active') {
      const block = await PrisonBlock.findById(prisoner.currentBlock);
      if (block && block.currentOccupancy > 0) {
        block.currentOccupancy -= 1;
        await block.save();
      }
    }

    await Prisoner.findByIdAndDelete(req.params.id);

    res.json({ success: true, msg: 'Prisoner deleted successfully' });
  } catch (error) {
    console.error('Delete prisoner error:', error);
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

// Get behavioral reports (admin view)
router.get('/reports/behavioral', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, prisoner, warden, status } = req.query;
    const filter = {};
    if (prisoner) filter.prisoner = prisoner;
    if (warden) filter.reportedBy = warden;
    if (status) filter.reviewStatus = status;

    const reports = await BehavioralReport.find(filter)
      .populate('prisoner', 'prisonerNumber firstName lastName')
      .populate('reportedBy', 'name email')
      .populate('reviewedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await BehavioralReport.countDocuments(filter);

    res.json({
      success: true,
      reports,
      pagination: { current: page, pages: Math.ceil(total / limit), total }
    });
  } catch (error) {
    console.error('Get behavioral reports error:', error);
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
    const transformedRules = rules.map(rule => {
      // Map backend severity to frontend severity
      const mapSeverityToFrontend = (severity) => {
        if (severity === 'minor') return 'low';
        if (severity === 'major') return 'medium';
        if (severity === 'critical') return 'high';
        return severity || 'medium';
      };

      return {
        _id: rule._id,
        title: rule.title,
        description: rule.description,
        category: rule.category,
        ruleNumber: rule.frontendData?.ruleNumber || '',
        severity: mapSeverityToFrontend(rule.frontendData?.severity),
        consequences: rule.frontendData?.consequences || [],
        applicableBlocks: rule.frontendData?.applicableBlocks || [],
        isActive: rule.isActive,
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
        createdBy: rule.createdBy
      };
    });

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

    // Map frontend severity to backend severity
    const mapSeverityToBackend = (severity) => {
      if (severity === 'low') return 'minor';
      if (severity === 'medium') return 'major';
      if (severity === 'high') return 'critical';
      return severity || 'minor';
    };

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
        severity: mapSeverityToBackend(req.body.severity),
        penalty: consequence
      })),

      // Handle applicable blocks
      applicableToBlocks: [], // Will be populated later if needed
      applicableToSecurityLevels: ['minimum', 'medium', 'maximum'], // Default to all

      // Store additional frontend fields
      frontendData: {
        ruleNumber: req.body.ruleNumber,
        severity: mapSeverityToBackend(req.body.severity),
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

    // Map backend severity to frontend severity
    const mapSeverityToFrontend = (severity) => {
      if (severity === 'minor') return 'low';
      if (severity === 'major') return 'medium';
      if (severity === 'critical') return 'high';
      return severity || 'medium';
    };

    // Transform back to frontend format
    const responseRule = {
      _id: populatedRule._id,
      title: populatedRule.title,
      description: populatedRule.description,
      category: populatedRule.category,
      ruleNumber: populatedRule.frontendData?.ruleNumber || '',
      severity: mapSeverityToFrontend(populatedRule.frontendData?.severity),
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
        severity: mapSeverityUiToModel(req.body.severity) ?? (existingRule.frontendData?.severity || 'minor'),
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

    // Map backend severity to frontend severity
    const mapSeverityToFrontend = (severity) => {
      if (severity === 'minor') return 'low';
      if (severity === 'major') return 'medium';
      if (severity === 'critical') return 'high';
      return severity || 'medium';
    };

    const responseRule = {
      _id: updatedRule._id,
      title: updatedRule.title,
      description: updatedRule.description,
      category: updatedRule.category,
      ruleNumber: updatedRule.frontendData?.ruleNumber || '',
      severity: mapSeverityToFrontend(updatedRule.frontendData?.severity),
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

// ===== SETTINGS MANAGEMENT =====

// Get all settings
router.get('/settings', requireAdmin, async (req, res) => {
  try {
    // Load from DB or create defaults if missing
    let settingsDoc = await (Settings?.findOne ? Settings.findOne({}) : null);

    if (!settingsDoc) {
      settingsDoc = new Settings({
        general: {
          prisonName: 'Smart Prison Management System',
          address: 'Poojappura, Thiruvananthapuram - 695012, Kerala',
          phone: '+91 471 2308000',
          email: 'info@smartprison.kerala.gov.in',
          capacity: 1000,
        },
        security: {
          sessionTimeout: 30,
          passwordMinLength: 8,
          requireSpecialChars: true,
          maxLoginAttempts: 3,
          lockoutDuration: 15,
        },
        visits: {
          maxVisitorsPerSession: 3,
          visitDuration: 60,
          advanceBookingDays: 7,
          dailyVisitSlots: 8,
          weekendVisits: true,
          holidayVisits: false,
        },
      });
      await settingsDoc.save();
    }

    res.json({ success: true, settings: settingsDoc });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Update settings by category
router.put('/settings/:category', requireAdmin, async (req, res) => {
  try {
    const { category } = req.params;
    const settingsData = req.body;

    // Validate category
    const validCategories = ['general', 'security', 'visits'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ msg: 'Invalid settings category' });
    }

    // Upsert settings document
    let settingsDoc = await (Settings?.findOne ? Settings.findOne({}) : null);
    if (!settingsDoc) {
      settingsDoc = new Settings({});
    }

    // Assign only the selected category
    settingsDoc[category] = { ...settingsDoc[category]?.toObject?.() ?? {}, ...settingsData };
    await settingsDoc.save();

    // If visits settings updated, sync active visit rule visitingHours
    if (category === 'visits') {
      try {
        const activeRule = await VisitRules.findOne({ isActive: true }).sort({ updatedAt: -1 });
        if (activeRule) {
          activeRule.visitingHours = {
            ...activeRule.visitingHours,
            maxVisitDuration: settingsDoc.visits?.visitDuration ?? activeRule.visitingHours?.maxVisitDuration ?? 60,
            maxVisitorsPerSession: settingsDoc.visits?.maxVisitorsPerSession ?? activeRule.visitingHours?.maxVisitorsPerSession ?? 3,
          };
          await activeRule.save();
        }
      } catch (syncErr) {
        console.warn('Visit rules sync warning:', syncErr?.message);
      }
    }

    res.json({ 
      success: true, 
      msg: `${category.charAt(0).toUpperCase() + category.slice(1)} settings updated successfully` 
    });

  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Admin Reset Password
router.post('/reset-password', requireAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword) {
      return res.status(400).json({ msg: 'Current password is required' });
    }
    if (!newPassword) {
      return res.status(400).json({ msg: 'New password is required' });
    }

    // Get the current admin user
    const admin = await User.findById(req.user.id);
    if (!admin) {
      return res.status(404).json({ msg: 'Admin user not found' });
    }

    // Verify current password against stored hash
    const bcrypt = require('bcryptjs');
    const isMatch = await bcrypt.compare(currentPassword, admin.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Current password is incorrect' });
    }

    // Validate new password (dynamic based on Settings.security)
    let settingsDoc = await (Settings?.findOne ? Settings.findOne({}) : null);
    const minLength = settingsDoc?.security?.passwordMinLength ?? 8;
    const requireSpecial = settingsDoc?.security?.requireSpecialChars ?? true;

    if (newPassword.length < minLength) {
      return res.status(400).json({ msg: `New password must be at least ${minLength} characters long` });
    }

    if (!/(?=.*[a-zA-Z])/.test(newPassword)) {
      return res.status(400).json({ msg: 'New password must contain at least one letter' });
    }

    if (!/(?=.*\d)/.test(newPassword)) {
      return res.status(400).json({ msg: 'New password must contain at least one number' });
    }

    if (requireSpecial && !/(?=.*[@$!%*?&])/.test(newPassword)) {
      return res.status(400).json({ msg: 'New password must contain at least one special character (@$!%*?&)' });
    }

    // Update password (User model pre-save hook will hash it)
    admin.password = newPassword;
    await admin.save();

    res.json({ 
      success: true, 
      msg: 'Password updated successfully' 
    });

  } catch (error) {
    console.error('Admin reset password error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Public endpoint: expose only general settings for homepage/contact without auth
router.get('/public-settings', async (req, res) => {
  try {
    let settingsDoc = await (Settings?.findOne ? Settings.findOne({}) : null);

    // If no settings exist, create with defaults (general only)
    if (!settingsDoc) {
      settingsDoc = new Settings({
        general: {
          prisonName: 'Smart Prison Management System',
          address: 'Poojappura, Thiruvananthapuram - 695012, Kerala',
          phone: '+91 471 2308000',
          email: 'info@smartprison.kerala.gov.in',
          capacity: 1000,
        },
      });
      await settingsDoc.save();
    }

    return res.json({ success: true, settings: { general: settingsDoc.general } });
  } catch (error) {
    console.error('Get public settings error:', error);
    return res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

module.exports = router;

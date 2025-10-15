const express = require('express');
const router = express.Router();

// Import models
const User = require('../models/User');
const Details = require('../models/Details');
const Prisoner = require('../models/Prisoner');
const PrisonBlock = require('../models/PrisonBlock');
const Report = require('../models/Report');
const LeaveRequest = require('../models/LeaveRequest');
const Schedule = require('../models/Schedule');
const { sendStaffWelcomeEmail } = require('../services/staffEmailService');
const { uploadPrisonerFiles, handleUploadError } = require('../middleware/upload');
const autoScheduleService = require('../services/autoScheduleService');

// Middleware to check if user is warden
const requireWarden = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    
    // Check User collection for wardens
    const user = await User.findById(decoded.id).select('-password');
    if (!user || user.role !== 'warden') {
      return res.status(401).json({ msg: 'Token is not valid' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};

// ===== DASHBOARD ROUTES =====

// Dashboard Statistics
router.get('/dashboard/stats', requireWarden, async (req, res) => {
  try {
    // Import report models here to avoid circular requires
    const { BehavioralReport, IncidentReport, WeeklyActivityReport } = require('../models/Report');
    const LeaveRequest = require('../models/LeaveRequest');

    const [
      totalInmates,
      totalStaff,
      behavioralPending,
      incidentPending,
      weeklyPending,
      pendingLeaves,
      todaySchedule,
      behaviorAlerts,
      rehabilitationPrograms
    ] = await Promise.all([
      Prisoner.countDocuments({ status: 'active' }),
      User.countDocuments({ role: 'staff' }),
      BehavioralReport.countDocuments({ reviewStatus: 'pending' }),
      IncidentReport.countDocuments({ reviewStatus: 'pending' }),
      WeeklyActivityReport.countDocuments({ reviewStatus: 'pending' }),
      LeaveRequest.countDocuments({ status: 'Pending' }),
      getScheduleCount(new Date()),
      Prisoner.countDocuments({ behaviorScore: { $lte: 30 }, status: 'active' }),
      Prisoner.countDocuments({ educationPrograms: { $exists: true, $ne: [] }, status: 'active' })
    ]);

    const stats = {
      totalInmates,
      totalStaff,
      pendingReports: behavioralPending + incidentPending + weeklyPending,
      pendingParoles: 0, // Not modeled yet
      pendingLeaves,
      todaySchedule,
      behaviorAlerts,
      rehabilitationPrograms
    };

    res.json({ success: true, stats });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Recent Activity
router.get('/dashboard/activity', requireWarden, async (req, res) => {
  try {
    const recentActivity = [
      {
        type: 'report',
        title: 'Weekly Report Submitted',
        description: 'Block A weekly report submitted by Officer Johnson',
        time: '2 hours ago'
      },
      {
        type: 'parole',
        title: 'Parole Request Approved',
        description: 'Parole approved for inmate #12345 - John Smith',
        time: '4 hours ago'
      },
      {
        type: 'behavior',
        title: 'Behavior Alert',
        description: 'Incident reported in Block B - requires attention',
        time: '6 hours ago'
      },
      {
        type: 'staff',
        title: 'New Staff Added',
        description: 'Officer Williams added to security team',
        time: '1 day ago'
      },
      {
        type: 'rehabilitation',
        title: 'Program Assignment',
        description: '5 inmates assigned to anger management program',
        time: '2 days ago'
      }
    ];
    
    res.json({ success: true, activity: recentActivity });
  } catch (error) {
    console.error('Dashboard activity error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Dashboard Alerts
router.get('/dashboard/alerts', requireWarden, async (req, res) => {
  try {
    const alerts = [
      {
        priority: 'high',
        title: 'Security Alert',
        message: 'Unauthorized access attempt detected in Block C',
        time: '30 minutes ago'
      },
      {
        priority: 'medium',
        title: 'Staff Leave Request',
        message: '3 pending leave requests require approval',
        time: '2 hours ago'
      },
      {
        priority: 'low',
        title: 'Maintenance Scheduled',
        message: 'Routine maintenance scheduled for tomorrow',
        time: '1 day ago'
      },
      {
        priority: 'medium',
        title: 'Parole Review Due',
        message: '2 parole cases require review by end of week',
        time: '2 days ago'
      }
    ];
    
    res.json({ success: true, alerts });
  } catch (error) {
    console.error('Dashboard alerts error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// ===== INMATE MANAGEMENT =====

// Get inmates in the warden's assigned blocks only
router.get('/inmates', requireWarden, async (req, res) => {
  try {
    // Return all active inmates so UI filters by block can work across the prison
    const query = { status: 'active' };

    const inmates = await Prisoner.find(query)
      .populate('currentBlock', 'name blockCode')
      .sort({ createdAt: -1 });

    res.json({ success: true, inmates });
  } catch (error) {
    console.error('Get inmates error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Get cell occupancy for a specific block
router.get('/blocks/:blockId/occupancy', requireWarden, async (req, res) => {
  try {
    const { blockId } = req.params;
    
    const block = await PrisonBlock.findById(blockId).select('cells totalCapacity name');
    if (!block) {
      return res.status(404).json({ msg: 'Block not found' });
    }

    // Get all prisoners in this block with their cell numbers
    const prisoners = await Prisoner.find({ 
      currentBlock: blockId,
      cellNumber: { $exists: true, $ne: null, $ne: '' }
    }).select('cellNumber');

    console.log(`Found ${prisoners.length} prisoners in block ${block.name}:`, prisoners.map(p => ({ cell: p.cellNumber })));

    // Count occupancy per cell
    const occupancy = {};
    prisoners.forEach(prisoner => {
      const cellNumber = prisoner.cellNumber;
      if (cellNumber) {
        occupancy[cellNumber] = (occupancy[cellNumber] || 0) + 1;
      }
    });

    console.log('Calculated occupancy:', occupancy);

    res.json({ 
      success: true, 
      occupancy,
      block: {
        name: block.name,
        cells: block.cells,
        totalCapacity: block.totalCapacity,
        currentOccupancy: Object.values(occupancy).reduce((sum, count) => sum + count, 0)
      }
    });
  } catch (error) {
    console.error('Get block occupancy error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Update only inmate cell number
router.put('/inmates/:id/cell', requireWarden, async (req, res) => {
  try {
    const { id } = req.params;
    const { cellNumber, blockId } = req.body || {};

    if (cellNumber == null || String(cellNumber).trim() === '') {
      return res.status(400).json({ msg: 'cellNumber is required' });
    }

    const cellString = String(cellNumber).trim();

    const prisoner = await Prisoner.findById(id).select('currentBlock');
    if (!prisoner) return res.status(404).json({ msg: 'Prisoner not found' });

    // Determine target block (either provided or current)
    const targetBlockId = blockId || prisoner.currentBlock;
    const block = await PrisonBlock.findById(targetBlockId).select('cells totalCapacity name');
    if (!block) return res.status(400).json({ msg: 'Target block not found' });

    // Enforce limit using trailing numeric portion of the cell id if present
    const cellLimit = Number(block.cells || block.totalCapacity || 0);
    const digitsMatch = cellString.match(/(\d+)$/);
    if (cellLimit > 0) {
      if (!digitsMatch) {
        return res.status(400).json({ msg: `cellNumber must include a number from 1 to ${cellLimit}` });
      }
      const cellNum = parseInt(digitsMatch[1], 10);
      if (cellNum <= 0 || cellNum > cellLimit) {
        return res.status(400).json({ msg: `cellNumber out of range for ${block.name}. Allowed 1..${cellLimit}` });
      }
    }

    // Enforce per-cell occupancy: max 5 inmates per cell, but max 2 for high security cell (last cell)
    const currentCount = await Prisoner.countDocuments({ 
      _id: { $ne: id }, 
      currentBlock: targetBlockId, 
      cellNumber: cellString 
    });
    
    // Check if this is the high security cell (last cell)
    const cellNum = parseInt(digitsMatch[1], 10);
    const isHighSecurityCell = cellNum === cellLimit;
    const maxPerCell = isHighSecurityCell ? 2 : 5;
    
    if (currentCount >= maxPerCell) {
      const cellType = isHighSecurityCell ? 'High Security Cell' : 'Cell';
      return res.status(400).json({ 
        msg: `${cellType} ${cellString} is full in ${block.name}. Max ${maxPerCell} inmates per ${isHighSecurityCell ? 'high security cell' : 'cell'}. Currently ${currentCount} assigned.` 
      });
    }

    // Update prisoner with new cell and potentially new block
    const updateData = { cellNumber: cellString };
    if (blockId && blockId !== prisoner.currentBlock.toString()) {
      updateData.currentBlock = blockId;
    }

    const updated = await Prisoner.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('_id cellNumber currentBlock').populate('currentBlock', 'name');

    return res.json({ 
      success: true, 
      prisoner: updated, 
      msg: `Cell updated to ${cellString}${blockId ? ` in ${block.name}` : ''}` 
    });
  } catch (error) {
    console.error('Update inmate cell error:', error);
    return res.status(500).json({ msg: 'Server error', error: error.message });
  }
});


// Add new inmate
router.post('/inmates', requireWarden, async (req, res) => {
  try {
    const inmateData = {
      ...req.body,
      addedBy: req.user._id,
      status: 'active'
    };
    
    const newInmate = new Prisoner(inmateData);
    await newInmate.save();
    
    res.json({ 
      success: true, 
      inmate: newInmate, 
      msg: 'Inmate added successfully' 
    });
  } catch (error) {
    console.error('Add inmate error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// ===== STAFF MANAGEMENT =====

// Helper to generate next employeeId like S001, S002...
async function getNextStaffEmployeeId() {
  const prefix = 'S';
  const regex = new RegExp(`^${prefix}(\\d{3,})$`);
  // Find all staff employeeIds that match pattern and compute max
  const docs = await Details.find({ userRole: 'staff' })
    .select('roleSpecificDetails.staffDetails.employeeId createdAt')
    .lean();

  let maxNum = 0;
  for (const d of docs) {
    const id = d?.roleSpecificDetails?.staffDetails?.employeeId || '';
    const m = id.match(regex);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  const nextNum = maxNum + 1;
  return prefix + String(nextNum).padStart(3, '0');
}

// Add new staff
router.post('/staff', requireWarden, async (req, res) => {
  try {
    const { name, email, phone, position, department, shift } = req.body;
    
    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ msg: 'Email already exists' });
    }
    
    // Generate password
    const generatedPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase();

    // Generate next employeeId
    const employeeId = await getNextStaffEmployeeId();
    
    // Create basic user record
    const newUser = new User({
      name,
      email,
      password: generatedPassword,
      role: 'staff'
    });
    
    await newUser.save();
    
    // Create detailed record
    const staffDetails = new Details({
      userId: newUser._id,
      userRole: 'staff',
      userEmail: email,
      personalInfo: { fullName: name },
      contactInfo: { 
        primaryPhone: phone,
        email: email 
      },
      roleSpecificDetails: {
        staffDetails: {
          position,
          department,
          shift,
          employeeId,
          joiningDate: new Date()
        }
      },
      createdBy: req.user._id
    });
    
    await staffDetails.save();
    
    res.json({ 
      success: true, 
      staff: staffDetails,
      generatedPassword,
      msg: 'Staff member added successfully' 
    });
  } catch (error) {
    console.error('Add staff error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Helper function to get schedule count
async function getScheduleCount(date) {
  // No schedules tracked yet; return 0
  return 0;
}

// ===== REPORTS MANAGEMENT =====

// Get all reports
router.get('/reports', requireWarden, async (req, res) => {
  try {
    const reports = await Report.find()
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    
    res.json({ success: true, reports });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Submit weekly report
router.post('/reports/weekly', requireWarden, async (req, res) => {
  try {
    const reportData = {
      ...req.body,
      type: 'weekly',
      createdBy: req.user._id,
      status: 'submitted',
      submittedAt: new Date()
    };
    
    const newReport = new Report(reportData);
    await newReport.save();
    
    res.json({ 
      success: true, 
      report: newReport, 
      msg: 'Weekly report submitted successfully' 
    });
  } catch (error) {
    console.error('Submit report error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// ===== PROFILE MANAGEMENT =====

// Get warden profile
router.get('/profile', requireWarden, async (req, res) => {
  try {
    // Get warden details from Details collection
    const details = await Details.findOne({
      userId: req.user._id,
      userRole: 'warden'
    })
    .populate('createdBy', 'name email')
    .populate('verificationStatus.verifiedBy', 'name email');

    if (!details) {
      return res.status(404).json({ msg: 'Warden details not found' });
    }

    res.json({ success: true, details });
  } catch (error) {
    console.error('Get warden profile error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Change password
router.put('/change-password', requireWarden, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validate required fields
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ msg: 'Current password and new password are required' });
    }

    // Validate new password
    if (newPassword.length < 6) {
      return res.status(400).json({ msg: 'New password must be at least 6 characters long' });
    }

    if (!/(?=.*[a-zA-Z])/.test(newPassword)) {
      return res.status(400).json({ msg: 'New password must contain at least one letter' });
    }

    if (!/(?=.*\d)/.test(newPassword)) {
      return res.status(400).json({ msg: 'New password must contain at least one number' });
    }

    // Get current user from database
    let currentUser = null;

    // Check User collection first (for new wardens)
    currentUser = await User.findById(req.user._id);

    // User should be found in User collection

    if (!currentUser) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Verify current password
    const bcrypt = require('bcryptjs');
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, currentUser.password);

    if (!isCurrentPasswordValid) {
      return res.status(400).json({ msg: 'Current password is incorrect' });
    }

    // Update password (will be hashed automatically by User model pre-save middleware)
    currentUser.password = newPassword;
    await currentUser.save();

    console.log('✅ Password changed successfully for warden:', currentUser.email);

    res.json({
      success: true,
      msg: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// ===== STAFF MANAGEMENT =====

// Get prison blocks (for dropdown)
router.get('/blocks', requireWarden, async (req, res) => {
  try {
    const blocks = await PrisonBlock.find({ isActive: true })
      .select('name blockCode totalCapacity currentOccupancy cells')
    res.json({ success: true, blocks });
  } catch (error) {
    console.error('Get blocks error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Create new staff member
router.post('/create-staff', requireWarden, async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      employeeId,
      position,
      department,
      shift,
      experience,
      assignedBlock,
      joiningDate
    } = req.body;

    console.log('🔍 Creating new staff member:', { name, email, employeeId, position, department });

    // Validate required fields (employeeId is auto-generated)
    if (!name || !email || !phone || !position || !department || !experience || !assignedBlock) {
      return res.status(400).json({ msg: 'All required fields must be provided' });
    }

    // Basic email/phone/name validation
    const emailOk = /.+@.+\..+/.test(email || '');
    const nameOk = /^[A-Za-z\s]+$/.test(String(name || '').trim());
    const phoneDigits = String(phone || '').replace(/\D/g, '');
    if (!emailOk) return res.status(400).json({ msg: 'Invalid email address' });
    if (!nameOk) return res.status(400).json({ msg: 'Name should contain letters and spaces only' });
    if (phoneDigits.length !== 10) return res.status(400).json({ msg: 'Phone number must be exactly 10 digits' });
    if (!/^[6-9]/.test(phoneDigits)) return res.status(400).json({ msg: 'Phone number must start with 6-9' });

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ msg: 'Email already exists' });
    }

    // Generate staff employeeId like S001
    let newEmployeeId = employeeId;
    try {
      const last = await Details.find({ 'roleSpecificDetails.staffDetails.employeeId': /^S\d{3,}$/ })
        .select('roleSpecificDetails.staffDetails.employeeId')
        .sort({ 'roleSpecificDetails.staffDetails.employeeId': -1 })
        .limit(1);
      if (last && last.length > 0) {
        const match = String(last[0].roleSpecificDetails?.staffDetails?.employeeId || '').match(/S(\d+)/);
        const nextNum = match ? parseInt(match[1], 10) + 1 : 1;
        newEmployeeId = `S${String(nextNum).padStart(3, '0')}`;
      } else {
        newEmployeeId = 'S001';
      }
    } catch (e) {
      console.warn('Failed to compute next employeeId, defaulting to S001', e);
      newEmployeeId = 'S001';
    }

    // Generate secure password: 10 chars mixed
    const generatePassword = () => {
      const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const lower = 'abcdefghijklmnopqrstuvwxyz';
      const digits = '0123456789';
      const symbols = '@$!%*?&';
      const all = upper + lower + digits + symbols;
      let p = '';
      // Ensure at least one of each
      p += upper[Math.floor(Math.random() * upper.length)];
      p += lower[Math.floor(Math.random() * lower.length)];
      p += digits[Math.floor(Math.random() * digits.length)];
      p += symbols[Math.floor(Math.random() * symbols.length)];
      for (let i = 4; i < 10; i++) {
        p += all[Math.floor(Math.random() * all.length)];
      }
      return p;
    };

    const generatedPassword = generatePassword();
    console.log('🔑 Generated password for staff:', generatedPassword);

    // Create basic staff record in User collection
    const newStaff = new User({
      name,
      email,
      password: generatedPassword, // hashed by User pre-save hook
      role: 'staff',
      authProvider: 'local'
    });

    const savedStaff = await newStaff.save();
    console.log('✅ Staff user created in User collection:', savedStaff._id);

    // Create detailed staff record in Details collection
    const staffDetails = new Details({
      userId: savedStaff._id,
      userEmail: email,
      userRole: 'staff',
      personalInfo: { fullName: name },
      contactInfo: { primaryPhone: phone, email },
      roleSpecificDetails: {
        staffDetails: {
          employeeId: newEmployeeId,
          position,
          department,
          shift: (shift || 'day').toLowerCase(),
          experience,
          assignedBlock,
          joiningDate: joiningDate || new Date()
        }
      },
      verificationStatus: {
        isVerified: true,
        verifiedBy: req.user._id,
        verificationDate: new Date(),
        verificationNotes: 'Created by warden'
      },
      createdBy: req.user._id,
      lastModifiedBy: req.user._id
    });

    const savedDetails = await staffDetails.save();
    console.log('✅ Staff details created in Details collection:', savedDetails._id);

    // Send email with credentials
    console.log('📧 Sending staff welcome email to:', email);
    const emailResult = await sendStaffWelcomeEmail({
      name,
      email,
      phone,
      position,
      department,
      assignedBlock
    }, generatedPassword);

    if (emailResult.success) {
      console.log('✅ Staff welcome email sent successfully');
    } else {
      console.log('⚠ Failed to send staff welcome email:', emailResult.message);
    }

    res.json({
      success: true,
      msg: 'Staff member created successfully',
      staff: {
        id: savedStaff._id,
        name,
        email,
        employeeId: newEmployeeId,
        position,
        department,
        generatedPassword
      }
    });

  } catch (error) {
    console.error('Create staff error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Get all staff members
router.get('/staff', requireWarden, async (req, res) => {
  try {
    console.log('🔍 GET /staff endpoint called by warden');

    // Get all staff from Details collection
    const staffList = await Details.find({ userRole: 'staff' })
      .populate('userId', 'name email')
      .populate('createdBy', 'name email')
      .populate('roleSpecificDetails.staffDetails.assignedBlock', 'name blockCode')
      .sort({ createdAt: -1 });

    console.log(`📋 Found ${staffList.length} staff members in Details collection`);

    // Also get staff from User collection to ensure we have all staff
    const staffUsers = await User.find({ role: 'staff' })
      .select('-password')
      .sort({ createdAt: -1 });

    console.log(`👥 Found ${staffUsers.length} staff users in User collection`);

    // Combine data from both collections
    const formattedStaff = [];

    // Process staff from User collection first
    for (const staffUser of staffUsers) {
      // Find corresponding details
      const details = staffList.find(d => d.userId && d.userId._id.toString() === staffUser._id.toString());

      console.log(`👤 Processing staff user: ${staffUser.name}`);
      console.log(`📄 Found details: ${details ? 'Yes' : 'No'}`);

      if (details) {
        console.log(`📋 Details keys:`, Object.keys(details.toObject()));
        console.log(`📋 roleSpecificDetails:`, details.roleSpecificDetails);
      }

      // Try to read staff-specific details if present
      const staffDetailsData = details?.roleSpecificDetails?.staffDetails || {};

      formattedStaff.push({
        id: staffUser._id,
        userId: staffUser._id,
        name: details?.personalInfo?.fullName || staffUser.name || 'Unknown',
        email: staffUser.email || details?.userEmail || 'No email',
        phone: details?.contactInfo?.primaryPhone || 'No phone',
        employeeId: (staffDetailsData.employeeId) || `S${staffUser._id.toString().slice(-3)}`,
        position: staffDetailsData.position || 'Staff Member',
        department: staffDetailsData.department || 'General',
        shift: (staffDetailsData.shift || 'day'),
        experience: staffDetailsData.experience || 'N/A',
    assignedBlock: staffDetailsData.assignedBlock || null,
        joiningDate: staffDetailsData.joiningDate || staffUser.createdAt,
        status: 'Active',
        createdAt: staffUser.createdAt,
        createdBy: details?.createdBy?.name || 'System'
      });
    }

    console.log(`✅ Returning ${formattedStaff.length} formatted staff members`);

    res.json({
      success: true,
      staff: formattedStaff,
      count: formattedStaff.length
    });

  } catch (error) {
    console.error('Get staff error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Update staff member (targeted updates to avoid casting issues)
router.put('/staff/:id', requireWarden, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      email,
      phone,
      position,
      department,
      shift,
      experience,
      assignedBlock
    } = req.body;

    // Update User basic info
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ msg: 'Staff user not found' });
    }

    // Ensure email is unique if changed
    if (email && email !== user.email) {
      const exists = await User.findOne({ email });
      if (exists && exists._id.toString() !== id) {
        return res.status(400).json({ msg: 'Email already in use by another user' });
      }
      user.email = email;
    }
    if (name) user.name = name;
    await user.save();

    // Targeted field updates for Details to avoid overwriting nested docs
    const detailsDoc = await Details.findOne({ userId: id, userRole: 'staff' });
    if (detailsDoc) {
      const setUpdate = { updatedBy: req.user._id };
      if (email != null) setUpdate['userEmail'] = email;
      if (name != null) setUpdate['personalInfo.fullName'] = name;
      if (phone != null) setUpdate['contactInfo.primaryPhone'] = phone;
      if (position != null) setUpdate['roleSpecificDetails.staffDetails.position'] = position;
      if (department != null) setUpdate['roleSpecificDetails.staffDetails.department'] = department;
      if (shift != null) setUpdate['roleSpecificDetails.staffDetails.shift'] = String(shift).toLowerCase();
      if (experience != null) setUpdate['roleSpecificDetails.staffDetails.experience'] = experience;
      if (assignedBlock != null && assignedBlock !== '') setUpdate['roleSpecificDetails.staffDetails.assignedBlock'] = assignedBlock;

      // Use findOneAndUpdate with strict:false and omitUndefined to avoid casting errors on other nested paths
      await Details.findOneAndUpdate(
        { _id: detailsDoc._id },
        { $set: setUpdate },
        { runValidators: false, new: true, strict: false, omitUndefined: true }
      );
    }

    return res.json({ success: true, msg: 'Staff updated successfully' });
  } catch (error) {
    console.error('Update staff error:', error);
    return res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Delete staff member
router.delete('/staff/:id', requireWarden, async (req, res) => {
  try {
    const { id } = req.params;

    // Remove user
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ msg: 'Staff user not found' });
    }

    await User.deleteOne({ _id: id });
    await Details.deleteOne({ userId: id, userRole: 'staff' });

    return res.json({ success: true, msg: 'Staff deleted successfully' });
  } catch (error) {
    console.error('Delete staff error:', error);
    return res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Test endpoint to check database content
router.get('/test-db', async (req, res) => {
  try {
    console.log('🧪 Testing database content...');

    const users = await User.find({ role: 'staff' }).select('-password');
    const details = await Details.find({ userRole: 'staff' });

    console.log('👥 Staff users:', users.length);
    console.log('📋 Staff details:', details.length);

    res.json({
      success: true,
      users: users,
      details: details,
      userCount: users.length,
      detailsCount: details.length
    });
  } catch (error) {
    console.error('Test DB error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== LEAVE REQUESTS MANAGEMENT =====

// Get all staff leave requests for warden review
router.get('/leave-requests', requireWarden, async (req, res) => {
  try {
    console.log('📋 GET /leave-requests called by warden');

    const leaveRequests = await LeaveRequest.find({})
      .populate('staffId', 'name email')
      .populate('approvedBy', 'name email')
      .sort({ createdAt: -1 });

    console.log(`📋 Found ${leaveRequests.length} leave requests for warden review`);

    // Format the data for frontend
    const formattedRequests = leaveRequests.map(request => ({
      id: request._id,
      requestId: request.requestId,
      staffName: request.staffId?.name || 'Unknown Staff',
      staffEmail: request.staffId?.email || 'No email',
      leaveType: request.leaveType,
      startDate: request.startDate.toISOString().split('T')[0],
      endDate: request.endDate.toISOString().split('T')[0],
      totalDays: request.totalDays,
      reason: request.reason,
      emergencyContact: request.emergencyContact,
      coverageArrangement: request.coverageArrangement,
      additionalNotes: request.additionalNotes,
      status: request.status,
      submittedDate: request.submittedDate.toISOString().split('T')[0],
      approvedBy: request.approvedBy?.name || null,
      approvedDate: request.approvedDate ? request.approvedDate.toISOString().split('T')[0] : null,
      comments: request.comments
    }));

    res.json({
      success: true,
      requests: formattedRequests,
      count: formattedRequests.length
    });
  } catch (error) {
    console.error('Get leave requests error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Approve leave request
router.put('/leave-requests/:requestId/approve', requireWarden, async (req, res) => {
  try {
    console.log('✅ Approving leave request:', req.params.requestId);

    const { comments } = req.body;

    const leaveRequest = await LeaveRequest.findById(req.params.requestId);

    if (!leaveRequest) {
      return res.status(404).json({ msg: 'Leave request not found' });
    }

    leaveRequest.status = 'Approved';
    leaveRequest.approvedBy = req.user._id;
    leaveRequest.approvedDate = new Date();
    leaveRequest.comments = comments || 'Approved by warden';

    await leaveRequest.save();

    console.log('✅ Leave request approved successfully');

    // Send email to staff notifying decision
    try {
      const staffUser = await User.findById(leaveRequest.staffId).select('name email');
      const { sendLeaveDecisionEmail } = require('../services/staffEmailService');
      await sendLeaveDecisionEmail(staffUser, leaveRequest.toObject(), 'approved');
    } catch (e) {
      console.warn('Email send failed for leave approval:', e?.message);
    }

    res.json({
      success: true,
      message: 'Leave request approved successfully',
      request: leaveRequest
    });
  } catch (error) {
    console.error('Approve leave request error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Reject leave request
router.put('/leave-requests/:requestId/reject', requireWarden, async (req, res) => {
  try {
    console.log('❌ Rejecting leave request:', req.params.requestId);

    const { comments } = req.body;

    const leaveRequest = await LeaveRequest.findById(req.params.requestId);

    if (!leaveRequest) {
      return res.status(404).json({ msg: 'Leave request not found' });
    }

    leaveRequest.status = 'Rejected';
    leaveRequest.approvedBy = req.user._id;
    leaveRequest.approvedDate = new Date();
    leaveRequest.comments = comments || 'Rejected by warden';

    await leaveRequest.save();

    console.log('❌ Leave request rejected successfully');

    // Send email to staff notifying decision
    try {
      const staffUser = await User.findById(leaveRequest.staffId).select('name email');
      const { sendLeaveDecisionEmail } = require('../services/staffEmailService');
      await sendLeaveDecisionEmail(staffUser, leaveRequest.toObject(), 'rejected');
    } catch (e) {
      console.warn('Email send failed for leave rejection:', e?.message);
    }

    res.json({
      success: true,
      message: 'Leave request rejected successfully',
      request: leaveRequest
    });
  } catch (error) {
    console.error('Reject leave request error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// ===== INMATES MANAGEMENT =====

// Add new prisoner with photo upload
router.post('/prisoners', requireWarden, uploadPrisonerFiles, handleUploadError, async (req, res) => {
  try {
    console.log('📝 POST /prisoners called by warden');
    console.log('📝 Request data:', req.body);
    console.log('📝 Uploaded files:', req.files);

    const {
      firstName,
      lastName,
      middleName,
      dateOfBirth,
      gender,
      nationality,
      height,
      weight,
      eyeColor,
      hairColor,
      distinguishingMarks,
      address,
      emergencyContactName,
      emergencyContactRelationship,
      emergencyContactPhone,
      emergencyContactAddress,
      charges,
      sentenceType,
      sentenceLength,
      startDate,
      expectedReleaseDate,
      blockAssignment,
      cellNumber,
      medicalConditions,
      allergies,
      behaviorLevel,
      notes
    } = req.body;

    // Generate prisoner number
    const prisonerCount = await Prisoner.countDocuments();
    const prisonerNumber = `P${String(prisonerCount + 1).padStart(6, '0')}`;

    // Handle photo upload
    let photographPath = null;
    if (req.files && req.files.photograph && req.files.photograph[0]) {
      photographPath = `/uploads/prisoner-photos/${req.files.photograph[0].filename}`;
    }

    const prisoner = new Prisoner({
      prisonerNumber,
      firstName,
      lastName,
      middleName,
      dateOfBirth: new Date(dateOfBirth),
      gender,
      nationality: nationality || 'Indian',
      height: height ? parseInt(height) : undefined,
      weight: weight ? parseInt(weight) : undefined,
      eyeColor,
      hairColor,
      distinguishingMarks: distinguishingMarks ? distinguishingMarks.split(',').map(mark => mark.trim()) : [],
      photograph: photographPath,
      address: {
        street: address,
        city: req.body.city,
        state: req.body.state,
        pincode: req.body.pincode,
        country: req.body.country || 'India'
      },
      emergencyContact: {
        name: emergencyContactName,
        relationship: emergencyContactRelationship,
        phone: emergencyContactPhone,
        address: emergencyContactAddress
      },
      charges: charges ? (typeof charges === 'string' ?
        (charges.startsWith('[') ? JSON.parse(charges) :
         charges.split(',').map(charge => ({ charge: charge.trim(), severity: 'minor' }))) :
        charges) : [],
      sentenceDetails: {
        sentenceType,
        sentenceLength: sentenceLength ? parseInt(sentenceLength) : undefined,
        startDate: startDate ? new Date(startDate) : new Date(),
        expectedReleaseDate: expectedReleaseDate ? new Date(expectedReleaseDate) : undefined
      },
      currentLocation: {
        block: blockAssignment,
        cell: cellNumber,
        facility: 'Main Prison'
      },
      medicalInfo: {
        conditions: medicalConditions ? medicalConditions.split(',').map(condition => condition.trim()) : [],
        allergies: allergies ? allergies.split(',').map(allergy => allergy.trim()) : [],
        medications: []
      },
      behaviorRecord: {
        currentLevel: behaviorLevel || 'medium',
        totalIncidents: 0,
        lastIncidentDate: null
      },
      notes,
      status: 'active',
      admissionDate: new Date(),
      createdBy: req.user._id
    });

    await prisoner.save();

    console.log('✅ Prisoner added successfully:', prisonerNumber);

    res.json({
      success: true,
      message: 'Prisoner added successfully',
      prisoner: {
        id: prisoner._id,
        prisonerNumber: prisoner.prisonerNumber,
        name: `${prisoner.firstName} ${prisoner.lastName}`,
        photograph: prisoner.photograph
      }
    });
  } catch (error) {
    console.error('❌ Add prisoner error:', error);
    console.error('❌ Error details:', {
      message: error.message,
      stack: error.stack,
      body: req.body,
      files: req.files
    });
    res.status(500).json({
      success: false,
      msg: 'Server error while adding prisoner',
      error: error.message
    });
  }
});

// Get all prisoners
router.get('/prisoners', requireWarden, async (req, res) => {
  try {
    console.log('📋 GET /prisoners called by warden');

    const prisoners = await Prisoner.find({})
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    console.log(`📋 Found ${prisoners.length} prisoners`);

    // Format the response
    const formattedPrisoners = prisoners.map(prisoner => ({
      id: prisoner._id,
      prisonerNumber: prisoner.prisonerNumber,
      name: `${prisoner.firstName} ${prisoner.lastName}`,
      firstName: prisoner.firstName,
      lastName: prisoner.lastName,
      dateOfBirth: prisoner.dateOfBirth,
      gender: prisoner.gender,
      photograph: prisoner.photograph,
      currentLocation: prisoner.currentLocation,
      status: prisoner.status,
      admissionDate: prisoner.admissionDate,
      sentenceDetails: prisoner.sentenceDetails,
      behaviorRecord: prisoner.behaviorRecord,
      charges: prisoner.charges
    }));

    res.json({
      success: true,
      prisoners: formattedPrisoners,
      count: formattedPrisoners.length
    });
  } catch (error) {
    console.error('Get prisoners error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Get single prisoner details
router.get('/prisoners/:id', requireWarden, async (req, res) => {
  try {
    console.log('📋 GET /prisoners/:id called by warden');

    const prisoner = await Prisoner.findById(req.params.id)
      .populate('createdBy', 'name email');

    if (!prisoner) {
      return res.status(404).json({ msg: 'Prisoner not found' });
    }

    res.json({
      success: true,
      prisoner: prisoner
    });
  } catch (error) {
    console.error('Get prisoner error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// ===== SCHEDULE MANAGEMENT =====

// Get all schedules
router.get('/schedules', requireWarden, async (req, res) => {
  try {
    const { date, location, type, status } = req.query;
    const filter = {};
    
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      filter.date = { $gte: startDate, $lt: endDate };
    }
    
    if (location) filter.location = location;
    if (type) filter.type = type;
    if (status) filter.status = status;
    
    const schedules = await Schedule.find(filter)
      .populate('assignedStaff', 'name email role')
      .populate('createdBy', 'name email')
      .sort({ date: 1, startTime: 1 });
    
    res.json({ success: true, schedules });
  } catch (error) {
    console.error('Get schedules error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Get schedule by ID
router.get('/schedules/:id', requireWarden, async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id)
      .populate('assignedStaff', 'name email role')
      .populate('createdBy', 'name email');
    
    if (!schedule) {
      return res.status(404).json({ msg: 'Schedule not found' });
    }
    
    res.json({ success: true, schedule });
  } catch (error) {
    console.error('Get schedule error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Create new schedule
router.post('/schedules', requireWarden, async (req, res) => {
  try {
    // Validate that at least one staff member is assigned
    if (!req.body.assignedStaff || req.body.assignedStaff.length === 0) {
      return res.status(400).json({ msg: 'At least one staff member must be assigned to the schedule' });
    }

    const scheduleData = {
      ...req.body,
      createdBy: req.user.id
    };
    
    const schedule = new Schedule(scheduleData);
    await schedule.save();
    
    await schedule.populate('assignedStaff', 'name email role');
    await schedule.populate('createdBy', 'name email');
    
    res.status(201).json({ success: true, schedule });
  } catch (error) {
    console.error('Create schedule error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Update schedule
router.put('/schedules/:id', requireWarden, async (req, res) => {
  try {
    // Validate that at least one staff member is assigned
    if (!req.body.assignedStaff || req.body.assignedStaff.length === 0) {
      return res.status(400).json({ msg: 'At least one staff member must be assigned to the schedule' });
    }

    const schedule = await Schedule.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
    .populate('assignedStaff', 'name email role')
    .populate('createdBy', 'name email');
    
    if (!schedule) {
      return res.status(404).json({ msg: 'Schedule not found' });
    }
    
    res.json({ success: true, schedule });
  } catch (error) {
    console.error('Update schedule error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Delete schedule
router.delete('/schedules/:id', requireWarden, async (req, res) => {
  try {
    const schedule = await Schedule.findByIdAndDelete(req.params.id);
    
    if (!schedule) {
      return res.status(404).json({ msg: 'Schedule not found' });
    }
    
    res.json({ success: true, msg: 'Schedule deleted successfully' });
  } catch (error) {
    console.error('Delete schedule error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Send email notifications for schedule updates
router.post('/schedules/:id/notify', requireWarden, async (req, res) => {
  try {
    console.log('📧 Email notification endpoint called for schedule:', req.params.id);
    const { sendScheduleUpdateEmail } = require('../services/staffEmailService');
    const User = require('../models/User');
    
    const schedule = await Schedule.findById(req.params.id).populate('assignedStaff', 'name email role');
    console.log('📧 Found schedule:', schedule ? 'Yes' : 'No');
    console.log('📧 Assigned staff count:', schedule?.assignedStaff?.length || 0);
    
    if (!schedule) {
      console.log('📧 Schedule not found');
      return res.status(404).json({ msg: 'Schedule not found' });
    }
    
    if (!schedule.assignedStaff || schedule.assignedStaff.length === 0) {
      console.log('📧 No staff assigned to schedule');
      return res.status(400).json({ msg: 'No staff assigned to this schedule' });
    }
    
    // Send email to each assigned staff member
    const emailResults = [];
    for (const staff of schedule.assignedStaff) {
      try {
        console.log(`📧 Sending email to ${staff.name} (${staff.email})`);
        const emailResult = await sendScheduleUpdateEmail(staff, schedule);
        console.log(`📧 Email result for ${staff.name}:`, emailResult);
        emailResults.push({
          staffId: staff._id,
          staffName: staff.name,
          staffEmail: staff.email,
          success: emailResult.success,
          message: emailResult.message
        });
      } catch (emailError) {
        console.error(`📧 Failed to send email to ${staff.email}:`, emailError);
        emailResults.push({
          staffId: staff._id,
          staffName: staff.name,
          staffEmail: staff.email,
          success: false,
          message: 'Failed to send email',
          error: emailError.message
        });
      }
    }
    
    const successCount = emailResults.filter(result => result.success).length;
    const totalCount = emailResults.length;
    
    res.json({
      success: true,
      msg: `Email notifications sent to ${successCount} out of ${totalCount} staff members`,
      results: emailResults
    });
    
  } catch (error) {
    console.error('Schedule notification error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Get all staff (removed duplicate route that was mixing staff and wardens)

// Get available staff for assignment
router.get('/staff/available', requireWarden, async (req, res) => {
  try {
    const { date, startTime, endTime, blockId, location } = req.query;

    if (!date || !startTime || !endTime) {
      return res.status(400).json({ msg: 'Date, startTime, and endTime are required' });
    }

    // Find staff who are not assigned to overlapping schedules
    // Normalize day window to avoid timezone equality issues
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const overlappingSchedules = await Schedule.find({
      date: { $gte: dayStart, $lt: dayEnd },
      $or: [
        {
          startTime: { $lt: endTime },
          endTime: { $gt: startTime }
        }
      ]
    }).select('assignedStaff');

    // Start with busy-by-time list
    const busyStaffIds = overlappingSchedules.flatMap(s => s.assignedStaff);

    // Additional guard: if a location is provided, exclude anyone already
    // assigned to that base location (e.g., "Medical Room") for the same date
    // regardless of time or shift. This prevents double allocation like
    // assigning the same person twice to Medical Room in day and night.
    try {
      if (location) {
        // Normalize to base location label used in Schedule documents
        const raw = String(location).trim();
        let baseLocation = raw
          .replace(/^Central Facility\s*-\s*/i, '')
          .replace(/^Block\s*[AB]\s*-\s*/i, '')
          .trim();
        // Only consider known central locations we store without prefix
        const known = new Set([
          'Main Gate', 'Control Room', 'Medical Room', 'Kitchen', 'Visitor Area',
          'Admin Office', 'Workshop', 'Isolation', 'Staff Room',
          'Block A - Cells', 'Block A - Dining Room', 'Block B - Cells', 'Block B - Dining Room'
        ]);
        if (!known.has(baseLocation)) {
          // Fallback: try exact match of the provided location as-is
          baseLocation = raw;
        }

        const sameLocationSchedules = await Schedule.find({
          date: { $gte: dayStart, $lt: dayEnd },
          location: baseLocation
        }).select('assignedStaff');

        const sameLocIds = sameLocationSchedules.flatMap(s => s.assignedStaff);
        if (sameLocIds.length > 0) {
          busyStaffIds.push(...sameLocIds);
        }
      }
    } catch (e) {
      console.warn('Location-based exclusion failed in staff/available:', e?.message || e);
    }
    
    // Determine filtering strategy based on location rules
    const CENTRAL_LOCATIONS = new Set([
      'CONTROL ROOM', 'MEDICAL ROOM', 'VISITOR AREA', 'KITCHEN', 'ADMIN OFFICE', 'WORKSHOP', 'ISOLATION'
    ]);

    const normalizedLocation = String(location || '').trim().toUpperCase();

    // Attempt to resolve explicit Block from query or from location string like "Block A - Cells"
    let resolvedBlockId = blockId;
    let filterToBlocks = null; // array of block ObjectIds to include (A/B for central)

    try {
      if (!resolvedBlockId && location) {
        const match = String(location).match(/Block\s+([A-Za-z]+)/i);
        if (match && match[1]) {
          const code = String(match[1]).trim().toUpperCase();
          const blockDoc = await PrisonBlock.findOne({
            $or: [
              { blockCode: code },
              { name: new RegExp(`^Block\\s+${code}`, 'i') }
            ]
          }).select('_id');
          if (blockDoc) {
            resolvedBlockId = blockDoc._id.toString();
          }
        }
      }

      // Central facilities: allow staff from Block A and Block B only
      if (normalizedLocation && CENTRAL_LOCATIONS.has(normalizedLocation)) {
        const blocksAB = await PrisonBlock.find({ blockCode: { $in: ['A', 'B'] } }).select('_id blockCode');
        filterToBlocks = blocksAB.map(b => b._id);
      }
    } catch (e) {
      console.warn('Block resolution error in staff/available:', e?.message || e);
    }

    // Build the base user query: only staff (exclude wardens), not busy
    const userQuery = { role: 'staff', _id: { $nin: busyStaffIds } };

    // Build optional userId inclusion by looking up Details based on rules
    let allowedUserIds = null;

    if (resolvedBlockId) {
      // Block A or Block B specific locations
      const staffDetails = await Details.find({
        userRole: 'staff',
        'roleSpecificDetails.staffDetails.assignedBlock': resolvedBlockId
      }).select('userId');
      allowedUserIds = staffDetails.map(d => d.userId);
    } else if (Array.isArray(filterToBlocks) && filterToBlocks.length > 0) {
      // Central facilities: only staff assigned to A or B
      const staffDetails = await Details.find({
        userRole: 'staff',
        'roleSpecificDetails.staffDetails.assignedBlock': { $in: filterToBlocks }
      }).select('userId');
      allowedUserIds = staffDetails.map(d => d.userId);
    }

    if (Array.isArray(allowedUserIds)) {
      if (allowedUserIds.length === 0) {
        return res.json({ success: true, staff: [] });
      }
      userQuery._id = { $nin: busyStaffIds, $in: allowedUserIds };
    }

    const availableStaff = await User.find(userQuery).select('name email role');

    return res.json({ success: true, staff: availableStaff });
  } catch (error) {
    console.error('Get available staff error:', error);
    return res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Get available staff grouped by block (show free staff for all blocks)
router.get('/staff/available-by-block', requireWarden, async (req, res) => {
  try {
    const { date, startTime, endTime } = req.query;

    if (!date || !startTime || !endTime) {
      return res.status(400).json({ msg: 'Date, startTime, and endTime are required' });
    }

    // Normalize requested day
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    // Find busy staff (those with overlapping schedules in the window)
    const overlappingSchedules = await Schedule.find({
      date: { $gte: dayStart, $lt: dayEnd },
      $or: [
        {
          startTime: { $lt: endTime },
          endTime: { $gt: startTime }
        }
      ]
    }).select('assignedStaff');

    const busySet = new Set(overlappingSchedules.flatMap(s => s.assignedStaff.map(id => String(id))));

    // Get all active blocks
    const blocks = await PrisonBlock.find({ isActive: true }).select('_id name blockCode');

    const results = [];

    for (const block of blocks) {
      // Staff assigned to this block
      const staffDetails = await Details.find({
        userRole: 'staff',
        'roleSpecificDetails.staffDetails.assignedBlock': block._id
      }).select('userId');

      const staffIdsForBlock = staffDetails.map(d => String(d.userId));

      if (staffIdsForBlock.length === 0) {
        results.push({ blockId: block._id, blockName: block.name, blockCode: block.blockCode, staff: [] });
        continue;
      }

      // Exclude busy staff
      const freeStaffIds = staffIdsForBlock.filter(id => !busySet.has(id));

      if (freeStaffIds.length === 0) {
        results.push({ blockId: block._id, blockName: block.name, blockCode: block.blockCode, staff: [] });
        continue;
      }

      const freeStaff = await User.find({
        role: 'staff',
        _id: { $in: freeStaffIds }
      }).select('name email role');

      results.push({
        blockId: block._id,
        blockName: block.name,
        blockCode: block.blockCode,
        staff: freeStaff
      });
    }

    return res.json({ success: true, blocks: results });
  } catch (error) {
    console.error('Get available staff by block error:', error);
    return res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Get schedule statistics
router.get('/schedules/stats', requireWarden, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const [
      totalSchedules,
      todaySchedules,
      inProgressSchedules,
      completedSchedules,
      highPrioritySchedules
    ] = await Promise.all([
      Schedule.countDocuments(),
      Schedule.countDocuments({ date: { $gte: today, $lt: tomorrow } }),
      Schedule.countDocuments({ status: 'In Progress' }),
      Schedule.countDocuments({ status: 'Completed' }),
      Schedule.countDocuments({ priority: 'High' })
    ]);
    
    res.json({
      success: true,
      stats: {
        totalSchedules,
        todaySchedules,
        inProgressSchedules,
        completedSchedules,
        highPrioritySchedules
      }
    });
  } catch (error) {
    console.error('Get schedule stats error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Auto-schedule endpoints
// Generate AI-based auto-schedule for a specific date and shift
router.post('/auto-schedule/generate', requireWarden, async (req, res) => {
  try {
    const { date, shift } = req.body;

    if (!date || !shift) {
      return res.status(400).json({ msg: 'Date and shift are required' });
    }

    if (!['day', 'night'].includes(shift)) {
      return res.status(400).json({ msg: 'Shift must be either "day" or "night"' });
    }

    // Get the current user (warden) for createdBy field
    const currentUser = req.user;

    // Generate only the requested shift
    const schedules = await autoScheduleService.generateAutoSchedule(date, shift, currentUser._id);

    // Add AI optimization metadata
    const result = {
      success: true,
      schedules: schedules,
      count: schedules.length,
      optimization: {
        totalStaff: schedules.reduce((total, s) => total + (s.assignedStaff?.length || 0), 0),
        locationsCovered: schedules.length,
        fairnessScore: 0.85, // Placeholder
        efficiencyScore: 92 // Placeholder
      }
    };

    res.json({
      msg: `AI schedule generated successfully for ${shift} shift`,
      schedules: result.schedules,
      count: result.count,
      optimization: result.optimization
    });

  } catch (error) {
    console.error('AI schedule generation error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Generate legacy auto-schedule (fallback)
router.post('/auto-schedule/generate-legacy', requireWarden, async (req, res) => {
  try {
    const { date, shift } = req.body;

    if (!date || !shift) {
      return res.status(400).json({ msg: 'Date and shift are required' });
    }

    if (!['day', 'night'].includes(shift)) {
      return res.status(400).json({ msg: 'Shift must be either "day" or "night"' });
    }

    // Get the current user (warden) for createdBy field
    const currentUser = req.user;
    
    // Generate legacy auto-schedule
    const schedules = await autoScheduleService.generateAutoSchedule(date, shift, currentUser._id);

    res.json({
      msg: `Legacy auto-schedule generated successfully for ${shift} shift`,
      schedules: schedules,
      count: schedules.length
    });

  } catch (error) {
    console.error('Legacy auto-schedule generation error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Get available staff for Block A and Block B (excluding already scheduled)
router.get('/staff/available/blocks', requireWarden, async (req, res) => {
  try {
    const { date, shift, blockType } = req.query;

    if (!date || !shift || !blockType) {
      return res.status(400).json({ msg: 'Date, shift, and blockType are required' });
    }

    if (!['day', 'night'].includes(shift)) {
      return res.status(400).json({ msg: 'Shift must be either "day" or "night"' });
    }

    if (!['A', 'B'].includes(blockType)) {
      return res.status(400).json({ msg: 'Block type must be either "A" or "B"' });
    }

    const availableStaff = await autoScheduleService.getAvailableStaffForBlocks(date, shift, blockType);

    res.json({
      msg: `Available staff for Block ${blockType}`,
      staff: availableStaff,
      count: availableStaff.length
    });

  } catch (error) {
    console.error('Get available staff for blocks error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Get all available staff for Central Facility
router.get('/staff/available/central', requireWarden, async (req, res) => {
  try {
    const { date, shift } = req.query;

    if (!date || !shift) {
      return res.status(400).json({ msg: 'Date and shift are required' });
    }

    if (!['day', 'night'].includes(shift)) {
      return res.status(400).json({ msg: 'Shift must be either "day" or "night"' });
    }

    const availableStaff = await autoScheduleService.getAvailableStaffForCentralFacility(date, shift);

    res.json({
      msg: 'Available staff for Central Facility',
      staff: availableStaff,
      count: availableStaff.length
    });

  } catch (error) {
    console.error('Get available staff for central facility error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Delete auto-scheduled items for a specific date and shift
router.delete('/auto-schedule/clear', requireWarden, async (req, res) => {
  try {
    const { date, shift } = req.body;

    if (!date || !shift) {
      return res.status(400).json({ msg: 'Date and shift are required' });
    }

    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const deletedSchedules = await Schedule.deleteMany({
      date: { $gte: dayStart, $lt: dayEnd },
      shift: shift,
      isAutoScheduled: true
    });

    res.json({
      msg: `Cleared auto-scheduled items for ${shift} shift`,
      deletedCount: deletedSchedules.deletedCount
    });

  } catch (error) {
    console.error('Clear auto-schedule error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Get AI scheduling recommendations and optimization insights
router.get('/ai-schedule/insights', requireWarden, async (req, res) => {
  try {
    const { date, shift } = req.query;
    
    if (!date || !shift) {
      return res.status(400).json({ msg: 'Date and shift are required' });
    }

    // Get current schedules for the date and shift
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const currentSchedules = await Schedule.find({
      date: { $gte: dayStart, $lt: dayEnd },
      shift: shift
    }).populate('assignedStaff', 'name email');

    // Get all available staff using existing service
    const allStaff = await autoScheduleService.getAvailableStaff(date, shift);
    
    // Calculate basic metrics
    const totalStaffAssigned = currentSchedules.reduce((total, s) => total + (s.assignedStaff?.length || 0), 0);
    const fairnessScore = 0.85; // Placeholder
    const efficiencyScore = totalStaffAssigned > 0 ? Math.min(100, (totalStaffAssigned / allStaff.length) * 100) : 0;
    
    // Basic recommendations
    const recommendations = [];
    if (currentSchedules.length === 0) {
      recommendations.push({
        type: 'no_schedules',
        message: 'No schedules found for this date and shift',
        suggestion: 'Generate AI schedule to create optimal assignments'
      });
    }

    res.json({
      success: true,
      insights: {
        currentSchedules: currentSchedules.length,
        totalAvailableStaff: allStaff.length,
        staffDistribution: {
          medical: allStaff.filter(s => s.staffDetails?.department?.toLowerCase().includes('medical')).length,
          control: allStaff.filter(s => s.staffDetails?.department?.toLowerCase().includes('control')).length,
          administration: allStaff.filter(s => s.staffDetails?.department?.toLowerCase().includes('admin')).length,
          security: allStaff.filter(s => s.staffDetails?.department?.toLowerCase().includes('security')).length,
          general: allStaff.filter(s => !s.staffDetails?.department || s.staffDetails?.department === 'general').length
        },
        optimization: {
          fairnessScore,
          efficiencyScore
        },
        recommendations
      }
    });

  } catch (error) {
    console.error('Get AI insights error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Get staff workload analysis
router.get('/ai-schedule/workload-analysis', requireWarden, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ msg: 'Start date and end date are required' });
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Get all schedules in the date range
    const schedules = await Schedule.find({
      date: { $gte: start, $lte: end }
    }).populate('assignedStaff', 'name email');

    // Calculate workload for each staff member
    const staffWorkload = new Map();
    
    schedules.forEach(schedule => {
      schedule.assignedStaff.forEach(staff => {
        const staffId = staff._id.toString();
        if (!staffWorkload.has(staffId)) {
          staffWorkload.set(staffId, {
            staff: staff,
            totalShifts: 0,
            dayShifts: 0,
            nightShifts: 0,
            locations: new Set()
          });
        }
        
        const workload = staffWorkload.get(staffId);
        workload.totalShifts++;
        if (schedule.shift === 'day') {
          workload.dayShifts++;
        } else {
          workload.nightShifts++;
        }
        workload.locations.add(schedule.location);
      });
    });

    // Convert to array and sort by total shifts
    const workloadArray = Array.from(staffWorkload.values()).map(item => ({
      ...item,
      locations: Array.from(item.locations)
    })).sort((a, b) => b.totalShifts - a.totalShifts);

    // Calculate statistics
    const totalStaff = workloadArray.length;
    const avgShifts = totalStaff > 0 ? workloadArray.reduce((sum, item) => sum + item.totalShifts, 0) / totalStaff : 0;
    const maxShifts = totalStaff > 0 ? Math.max(...workloadArray.map(item => item.totalShifts)) : 0;
    const minShifts = totalStaff > 0 ? Math.min(...workloadArray.map(item => item.totalShifts)) : 0;

    res.json({
      success: true,
      analysis: {
        period: { startDate, endDate },
        summary: {
          totalStaff,
          avgShifts: Math.round(avgShifts * 100) / 100,
          maxShifts,
          minShifts,
          workloadVariance: maxShifts - minShifts
        },
        staffWorkload: workloadArray,
        recommendations: this.generateWorkloadRecommendations(workloadArray, avgShifts)
      }
    });

  } catch (error) {
    console.error('Workload analysis error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Helper function to generate workload recommendations
function generateWorkloadRecommendations(workloadArray, avgShifts) {
  const recommendations = [];
  
  // Find overworked staff (more than 20% above average)
  const overworkedThreshold = avgShifts * 1.2;
  const overworkedStaff = workloadArray.filter(item => item.totalShifts > overworkedThreshold);
  
  if (overworkedStaff.length > 0) {
    recommendations.push({
      type: 'overworked',
      message: `${overworkedStaff.length} staff members are overworked (${overworkedStaff.map(s => s.staff.name).join(', ')})`,
      suggestion: 'Consider redistributing shifts or hiring additional staff'
    });
  }
  
  // Find underutilized staff (less than 80% of average)
  const underutilizedThreshold = avgShifts * 0.8;
  const underutilizedStaff = workloadArray.filter(item => item.totalShifts < underutilizedThreshold);
  
  if (underutilizedStaff.length > 0) {
    recommendations.push({
      type: 'underutilized',
      message: `${underutilizedStaff.length} staff members are underutilized (${underutilizedStaff.map(s => s.staff.name).join(', ')})`,
      suggestion: 'Consider increasing their shift assignments'
    });
  }
  
  return recommendations;
}

module.exports = router;

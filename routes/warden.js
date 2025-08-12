const express = require('express');
const router = express.Router();

// Import models
const User = require('../models/User');
const Details = require('../models/Details');
const Prisoner = require('../models/Prisoner');
const PrisonBlock = require('../models/PrisonBlock');
const Report = require('../models/Report');
const LeaveRequest = require('../models/LeaveRequest');
const { sendStaffWelcomeEmail } = require('../services/staffEmailService');
const { uploadPrisonerPhoto, handleUploadError } = require('../middleware/upload');

// Middleware to check if user is warden
const requireWarden = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_here');
    
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
    const stats = {
      totalInmates: await Prisoner.countDocuments({ status: 'active' }),
      totalStaff: await Details.countDocuments({ 
        userRole: { $in: ['warden', 'staff'] },
        isActive: true 
      }),
      pendingReports: await Report.countDocuments({ 
        status: 'pending',
        assignedTo: req.user._id 
      }),
      pendingParoles: await Prisoner.countDocuments({ 
        'paroleStatus.status': 'pending',
        'paroleStatus.reviewedBy': req.user._id 
      }),
      pendingLeaves: await Details.countDocuments({
        'roleSpecificDetails.staffDetails.leaveRequests': {
          $elemMatch: { status: 'pending' }
        }
      }),
      todaySchedule: await getScheduleCount(new Date()),
      behaviorAlerts: await Prisoner.countDocuments({
        'behaviorScore': { $lt: 3 },
        status: 'active'
      }),
      rehabilitationPrograms: await Prisoner.countDocuments({
        'rehabilitationPrograms': { $exists: true, $ne: [] },
        status: 'active'
      })
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

// Get all inmates
router.get('/inmates', requireWarden, async (req, res) => {
  try {
    const inmates = await Prisoner.find({ status: 'active' })
      .populate('assignedBlock', 'name blockCode')
      .sort({ createdAt: -1 });
    
    res.json({ success: true, inmates });
  } catch (error) {
    console.error('Get inmates error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
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
          employeeId: `STAFF${Date.now()}`,
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
  // This would typically query a schedule collection
  // For now, return a mock count
  return 12;
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

    // Validate required fields
    if (!name || !email || !phone || !employeeId || !position || !department || !experience || !assignedBlock) {
      return res.status(400).json({ msg: 'All required fields must be provided' });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ msg: 'Email already exists' });
    }

    // Check if employee ID already exists
    const existingStaff = await Details.findOne({
      'roleSpecificDetails.staffDetails.employeeId': employeeId
    });
    if (existingStaff) {
      return res.status(400).json({ msg: 'Employee ID already exists' });
    }

    // Generate 8-digit password
    const generatePassword = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let password = '';
      for (let i = 0; i < 8; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return password;
    };

    const generatedPassword = generatePassword();
    console.log('🔑 Generated password for staff:', generatedPassword);

    // Create basic staff record in User collection
    const newStaff = new User({
      name,
      email,
      password: generatedPassword, // Will be hashed automatically by User model pre-save middleware
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
      personalInfo: {
        fullName: name,
        // Don't set gender, dateOfBirth, nationality to null - let them be undefined
        address: {
          // Don't set address fields to null - let them be undefined
        }
      },
      contactInfo: {
        primaryPhone: phone
        // Don't set other fields to null - let them be undefined
      },
      roleSpecificDetails: {
        staffDetails: {
          employeeId,
          position,
          department,
          shift: shift || 'day',
          experience,
          assignedBlock,
          joiningDate: joiningDate || new Date(),
          salary: null,
          qualifications: [],
          certifications: []
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
        employeeId,
        position,
        department,
        generatedPassword // Include in response for display
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

      // The staff details are incorrectly stored, let's extract what we can
      const staffDetailsData = details?.roleSpecificDetails?.staffDetails || {};

      // Since staffDetails is empty, let's use the basic info we have
      console.log(`📋 Using basic info for staff: ${staffUser.name}`);

      formattedStaff.push({
        id: staffUser._id,
        userId: staffUser._id,
        name: details?.personalInfo?.fullName || staffUser.name || 'Unknown',
        email: staffUser.email || details?.userEmail || 'No email',
        phone: details?.contactInfo?.primaryPhone || 'No phone',
        employeeId: `STAFF${staffUser._id.toString().slice(-4)}`,
        position: 'Staff Member',
        department: 'General',
        shift: 'Day',
        experience: 'N/A',
        assignedBlock: 'General',
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
    leaveRequest.approvedBy = req.user.userId;
    leaveRequest.approvedDate = new Date();
    leaveRequest.comments = comments || 'Approved by warden';

    await leaveRequest.save();

    console.log('✅ Leave request approved successfully');

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
    leaveRequest.approvedBy = req.user.userId;
    leaveRequest.approvedDate = new Date();
    leaveRequest.comments = comments || 'Rejected by warden';

    await leaveRequest.save();

    console.log('❌ Leave request rejected successfully');

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
router.post('/prisoners', requireWarden, uploadPrisonerPhoto, handleUploadError, async (req, res) => {
  try {
    console.log('📝 POST /prisoners called by warden');
    console.log('📝 Request data:', req.body);
    console.log('📝 Uploaded file:', req.file);

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
    if (req.file) {
      photographPath = `/uploads/prisoner-photos/${req.file.filename}`;
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
      file: req.file
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

module.exports = router;

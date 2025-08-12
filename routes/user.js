const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Details = require('../models/Details');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Middleware to verify user authentication
const requireAuth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};

// Configure multer for profile picture uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/profiles';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// ===== USER PROFILE ROUTES =====

// Get user profile
router.get('/profile', requireAuth, async (req, res) => {
  try {
    console.log('📖 Profile GET request received');
    console.log('👤 User ID:', req.user.id);

    // Get user basic info
    const user = await User.findById(req.user.id).select('-password');
    console.log('👤 User found:', user ? 'Yes' : 'No');
    if (user) {
      console.log('📋 User data:', {
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        address: user.address,
        profilePicture: user.profilePicture
      });
    }
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Get user details from Details collection
    let details = await Details.findByUserId(req.user.id);

    // If no details exist, create a basic details record
    if (!details) {

      details = new Details({
        userId: req.user.id,
        userRole: user.role || 'visitor',
        userEmail: user.email,
        personalInfo: {
          fullName: user.name,
          profilePicture: user.profilePicture
        },
        contactInfo: {
          primaryPhone: user.phoneNumber,
          email: user.email,
          address: {
            street: user.address || ''
          }
        },
        createdBy: req.user.id,
        isActive: true
      });
      await details.save();
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture,
        phoneNumber: user.phoneNumber,
        address: user.address,
        emailVerified: user.emailVerified,
        authProvider: user.authProvider
      },
      details: details
    });
  } catch (error) {

    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Update user profile
router.put('/profile', requireAuth, async (req, res) => {
  try {
    console.log('📝 Profile update request received');
    console.log('👤 User ID:', req.user.id);
    console.log('📋 Request body:', req.body);

    const {
      name,
      phoneNumber,
      address,
      dateOfBirth,
      gender,
      nationality,
      maritalStatus,
      emergencyContact,
      identification
    } = req.body;

    // Update user basic info
    const userUpdateData = {};
    if (name) userUpdateData.name = name;
    if (phoneNumber) userUpdateData.phoneNumber = phoneNumber;
    if (address) userUpdateData.address = address;

    console.log('🔄 Updating user with data:', userUpdateData);

    const user = await User.findByIdAndUpdate(
      req.user.id,
      userUpdateData,
      { new: true }
    ).select('-password');

    console.log('✅ User updated:', user);

    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Update or create details record
    let details = await Details.findByUserId(req.user.id);

    // Check if dateOfBirth is valid
    if (dateOfBirth) {
      const parsedDate = new Date(dateOfBirth);

    }

    const detailsUpdateData = {
      personalInfo: {
        fullName: name || user.name,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : details?.personalInfo?.dateOfBirth,
        gender: gender || details?.personalInfo?.gender,
        nationality: nationality || details?.personalInfo?.nationality || 'Indian',
        maritalStatus: maritalStatus || details?.personalInfo?.maritalStatus,
        profilePicture: details?.personalInfo?.profilePicture || user.profilePicture
      },
      contactInfo: {
        primaryPhone: phoneNumber || user.phoneNumber,
        email: user.email,
        address: {
          street: address || user.address || details?.contactInfo?.address?.street || '',
          city: details?.contactInfo?.address?.city || '',
          state: details?.contactInfo?.address?.state || '',
          pinCode: details?.contactInfo?.address?.pinCode || '',
          country: details?.contactInfo?.address?.country || 'India'
        },
        emergencyContact: emergencyContact || details?.contactInfo?.emergencyContact
      },
      identification: identification || details?.identification,
      updatedBy: req.user.id
    };

    if (details) {
      // Update existing details

      details = await Details.findOneAndUpdate(
        { userId: req.user.id },
        detailsUpdateData,
        { new: true, runValidators: true }
      );

    } else {
      // Create new details record

      details = new Details({
        userId: req.user.id,
        userRole: user.role || 'visitor',
        userEmail: user.email,
        ...detailsUpdateData,
        createdBy: req.user.id,
        isActive: true
      });
      await details.save();

    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture,
        phoneNumber: user.phoneNumber,
        address: user.address,
        emailVerified: user.emailVerified,
        authProvider: user.authProvider
      },
      details: details
    });
  } catch (error) {

    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Upload profile picture
router.post('/profile/picture', requireAuth, upload.single('profilePicture'), async (req, res) => {
  try {
    console.log('📸 Profile picture upload request received');
    console.log('👤 User ID:', req.user.id);
    console.log('📁 File info:', req.file ? {
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size
    } : 'No file');

    if (!req.file) {
      return res.status(400).json({ msg: 'No file uploaded' });
    }

    const profilePictureUrl = `/uploads/profiles/${req.file.filename}`;
    console.log('🔗 Profile picture URL:', profilePictureUrl);

    // Update user profile picture
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { profilePicture: profilePictureUrl },
      { new: true }
    ).select('-password');

    console.log('✅ User profile picture updated:', user.profilePicture);

    // Update details record
    await Details.findOneAndUpdate(
      { userId: req.user.id },
      { 
        'personalInfo.profilePicture': profilePictureUrl,
        updatedBy: req.user.id
      },
      { new: true }
    );

    console.log('✅ Details record updated with profile picture');

    res.json({
      success: true,
      message: 'Profile picture updated successfully',
      profilePicture: profilePictureUrl,
      user: user
    });
  } catch (error) {

    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

// Change password
router.put('/change-password', requireAuth, async (req, res) => {
  try {

    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ msg: 'Current password and new password are required' });
    }

    // Get user with password
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Check if user has a password (for OAuth users)
    if (!user.password) {
      return res.status(400).json({
        msg: 'Cannot change password for OAuth accounts. Please use your OAuth provider to change your password.'
      });
    }

    // Verify current password
    const bcrypt = require('bcryptjs');
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ msg: 'Current password is incorrect' });
    }

    // Validate new password strength
    if (newPassword.length < 8) {
      return res.status(400).json({ msg: 'New password must be at least 8 characters long' });
    }

    if (!/(?=.*[a-zA-Z])(?=.*\d)(?=.*[@$!%*?&])/.test(newPassword)) {
      return res.status(400).json({
        msg: 'New password must contain at least one letter, one number, and one special character'
      });
    }

    // Check if new password is different from current password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({ msg: 'New password must be different from current password' });
    }

    // Hash new password
    const saltRounds = 10;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await User.findByIdAndUpdate(req.user.id, {
      password: hashedNewPassword,
      updatedAt: new Date()
    });

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {

    res.status(500).json({ msg: 'Server error', error: error.message });
  }
});

module.exports = router;

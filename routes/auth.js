const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');

const router = express.Router();

// Email transporter configuration
let transporter;

// Initialize email transporter
const initializeEmailTransporter = async () => {
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS && process.env.EMAIL_PASS !== 'your-gmail-app-password') {
    // Use Gmail SMTP if real credentials are provided
    try {
      transporter = nodemailer.createTransport({
        service: 'gmail',
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      // Verify the connection
      await transporter.verify();
      console.log('✅ Gmail SMTP connection verified successfully');
      console.log('📧 Real emails will be sent to Gmail addresses');
    } catch (error) {
      console.error('❌ Gmail SMTP connection failed:', error.message);
      console.log('🔧 Please check your EMAIL_USER and EMAIL_PASS in .env file');
      console.log('💡 Make sure you have generated an App Password from Google Account settings');
      console.log('🔄 Falling back to test email service...');

      // Fall back to test email service
      try {
        const testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass
          }
        });
        console.log('📧 Using Ethereal Email as fallback');
        console.log('📧 Test account:', testAccount.user);
      } catch (fallbackError) {
        console.error('Failed to create fallback email account:', fallbackError);
        transporter = null;
      }
    }
  } else {
    // Use Ethereal Email for testing (creates a fake inbox)
    try {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
      console.log('📧 Using Ethereal Email for testing');
      console.log('📧 Test account:', testAccount.user);
      console.log('📧 Emails will be available at preview URLs');
      console.log('💡 To send real Gmail emails, set EMAIL_USER and EMAIL_PASS in .env');
    } catch (error) {
      console.error('Failed to create test email account:', error);
      transporter = null;
    }
  }
};

// Initialize transporter
initializeEmailTransporter();

// Real email sending function
const sendEmail = async (to, subject, html) => {
  try {
    if (!transporter) {
      console.log('⚠️ Email transporter not initialized');
      console.log('=== EMAIL CONTENT ===');
      console.log('To:', to);
      console.log('Subject:', subject);
      console.log('Content:', html);
      console.log('====================');
      return { success: true };
    }

    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER ? `"Prison Visitor Portal" <${process.env.EMAIL_USER}>` : '"Prison Visitor Portal" <noreply@prison-portal.com>',
      to: to,
      subject: subject,
      html: html
    });

    console.log('✅ Email sent successfully!');
    console.log('📧 Message ID:', info.messageId);

    // If using Ethereal Email, provide preview URL
    if (info.messageId && (!process.env.EMAIL_USER || process.env.EMAIL_USER === 'aleenaannaalex2026@mca.ajce.in')) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log('🔗 Preview URL:', previewUrl);
      console.log('📋 Copy this URL to see the email in your browser');
      console.log('📧 Email would be sent to:', to);
      console.log('💡 This is a working email preview - click the reset link inside!');
    }

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Email error:', error);
    return { success: false, error };
  }
};

// Check if email exists
router.post('/check-email', async (req, res) => {
  const { email } = req.body;
  try {
    if (!email) {
      return res.status(400).json({ msg: 'Email is required' });
    }

    const user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ exists: true, msg: 'Email already exists' });
    }

    res.json({ exists: false, msg: 'Email is available' });
  } catch (err) {
    console.error('Check email error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Register
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({ msg: 'Please provide name, email, and password' });
    }

    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: 'User already exists' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user = new User({
      name,
      email,
      password: hashedPassword,
      role: 'user' // Set default role as 'user' for regular registration
    });
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role || 'user'
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// Sync Supabase OAuth user with MongoDB
router.post('/sync-oauth-user', async (req, res) => {
  console.log('🚀 Sync OAuth user endpoint called');
  console.log('📥 Request body:', req.body);

  try {
    const { supabaseUser } = req.body;

    console.log('📥 Received Supabase user data:', JSON.stringify(supabaseUser, null, 2));

    if (!supabaseUser || !supabaseUser.id || !supabaseUser.email) {
      console.log('❌ Invalid Supabase user data:', {
        hasUser: !!supabaseUser,
        hasId: !!supabaseUser?.id,
        hasEmail: !!supabaseUser?.email
      });
      return res.status(400).json({ msg: 'Invalid Supabase user data' });
    }

    // Check if user already exists by email or supabaseId
    let user = await User.findOne({
      $or: [
        { email: supabaseUser.email },
        { supabaseId: supabaseUser.id }
      ]
    });

    // Prepare complete Supabase data for storage
    const supabaseData = {
      aud: supabaseUser.aud,
      role: supabaseUser.role,
      email_confirmed_at: supabaseUser.email_confirmed_at ? new Date(supabaseUser.email_confirmed_at) : null,
      phone_confirmed_at: supabaseUser.phone_confirmed_at ? new Date(supabaseUser.phone_confirmed_at) : null,
      confirmed_at: supabaseUser.confirmed_at ? new Date(supabaseUser.confirmed_at) : null,
      last_sign_in_at: supabaseUser.last_sign_in_at ? new Date(supabaseUser.last_sign_in_at) : null,
      app_metadata: supabaseUser.app_metadata || {},
      user_metadata: supabaseUser.user_metadata || {},
      identities: supabaseUser.identities || [],
      created_at: supabaseUser.created_at ? new Date(supabaseUser.created_at) : null,
      updated_at: supabaseUser.updated_at ? new Date(supabaseUser.updated_at) : null,
      email_change_sent_at: supabaseUser.email_change_sent_at ? new Date(supabaseUser.email_change_sent_at) : null,
      phone_change_sent_at: supabaseUser.phone_change_sent_at ? new Date(supabaseUser.phone_change_sent_at) : null
    };

    // Extract commonly used fields
    const profilePicture = supabaseUser.user_metadata?.avatar_url ||
                          supabaseUser.user_metadata?.picture ||
                          null;
    const fullName = supabaseUser.user_metadata?.full_name ||
                     supabaseUser.user_metadata?.name ||
                     supabaseUser.email.split('@')[0];
    const emailVerified = supabaseUser.user_metadata?.email_verified ||
                         supabaseUser.email_confirmed_at !== null;
    const phoneNumber = supabaseUser.phone || null;

    if (user) {
      // Update existing user with complete Supabase data
      user.supabaseId = supabaseUser.id;
      user.authProvider = supabaseUser.app_metadata?.provider || 'google';
      user.lastLogin = new Date();
      user.supabaseData = supabaseData;

      // Update extracted fields
      user.name = fullName;
      user.profilePicture = profilePicture;
      user.emailVerified = emailVerified;
      user.phoneNumber = phoneNumber;

      await user.save();
      console.log('✅ Updated existing user with Supabase data');
    } else {
      // Create new user with complete Supabase data
      user = new User({
        name: fullName,
        email: supabaseUser.email,
        authProvider: supabaseUser.app_metadata?.provider || 'google',
        supabaseId: supabaseUser.id,
        supabaseData: supabaseData,
        profilePicture: profilePicture,
        emailVerified: emailVerified,
        phoneNumber: phoneNumber,
        role: 'user', // Set default role as 'user' for OAuth registration
        lastLogin: new Date()
      });

      await user.save();
      console.log('✅ Created new user with Supabase data');
    }

    // Generate JWT token for the user
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role || 'user',
        authProvider: user.authProvider,
        profilePicture: user.profilePicture,
        emailVerified: user.emailVerified,
        phoneNumber: user.phoneNumber,
        supabaseId: user.supabaseId
      }
    });

  } catch (err) {
    console.error('❌ OAuth sync error:', err);
    res.status(500).json({ msg: 'Server error during OAuth sync', error: err.message });
  }
});

// Check email availability
router.get('/check-email', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ msg: 'Email is required' });
    }

    const user = await User.findOne({ email });
    res.json({
      exists: !!user,
      email: email
    });
  } catch (err) {
    console.error('Email check error:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// Test endpoint to verify backend is working
router.get('/test', (req, res) => {
  console.log('🧪 Test endpoint called');
  res.json({
    success: true,
    message: 'Backend is working!',
    timestamp: new Date().toISOString()
  });
});

// Get user with complete Supabase data (for debugging)
router.get('/user/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role || 'user',
        authProvider: user.authProvider,
        profilePicture: user.profilePicture,
        emailVerified: user.emailVerified,
        phoneNumber: user.phoneNumber,
        supabaseId: user.supabaseId,
        supabaseData: user.supabaseData, // Complete Supabase data
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      }
    });
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ msg: 'Please provide email and password' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role || 'user',
        authProvider: user.authProvider || 'local',
        profilePicture: user.profilePicture
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// Forgot Password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    if (!email) {
      return res.status(400).json({ msg: 'Email is required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if email exists or not for security
      return res.json({ msg: 'If an account with that email exists, a password reset link has been sent.' });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000; // 1 hour

    // Save reset token to user
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetTokenExpiry;
    await user.save();

    // Create reset URL
    const resetUrl = `http://localhost:5173/reset-password/${resetToken}`;

    // Email content
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>Hello ${user.name},</p>
        <p>You requested a password reset for your Prison Visitor Portal account.</p>
        <p>Click the button below to reset your password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #000; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
        </div>
        <p>Or copy and paste this link in your browser:</p>
        <p style="word-break: break-all; color: #666;">${resetUrl}</p>
        <p><strong>This link will expire in 1 hour.</strong></p>
        <p>If you didn't request this password reset, please ignore this email.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #666; font-size: 12px;">Kerala State Prison Department - Visitor Portal</p>
      </div>
    `;

    // Send email
    await sendEmail(email, 'Password Reset Request - Prison Visitor Portal', emailHtml);

    res.json({ msg: 'If an account with that email exists, a password reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Reset Password
router.post('/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  try {
    if (!password) {
      return res.status(400).json({ msg: 'Password is required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ msg: 'Password must be at least 8 characters long' });
    }

    if (!/(?=.*[a-zA-Z])/.test(password)) {
      return res.status(400).json({ msg: 'Password must contain at least one letter' });
    }

    if (!/(?=.*\d)/.test(password)) {
      return res.status(400).json({ msg: 'Password must contain at least one number' });
    }

    if (!/(?=.*[@$!%*?&])/.test(password)) {
      return res.status(400).json({ msg: 'Password must contain at least one special character (@$!%*?&)' });
    }

    // Find user with valid reset token
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ msg: 'Invalid or expired reset token' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Update user password and clear reset token
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ msg: 'Password has been reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Verify Reset Token
router.get('/verify-reset-token/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ valid: false, msg: 'Invalid or expired reset token' });
    }

    res.json({ valid: true, email: user.email });
  } catch (err) {
    console.error('Verify token error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Verify JWT Token
router.get('/verify-token', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ valid: false, msg: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({ valid: false, msg: 'User not found' });
    }

    res.json({
      valid: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role || 'user',
        authProvider: user.authProvider || 'local',
        profilePicture: user.profilePicture
      }
    });
  } catch (err) {
    console.error('Token verification error:', err);
    res.status(401).json({ valid: false, msg: 'Invalid token' });
  }
});

module.exports = router;

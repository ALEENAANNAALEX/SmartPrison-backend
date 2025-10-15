const nodemailer = require('nodemailer');

// Configure email transporter
const createEmailTransporter = () => {
  console.log('📧 Using basic authentication for staff email');
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false
    }
  });
};

// Send welcome email to new staff with login credentials
const sendStaffWelcomeEmail = async (staffData, generatedPassword) => {
  try {
    console.log('🔍 Staff Email function called with:');
    console.log('- Staff email:', staffData.email);
    console.log('- Generated password:', generatedPassword);
    console.log('- Password exists:', !!generatedPassword);

    // Check if email configuration is available
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log('⚠ Email configuration not found, skipping staff welcome email');
      return { success: false, message: 'Email configuration not available' };
    }

    const transporter = createEmailTransporter();
    
    // Verify connection
    await transporter.verify();
    console.log('✅ SMTP connection verified for staff welcome email');

    // Create email content
    const welcomeMessage = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Prison Management System</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f7fa; line-height: 1.6;">

        <!-- Main Container -->
        <div style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); overflow: hidden;">

          <!-- Header Section -->
          <div style="background: linear-gradient(135deg, #1f2937 0%, #111827 100%); padding: 30px 20px; text-align: center; color: white;">
            <div style="font-size: 32px; margin-bottom: 10px;">🏛️</div>
            <h1 style="margin: 0; font-size: 28px; font-weight: bold;">Smart Prison System</h1>
            <p style="margin: 5px 0 0 0; font-size: 16px; opacity: 0.9;">Staff Access Portal</p>
          </div>

          <!-- Password Alert Section -->
          <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 25px 20px; text-align: center; color: white; border-bottom: 3px solid #065f46;">
            <div style="font-size: 24px; margin-bottom: 10px;">🔐</div>
            <h2 style="margin: 0; font-size: 22px; font-weight: bold;">STAFF ACCESS CREDENTIALS</h2>
            <div style="background: rgba(255,255,255,0.2); margin: 15px auto; padding: 15px 25px; border-radius: 8px; font-family: 'Courier New', monospace; font-size: 24px; font-weight: bold; letter-spacing: 3px; max-width: 300px; border: 2px solid rgba(255,255,255,0.3);">
              ${generatedPassword}
            </div>
            <p style="margin: 10px 0 0 0; font-size: 14px; opacity: 0.9;">Confidential - Handle with Care</p>
          </div>

          <!-- Welcome Section -->
          <div style="padding: 30px 20px;">
            <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px; text-align: center;">
              Welcome <span style="color: #059669;">${staffData.name}</span>! 👮‍♂️
            </h2>

            <p style="color: #6b7280; font-size: 16px; text-align: center; margin-bottom: 30px;">
              You have been added as a staff member in our Smart Prison Management System. Your dedication and professionalism are essential for maintaining security and order.
            </p>

            <!-- Login Details Card -->
            <div style="background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 10px; padding: 25px; margin: 20px 0;">
              <h3 style="color: #059669; margin: 0 0 20px 0; font-size: 20px; text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
                🔐 Staff Access Portal
              </h3>

              <div style="margin-bottom: 15px;">
                <strong style="color: #374151; display: inline-block; width: 80px;">Email:</strong>
                <span style="color: #1f2937; font-family: 'Courier New', monospace; background: #e5e7eb; padding: 4px 8px; border-radius: 4px;">${staffData.email}</span>
              </div>

              <div style="margin-bottom: 15px;">
                <strong style="color: #374151; display: inline-block; width: 80px;">Password:</strong>
                <span style="color: #059669; font-family: 'Courier New', monospace; background: #ecfdf5; padding: 4px 8px; border-radius: 4px; font-weight: bold;">${generatedPassword}</span>
              </div>

              <div style="margin-bottom: 20px;">
                <strong style="color: #374151; display: inline-block; width: 80px;">Portal:</strong>
                <a href="http://localhost:5174/login" style="color: #059669; text-decoration: none; font-weight: 500;">http://localhost:5174/login</a>
              </div>

              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 15px; border-radius: 6px;">
                <p style="margin: 0; color: #92400e; font-size: 14px;">
                  <strong>⚠ Security Protocol:</strong> Please change your password after first login and keep it confidential.
                </p>
              </div>
            </div>

            <!-- Staff Information Card -->
            <div style="background: #ecfdf5; border: 2px solid #a7f3d0; border-radius: 10px; padding: 25px; margin: 20px 0;">
              <h3 style="color: #065f46; margin: 0 0 20px 0; font-size: 20px; text-align: center; border-bottom: 2px solid #a7f3d0; padding-bottom: 10px;">
                👤 Staff Profile
              </h3>

              <div style="display: grid; gap: 12px;">
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #d1fae5;">
                  <strong style="color: #0f172a;">Name:</strong>
                  <span style="color: #1e293b;">${staffData.name}</span>
                </div>

                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #d1fae5;">
                  <strong style="color: #0f172a;">Email:</strong>
                  <span style="color: #1e293b;">${staffData.email}</span>
                </div>

                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #d1fae5;">
                  <strong style="color: #0f172a;">Phone:</strong>
                  <span style="color: #1e293b;">${staffData.phone || 'Not provided'}</span>
                </div>

                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #d1fae5;">
                  <strong style="color: #0f172a;">Position:</strong>
                  <span style="color: #1e293b;">${staffData.position}</span>
                </div>

                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #d1fae5;">
                  <strong style="color: #0f172a;">Department:</strong>
                  <span style="color: #1e293b;">${staffData.department}</span>
                </div>

                <div style="display: flex; justify-content: space-between; padding: 8px 0;">
                  <strong style="color: #0f172a;">Assigned Block:</strong>
                  <span style="color: #1e293b;">${staffData.assignedBlock}</span>
                </div>
              </div>
            </div>

            <!-- CTA Button -->
            <div style="text-align: center; margin: 30px 0;">
              <a href="http://localhost:5174/login" style="display: inline-block; background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white; text-decoration: none; padding: 15px 40px; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(5, 150, 105, 0.3); transition: all 0.3s ease;">
                🏛️ Access Staff Portal
              </a>
            </div>

            <!-- Support Section -->
            <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; text-align: center; margin-top: 30px;">
              <p style="color: #64748b; margin: 0 0 10px 0; font-size: 14px;">
                Need assistance? Contact your supervisor or the IT support team.
              </p>
              <p style="color: #475569; margin: 0; font-size: 14px;">
                Technical support is available during business hours.
              </p>
            </div>
          </div>

          <!-- Footer -->
          <div style="background: #1f2937; color: #9ca3af; padding: 25px 20px; text-align: center;">
            <div style="margin-bottom: 15px;">
              <div style="font-size: 24px; margin-bottom: 8px;">🏛️</div>
              <h4 style="margin: 0; color: #f9fafb; font-size: 18px;">Smart Prison System</h4>
              <p style="margin: 5px 0 0 0; font-size: 14px;">Staff Access Portal</p>
            </div>

            <div style="border-top: 1px solid #374151; padding-top: 15px; font-size: 12px;">
              <p style="margin: 0;">© 2025 Smart Prison System. All rights reserved.</p>
              <p style="margin: 5px 0 0 0;">This is a confidential communication.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    // Create plain text version
    const plainTextMessage = `
═══════════════════════════════════════════════════════════════
🏛️ SMART PRISON SYSTEM - STAFF ACCESS 🏛️
═══════════════════════════════════════════════════════════════

🔐 STAFF ACCESS CREDENTIALS: ${generatedPassword}
═══════════════════════════════════════════════════════════════

Welcome ${staffData.name}! 👮‍♂️

You have been added as a staff member in our Smart Prison Management System.
Your dedication and professionalism are essential for maintaining security and order.

🔐 STAFF ACCESS PORTAL:
───────────────────────────────────────────────────────────────
Email:    ${staffData.email}
Password: ${generatedPassword}
Portal:   http://localhost:5174/login

⚠  SECURITY PROTOCOL: Please change your password after first login 
    and keep it confidential.

👤 STAFF PROFILE:
───────────────────────────────────────────────────────────────
Name:            ${staffData.name}
Email:           ${staffData.email}
Phone:           ${staffData.phone || 'Not provided'}
Position:        ${staffData.position}
Department:      ${staffData.department}
Assigned Block:  ${staffData.assignedBlock}

💡 NEED ASSISTANCE?
───────────────────────────────────────────────────────────────
Contact your supervisor or the IT support team.
Technical support is available during business hours.

═══════════════════════════════════════════════════════════════
🏛️ Smart Prison System
Staff Access Portal

© 2025 Smart Prison System. All rights reserved.
This is a confidential communication.
═══════════════════════════════════════════════════════════════
    `;

    // Send the email with both HTML and plain text
    const result = await transporter.sendMail({
      from: `"Smart Prison System" <${process.env.EMAIL_USER}>`,
      to: staffData.email,
      subject: `🔐 Staff Access Credentials: ${generatedPassword} - Welcome ${staffData.name}`,
      html: welcomeMessage,
      text: plainTextMessage
    });

    console.log(`✅ Staff welcome email sent successfully to: ${staffData.email}`);
    console.log('Email message ID:', result.messageId);

    return {
      success: true,
      message: 'Staff welcome email sent successfully',
      messageId: result.messageId
    };

  } catch (error) {
    console.error('❌ Failed to send staff welcome email:', error);
    return {
      success: false,
      message: 'Failed to send staff welcome email',
      error: error.message
    };
  }
};

// Send schedule update notification to staff
const sendScheduleUpdateEmail = async (staffData, scheduleData) => {
  try {
    console.log('🔍 Schedule update email function called with:');
    console.log('- Staff email:', staffData.email);
    console.log('- Schedule ID:', scheduleData._id);

    // Check if email configuration is available
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log('⚠ Email configuration not found, skipping schedule update email');
      return { success: false, message: 'Email configuration not available' };
    }

    const transporter = createEmailTransporter();
    
    // Verify connection
    await transporter.verify();
    console.log('✅ SMTP connection verified for schedule update email');

    // Create email content
    const scheduleMessage = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Schedule Update - Prison Management System</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f7fa; line-height: 1.6;">

        <!-- Main Container -->
        <div style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); overflow: hidden;">

          <!-- Header Section -->
          <div style="background: linear-gradient(135deg, #1f2937 0%, #111827 100%); padding: 30px 20px; text-align: center; color: white;">
            <div style="font-size: 32px; margin-bottom: 10px;">📅</div>
            <h1 style="margin: 0; font-size: 28px; font-weight: bold;">Schedule Update</h1>
            <p style="margin: 5px 0 0 0; font-size: 16px; opacity: 0.9;">Your shift schedule has been updated</p>
          </div>

          <!-- Update Alert Section -->
          <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 25px 20px; text-align: center; color: white; border-bottom: 3px solid #065f46;">
            <div style="font-size: 24px; margin-bottom: 10px;">🔄</div>
            <h2 style="margin: 0; font-size: 22px; font-weight: bold;">SCHEDULE UPDATED</h2>
            <p style="margin: 10px 0 0 0; font-size: 14px; opacity: 0.9;">Please review your new shift details below</p>
          </div>

          <!-- Schedule Details Section -->
          <div style="padding: 30px 20px;">
            <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px; text-align: center;">
              Hello <span style="color: #059669;">${staffData.name}</span>! 👮‍♂️
            </h2>

            <p style="color: #6b7280; font-size: 16px; text-align: center; margin-bottom: 30px;">
              Your shift schedule has been updated. Please review the details below and ensure you are available for your assigned shift.
            </p>

            <!-- Schedule Details Card -->
            <div style="background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 10px; padding: 25px; margin: 20px 0;">
              <h3 style="color: #059669; margin: 0 0 20px 0; font-size: 20px; text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
                📅 Shift Details
              </h3>

              <div style="display: grid; gap: 12px;">
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
                  <strong style="color: #374151;">Location:</strong>
                  <span style="color: #1e293b;">${scheduleData.location}</span>
                </div>

                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
                  <strong style="color: #374151;">Date:</strong>
                  <span style="color: #1e293b;">${new Date(scheduleData.date).toLocaleDateString()}</span>
                </div>

                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
                  <strong style="color: #374151;">Shift:</strong>
                  <span style="color: #1e293b;">${scheduleData.shift ? scheduleData.shift.charAt(0).toUpperCase() + scheduleData.shift.slice(1) : 'Day'} Shift</span>
                </div>

                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
                  <strong style="color: #374151;">Time:</strong>
                  <span style="color: #1e293b;">${scheduleData.startTime} - ${scheduleData.endTime}</span>
                </div>

                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
                  <strong style="color: #374151;">Priority:</strong>
                  <span style="color: #1e293b; padding: 4px 8px; border-radius: 4px; background: ${
                    scheduleData.priority === 'High' ? '#fef2f2; color: #dc2626' :
                    scheduleData.priority === 'Medium' ? '#fef3c7; color: #d97706' :
                    '#f0fdf4; color: #16a34a'
                  };">${scheduleData.priority}</span>
                </div>

                <div style="display: flex; justify-content: space-between; padding: 8px 0;">
                  <strong style="color: #374151;">Title:</strong>
                  <span style="color: #1e293b;">${scheduleData.title}</span>
                </div>
              </div>
            </div>

            <!-- Important Notice -->
            <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 15px; border-radius: 6px; margin: 20px 0;">
              <p style="margin: 0; color: #92400e; font-size: 14px;">
                <strong>⚠ Important:</strong> Please confirm your availability for this shift. If you have any conflicts, contact your supervisor immediately.
              </p>
            </div>

            <!-- CTA Button -->
            <div style="text-align: center; margin: 30px 0;">
              <a href="http://localhost:5174/login" style="display: inline-block; background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white; text-decoration: none; padding: 15px 40px; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(5, 150, 105, 0.3); transition: all 0.3s ease;">
                📅 View Full Schedule
              </a>
            </div>

            <!-- Support Section -->
            <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; text-align: center; margin-top: 30px;">
              <p style="color: #64748b; margin: 0 0 10px 0; font-size: 14px;">
                Questions about your schedule? Contact your supervisor or the scheduling department.
              </p>
              <p style="color: #475569; margin: 0; font-size: 14px;">
                Schedule updates are sent automatically when changes are made.
              </p>
            </div>
          </div>

          <!-- Footer -->
          <div style="background: #1f2937; color: #9ca3af; padding: 25px 20px; text-align: center;">
            <div style="margin-bottom: 15px;">
              <div style="font-size: 24px; margin-bottom: 8px;">🏛️</div>
              <h4 style="margin: 0; color: #f9fafb; font-size: 18px;">Smart Prison System</h4>
              <p style="margin: 5px 0 0 0; font-size: 14px;">Staff Schedule Management</p>
            </div>

            <div style="border-top: 1px solid #374151; padding-top: 15px; font-size: 12px;">
              <p style="margin: 0;">© 2025 Smart Prison System. All rights reserved.</p>
              <p style="margin: 5px 0 0 0;">This is a confidential communication.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    // Create plain text version
    const plainTextMessage = `
═══════════════════════════════════════════════════════════════
📅 SCHEDULE UPDATE - SMART PRISON SYSTEM 📅
═══════════════════════════════════════════════════════════════

🔄 SCHEDULE UPDATED
═══════════════════════════════════════════════════════════════

Hello ${staffData.name}! 👮‍♂️

Your shift schedule has been updated. Please review the details below and ensure you are available for your assigned shift.

📅 SHIFT DETAILS:
───────────────────────────────────────────────────────────────
Location:  ${scheduleData.location}
Date:      ${new Date(scheduleData.date).toLocaleDateString()}
Shift:     ${scheduleData.shift ? scheduleData.shift.charAt(0).toUpperCase() + scheduleData.shift.slice(1) : 'Day'} Shift
Time:      ${scheduleData.startTime} - ${scheduleData.endTime}
Priority:  ${scheduleData.priority}
Title:     ${scheduleData.title}

⚠  IMPORTANT: Please confirm your availability for this shift. 
    If you have any conflicts, contact your supervisor immediately.

💡 QUESTIONS ABOUT YOUR SCHEDULE?
───────────────────────────────────────────────────────────────
Contact your supervisor or the scheduling department.
Schedule updates are sent automatically when changes are made.

═══════════════════════════════════════════════════════════════
🏛️ Smart Prison System
Staff Schedule Management

© 2025 Smart Prison System. All rights reserved.
This is a confidential communication.
═══════════════════════════════════════════════════════════════
    `;

    // Send the email with both HTML and plain text
    const result = await transporter.sendMail({
      from: `"Smart Prison System" <${process.env.EMAIL_USER}>`,
      to: staffData.email,
      subject: `📅 Schedule Update - ${scheduleData.title} - ${new Date(scheduleData.date).toLocaleDateString()}`,
      html: scheduleMessage,
      text: plainTextMessage
    });

    console.log(`✅ Schedule update email sent successfully to: ${staffData.email}`);
    console.log('Email message ID:', result.messageId);

    return {
      success: true,
      message: 'Schedule update email sent successfully',
      messageId: result.messageId
    };

  } catch (error) {
    console.error('❌ Failed to send schedule update email:', error);
    return {
      success: false,
      message: 'Failed to send schedule update email',
      error: error.message
    };
  }
};

// Send leave approval/rejection email to staff
const sendLeaveDecisionEmail = async (staffData, leaveData, decision) => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log('⚠ Email configuration not found, skipping leave decision email');
      return { success: false, message: 'Email configuration not available' };
    }

    const transporter = createEmailTransporter();
    await transporter.verify();

    const isApproved = String(decision).toLowerCase() === 'approved';
    const subjectEmoji = isApproved ? '✅' : '❌';
    const subject = `${subjectEmoji} Leave ${isApproved ? 'Approved' : 'Rejected'} - ${leaveData.leaveType}`;

    const dateRange = `${new Date(leaveData.startDate).toLocaleDateString()} - ${new Date(leaveData.endDate).toLocaleDateString()}`;

    const html = `
      <!doctype html>
      <html><body style="font-family:Segoe UI,Arial,sans-serif;background:#f8fafc;padding:0;margin:0;">
        <div style="max-width:640px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 6px 20px rgba(0,0,0,.08)">
          <div style="background:${isApproved ? '#059669' : '#b91c1c'};color:#fff;padding:20px 24px;">
            <h2 style="margin:0">${subjectEmoji} Leave ${isApproved ? 'Approved' : 'Rejected'}</h2>
            <div style="opacity:.9">${leaveData.requestId || ''}</div>
          </div>
          <div style="padding:24px">
            <p>Hi ${staffData.name || 'Staff'},</p>
            <p>Your leave request has been <strong>${isApproved ? 'approved' : 'rejected'}</strong> by the warden.</p>
            <div style="background:#f1f5f9;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0">
              <div><strong>Type:</strong> ${leaveData.leaveType}</div>
              <div><strong>Dates:</strong> ${dateRange}</div>
              <div><strong>Total Days:</strong> ${leaveData.totalDays}</div>
              <div><strong>Status:</strong> ${isApproved ? 'Approved' : 'Rejected'}</div>
              ${leaveData.comments ? `<div><strong>Comments:</strong> ${leaveData.comments}</div>` : ''}
            </div>
            <p style="color:#64748b;font-size:14px">If you have questions, please contact your supervisor.</p>
          </div>
          <div style="background:#111827;color:#9ca3af;text-align:center;padding:16px">Smart Prison System</div>
        </div>
      </body></html>
    `;

    const text = `Leave ${isApproved ? 'Approved' : 'Rejected'}\n\nType: ${leaveData.leaveType}\nDates: ${dateRange}\nTotal Days: ${leaveData.totalDays}\nStatus: ${isApproved ? 'Approved' : 'Rejected'}\n${leaveData.comments ? 'Comments: ' + leaveData.comments : ''}`;

    const result = await transporter.sendMail({
      from: `Smart Prison System <${process.env.EMAIL_USER}>`,
      to: staffData.email,
      subject,
      html,
      text
    });

    return { success: true, message: 'Leave decision email sent', messageId: result.messageId };
  } catch (error) {
    console.error('❌ Failed to send leave decision email:', error);
    return { success: false, message: 'Failed to send leave decision email', error: error.message };
  }
};

module.exports = {
  sendStaffWelcomeEmail,
  sendScheduleUpdateEmail,
  sendLeaveDecisionEmail
};

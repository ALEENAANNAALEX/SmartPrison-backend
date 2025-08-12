const nodemailer = require('nodemailer');
const { google } = require('googleapis');

const OAuth2 = google.auth.OAuth2;

// Configure email transporter with OAuth2
const createEmailTransporter = () => {
  // Try OAuth2 first if refresh token is available
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    try {
      const oauth2Client = new OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        'https://developers.google.com/oauthplayground'
      );

      oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
      });

      const accessToken = oauth2Client.getAccessToken();

      return nodemailer.createTransport({
        service: 'gmail',
        auth: {
          type: 'OAuth2',
          user: process.env.EMAIL_USER,
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
          accessToken: accessToken
        },
        tls: {
          rejectUnauthorized: false
        }
      });
    } catch (error) {
      console.log('⚠ OAuth2 failed, falling back to basic auth:', error.message);
    }
  }

  // Fallback to basic authentication
  console.log('📧 Using basic authentication for email');
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

// Send welcome email to new warden with login credentials
const sendWardenWelcomeEmail = async (wardenData, adminData, generatedPassword) => {
  try {
    console.log('🔍 Warden Email function called with:');
    console.log('- Warden email:', wardenData.email);
    console.log('- Generated password:', generatedPassword);
    console.log('- Password exists:', !!generatedPassword);

    // Check if email configuration is available
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log('⚠ Email configuration not found, skipping warden welcome email');
      return { success: false, message: 'Email configuration not available' };
    }

    const transporter = createEmailTransporter();
    
    // Verify connection
    await transporter.verify();
    console.log('✅ SMTP connection verified for warden welcome email');

    // Create ATTRACTIVE email content with prison management styling
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
            <h1 style="margin: 0; font-size: 28px; font-weight: bold;">Prison Management System</h1>
            <p style="margin: 5px 0 0 0; font-size: 16px; opacity: 0.9;">Secure Correctional Facility Management</p>
          </div>

          <!-- Password Alert Section -->
          <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 25px 20px; text-align: center; color: white; border-bottom: 3px solid #991b1b;">
            <div style="font-size: 24px; margin-bottom: 10px;">🔐</div>
            <h2 style="margin: 0; font-size: 22px; font-weight: bold;">WARDEN ACCESS CREDENTIALS</h2>
            <div style="background: rgba(255,255,255,0.2); margin: 15px auto; padding: 15px 25px; border-radius: 8px; font-family: 'Courier New', monospace; font-size: 24px; font-weight: bold; letter-spacing: 3px; max-width: 300px; border: 2px solid rgba(255,255,255,0.3);">
              ${generatedPassword}
            </div>
            <p style="margin: 10px 0 0 0; font-size: 14px; opacity: 0.9;">Confidential - Handle with Care</p>
          </div>

          <!-- Welcome Section -->
          <div style="padding: 30px 20px;">
            <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px; text-align: center;">
              Welcome Warden <span style="color: #dc2626;">${wardenData.name}</span>! 🎖️
            </h2>

            <p style="color: #6b7280; font-size: 16px; text-align: center; margin-bottom: 30px;">
              You have been appointed as a Warden in our Prison Management System. Your leadership and oversight are crucial for maintaining security and order.
            </p>

            <!-- Login Details Card -->
            <div style="background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 10px; padding: 25px; margin: 20px 0;">
              <h3 style="color: #dc2626; margin: 0 0 20px 0; font-size: 20px; text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
                🔐 Warden Access Portal
              </h3>

              <div style="margin-bottom: 15px;">
                <strong style="color: #374151; display: inline-block; width: 80px;">Email:</strong>
                <span style="color: #1f2937; font-family: 'Courier New', monospace; background: #e5e7eb; padding: 4px 8px; border-radius: 4px;">${wardenData.email}</span>
              </div>

              <div style="margin-bottom: 15px;">
                <strong style="color: #374151; display: inline-block; width: 80px;">Password:</strong>
                <span style="color: #dc2626; font-family: 'Courier New', monospace; background: #fef2f2; padding: 4px 8px; border-radius: 4px; font-weight: bold;">${generatedPassword}</span>
              </div>

              <div style="margin-bottom: 20px;">
                <strong style="color: #374151; display: inline-block; width: 80px;">Portal:</strong>
                <a href="http://localhost:5174/login" style="color: #dc2626; text-decoration: none; font-weight: 500;">http://localhost:5174/login</a>
              </div>

              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 15px; border-radius: 6px;">
                <p style="margin: 0; color: #92400e; font-size: 14px;">
                  <strong>⚠ Security Protocol:</strong> This password grants high-level access. Change it immediately after first login and never share it.
                </p>
              </div>
            </div>

            <!-- Warden Information Card -->
            <div style="background: #fef2f2; border: 2px solid #fecaca; border-radius: 10px; padding: 25px; margin: 20px 0;">
              <h3 style="color: #991b1b; margin: 0 0 20px 0; font-size: 20px; text-align: center; border-bottom: 2px solid #fecaca; padding-bottom: 10px;">
                👤 Warden Profile
              </h3>

              <div style="display: grid; gap: 12px;">
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #fee2e2;">
                  <strong style="color: #0f172a;">Name:</strong>
                  <span style="color: #1e293b;">${wardenData.name}</span>
                </div>

                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #fee2e2;">
                  <strong style="color: #0f172a;">Email:</strong>
                  <span style="color: #1e293b;">${wardenData.email}</span>
                </div>

                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #fee2e2;">
                  <strong style="color: #0f172a;">Phone:</strong>
                  <span style="color: #1e293b;">${wardenData.phone || 'Not provided'}</span>
                </div>

                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #fee2e2;">
                  <strong style="color: #0f172a;">Role:</strong>
                  <span style="color: #1e293b; text-transform: capitalize;">Warden</span>
                </div>

                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #fee2e2;">
                  <strong style="color: #0f172a;">Department:</strong>
                  <span style="color: #1e293b;">${wardenData.department || 'Correctional Services'}</span>
                </div>

                <div style="display: flex; justify-content: space-between; padding: 8px 0;">
                  <strong style="color: #0f172a;">Facility:</strong>
                  <span style="color: #1e293b;">${wardenData.facility || 'Main Facility'}</span>
                </div>
              </div>
            </div>

            <!-- Responsibilities Section -->
            <div style="background: #f0f9ff; border: 2px solid #bae6fd; border-radius: 10px; padding: 25px; margin: 20px 0;">
              <h3 style="color: #0369a1; margin: 0 0 20px 0; font-size: 20px; text-align: center; border-bottom: 2px solid #bae6fd; padding-bottom: 10px;">
                🛡️ Warden Responsibilities
              </h3>

              <div style="counter-reset: step-counter;">
                <div style="counter-increment: step-counter; display: flex; align-items: center; margin-bottom: 15px; padding: 12px; background: white; border-radius: 8px; border-left: 4px solid #0369a1;">
                  <div style="background: #0369a1; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 15px; font-size: 12px;">1</div>
                  <span style="color: #374151;">Oversee daily prison operations and security protocols</span>
                </div>

                <div style="counter-increment: step-counter; display: flex; align-items: center; margin-bottom: 15px; padding: 12px; background: white; border-radius: 8px; border-left: 4px solid #0369a1;">
                  <div style="background: #0369a1; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 15px; font-size: 12px;">2</div>
                  <span style="color: #374151;">Manage prisoner records and behavioral reports</span>
                </div>

                <div style="counter-increment: step-counter; display: flex; align-items: center; margin-bottom: 15px; padding: 12px; background: white; border-radius: 8px; border-left: 4px solid #0369a1;">
                  <div style="background: #0369a1; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 15px; font-size: 12px;">3</div>
                  <span style="color: #374151;">Coordinate with staff and handle visitor management</span>
                </div>

                <div style="counter-increment: step-counter; display: flex; align-items: center; padding: 12px; background: white; border-radius: 8px; border-left: 4px solid #0369a1;">
                  <div style="background: #0369a1; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 15px; font-size: 12px;">4</div>
                  <span style="color: #374151;">Ensure compliance with correctional regulations</span>
                </div>
              </div>
            </div>

            <!-- CTA Button -->
            <div style="text-align: center; margin: 30px 0;">
              <a href="http://localhost:5174/login" style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; text-decoration: none; padding: 15px 40px; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3); transition: all 0.3s ease;">
                🏛️ Access Warden Portal
              </a>
            </div>

            <!-- Support Section -->
            <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; text-align: center; margin-top: 30px;">
              <p style="color: #64748b; margin: 0 0 10px 0; font-size: 14px;">
                Need assistance? Technical support is available 24/7 for wardens.
              </p>
              <p style="color: #475569; margin: 0; font-size: 14px;">
                Contact the system administrator or IT support team immediately.
              </p>
            </div>
          </div>

          <!-- Footer -->
          <div style="background: #1f2937; color: #9ca3af; padding: 25px 20px; text-align: center;">
            <div style="margin-bottom: 15px;">
              <div style="font-size: 24px; margin-bottom: 8px;">🏛️</div>
              <h4 style="margin: 0; color: #f9fafb; font-size: 18px;">Prison Management System</h4>
              <p style="margin: 5px 0 0 0; font-size: 14px;">Secure Correctional Facility Management</p>
            </div>

            <div style="border-top: 1px solid #374151; padding-top: 15px; font-size: 12px;">
              <p style="margin: 0;">© 2025 Prison Management System. All rights reserved.</p>
              <p style="margin: 5px 0 0 0;">This is a confidential communication. Unauthorized access is prohibited.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    // Create ATTRACTIVE plain text version
    const plainTextMessage = `
═══════════════════════════════════════════════════════════════
🏛️ PRISON MANAGEMENT SYSTEM - WARDEN ACCESS 🏛️
═══════════════════════════════════════════════════════════════

🔐 WARDEN ACCESS CREDENTIALS: ${generatedPassword}
═══════════════════════════════════════════════════════════════

Welcome Warden ${wardenData.name}! 🎖️

You have been appointed as a Warden in our Prison Management System.
Your leadership and oversight are crucial for maintaining security and order.

🔐 WARDEN ACCESS PORTAL:
───────────────────────────────────────────────────────────────
Email:    ${wardenData.email}
Password: ${generatedPassword}
Portal:   http://localhost:5174/login

⚠  SECURITY PROTOCOL: This password grants high-level access.
    Change it immediately after first login and never share it.

👤 WARDEN PROFILE:
───────────────────────────────────────────────────────────────
Name:       ${wardenData.name}
Email:      ${wardenData.email}
Phone:      ${wardenData.phone || 'Not provided'}
Role:       Warden
Department: ${wardenData.department || 'Correctional Services'}
Facility:   ${wardenData.facility || 'Main Facility'}

🛡️ WARDEN RESPONSIBILITIES:
───────────────────────────────────────────────────────────────
1. Oversee daily prison operations and security protocols
2. Manage prisoner records and behavioral reports
3. Coordinate with staff and handle visitor management
4. Ensure compliance with correctional regulations

💡 NEED ASSISTANCE?
───────────────────────────────────────────────────────────────
Technical support is available 24/7 for wardens.
Contact the system administrator or IT support team immediately.

═══════════════════════════════════════════════════════════════
🏛️ Prison Management System
Secure Correctional Facility Management

© 2025 Prison Management System. All rights reserved.
This is a confidential communication. Unauthorized access is prohibited.
═══════════════════════════════════════════════════════════════
    `;

    // Send the email with both HTML and plain text
    const result = await transporter.sendMail({
      from: `"Prison Management System" <${process.env.EMAIL_USER}>`,
      to: wardenData.email,
      subject: `🔐 Warden Access Credentials: ${generatedPassword} - Welcome ${wardenData.name}`,
      html: welcomeMessage,
      text: plainTextMessage
    });

    console.log(`✅ Warden welcome email sent successfully to: ${wardenData.email}`);
    console.log('Email message ID:', result.messageId);

    return {
      success: true,
      message: 'Warden welcome email sent successfully',
      messageId: result.messageId
    };

  } catch (error) {
    console.error('❌ Failed to send warden welcome email:', error);
    return {
      success: false,
      message: 'Failed to send warden welcome email',
      error: error.message
    };
  }
};

// Test email configuration
const testEmailConfig = async () => {
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    try {
      const transporter = createEmailTransporter();
      await transporter.verify();
      console.log('✅ Warden email configuration is valid and ready');
      return true;
    } catch (error) {
      console.error('❌ Warden email configuration test failed:', error.message);
      return false;
    }
  } else {
    console.log('⚠ Warden email configuration not found in environment variables');
    return false;
  }
};

module.exports = {
  sendWardenWelcomeEmail,
  testEmailConfig,
  createEmailTransporter
};

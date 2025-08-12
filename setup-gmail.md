# Gmail SMTP Setup Guide

To send real emails to Gmail, you need to set up an App Password. Follow these steps:

## Step 1: Enable 2-Factor Authentication

1. Go to your Google Account: https://myaccount.google.com/
2. Click on "Security" in the left sidebar
3. Under "Signing in to Google", click "2-Step Verification"
4. Follow the prompts to enable 2-Step Verification if not already enabled

## Step 2: Generate App Password

1. Go to Google Account Security: https://myaccount.google.com/security
2. Under "Signing in to Google", click "2-Step Verification"
3. Scroll down and click "App passwords"
4. Select "Mail" from the dropdown
5. Click "Generate"
6. Copy the 16-character password (it will look like: abcd efgh ijkl mnop)

## Step 3: Update .env File

1. Open `backend/.env` file
2. Replace the EMAIL_PASS value with your generated app password:
   ```
   EMAIL_USER=aleenaannaalex2026@mca.ajce.in
   EMAIL_PASS=abcd efgh ijkl mnop
   ```
   (Replace "abcd efgh ijkl mnop" with your actual app password)

## Step 4: Restart Server

1. Stop the backend server (Ctrl+C)
2. Start it again: `npm run dev`
3. Look for "✅ Gmail SMTP connection verified successfully" in the console

## Step 5: Test

1. Go to http://localhost:5173/forgot-password
2. Enter your email: aleenaannaalex2026@mca.ajce.in
3. Click "Send Reset Link"
4. Check your Gmail inbox for the reset email

## Troubleshooting

If you see "❌ Gmail SMTP connection failed":
- Make sure 2-Factor Authentication is enabled
- Double-check your app password (no spaces)
- Make sure you're using the app password, not your regular Gmail password
- Try generating a new app password

## Security Note

- Never share your app password
- The app password is specific to this application
- You can revoke it anytime from Google Account settings

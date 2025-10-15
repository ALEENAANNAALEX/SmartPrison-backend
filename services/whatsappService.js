// whatsappService.js
// Uses Twilio API to send WhatsApp messages
const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM; // e.g. 'whatsapp:+14155238886'
const client = twilio(accountSid, authToken);

async function sendWhatsApp(to, message) {
  if (!accountSid || !authToken || !whatsappFrom) {
    console.error('Twilio WhatsApp credentials missing');
    return;
  }
  try {
    await client.messages.create({
      from: whatsappFrom,
      to: `whatsapp:${to}`,
      body: message
    });
    console.log('WhatsApp message sent to', to);
  } catch (err) {
    console.error('Failed to send WhatsApp:', err.message);
  }
}

module.exports = { sendWhatsApp };
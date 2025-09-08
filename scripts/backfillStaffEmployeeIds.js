// Backfill script: set staff employeeId in Details to sequential S001, S002, ... for staff without correct ID
// Usage: node backend/scripts/backfillStaffEmployeeIds.js
require('dotenv').config();
const mongoose = require('mongoose');

const Details = require('../models/Details');

async function connect() {
  const uri = process.env.MONGO_URL || 'mongodb://localhost:27017/mern_prison';
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
}

function formatId(n) {
  return 'S' + String(n).padStart(3, '0');
}

async function run() {
  try {
    await connect();
    console.log('Connected to Mongo');

    // Load all staff Details
    const staffDocs = await Details.find({ userRole: 'staff' })
      .select('roleSpecificDetails.staffDetails.employeeId createdAt')
      .sort({ createdAt: 1 }); // oldest first for stable assignment

    // Determine current max numeric in existing formatted IDs
    let maxNum = 0;
    const regex = /^S(\d{3,})$/;

    for (const d of staffDocs) {
      const id = d?.roleSpecificDetails?.staffDetails?.employeeId || '';
      const m = id.match(regex);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxNum) maxNum = n;
      }
    }

    let updated = 0;
    for (const d of staffDocs) {
      const currentId = d?.roleSpecificDetails?.staffDetails?.employeeId || '';
      if (!regex.test(currentId)) {
        maxNum += 1;
        const newId = formatId(maxNum);
        await Details.updateOne(
          { _id: d._id },
          { $set: { 'roleSpecificDetails.staffDetails.employeeId': newId } }
        );
        updated += 1;
        console.log(`Updated ${d._id} -> ${newId}`);
      }
    }

    console.log(`Done. Updated ${updated} staff IDs.`);
  } catch (e) {
    console.error('Backfill error:', e);
  } finally {
    await mongoose.disconnect();
  }
}

run();
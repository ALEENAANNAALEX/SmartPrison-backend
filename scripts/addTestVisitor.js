const mongoose = require('mongoose');
const Prisoner = require('../models/Prisoner');
const PrisonBlock = require('../models/PrisonBlock');

// Connect to MongoDB
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mern_prison';
mongoose.connect(mongoUri);

async function addTestVisitor() {
  try {
    // Find a block to assign the prisoner to
    const block = await PrisonBlock.findOne({ isActive: true });
    if (!block) {
      console.log('❌ No active blocks found. Please create a block first.');
      return;
    }

    // Generate a unique prisoner number
    const lastPrisoner = await Prisoner.findOne({}, {}, { sort: { 'prisonerNumber': -1 } });
    let nextNumber = 1;
    if (lastPrisoner && lastPrisoner.prisonerNumber) {
      const match = lastPrisoner.prisonerNumber.match(/(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }
    const prisonerNumber = `P${String(nextNumber).padStart(4, '0')}`;

    // Create a test prisoner with Aleena Anna Alex as emergency contact
    const testPrisoner = new Prisoner({
      prisonerNumber,
      firstName: 'Test',
      lastName: 'Prisoner',
      dateOfBirth: new Date('1990-01-01'),
      gender: 'male',
      currentBlock: block._id,
      cellNumber: 'A-101',
      status: 'active',
      emergencyContacts: [{
        name: 'Aleena Anna Alex',
        relationship: 'sister',
        phone: '9876543210',
        address: 'Test Address, Test City, Test State'
      }]
    });

    await testPrisoner.save();
    console.log('✅ Test prisoner created with Aleena Anna Alex as emergency contact');
    console.log(`📋 Prisoner Number: ${prisonerNumber}`);
    console.log(`📋 Prisoner Name: ${testPrisoner.firstName} ${testPrisoner.lastName}`);
    console.log(`📋 Emergency Contact: ${testPrisoner.emergencyContacts[0].name}`);
    console.log(`📋 Relationship: ${testPrisoner.emergencyContacts[0].relationship}`);
    
  } catch (error) {
    console.error('❌ Error creating test prisoner:', error);
  } finally {
    mongoose.connection.close();
  }
}

addTestVisitor();

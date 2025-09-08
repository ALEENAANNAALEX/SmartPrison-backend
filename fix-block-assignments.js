/**
 * Script to fix existing block assignments
 * This script syncs the User.wardenDetails.assignedBlocks with PrisonBlock.assignedWardens
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const User = require('./models/User');
const PrisonBlock = require('./models/PrisonBlock');

async function fixBlockAssignments() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/prison-management', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('🔗 Connected to MongoDB');
    
    // Get all wardens with assigned blocks
    const wardens = await User.find({ 
      role: 'warden',
      'wardenDetails.assignedBlocks': { $exists: true, $ne: [] }
    }).populate('wardenDetails.assignedBlocks', 'name blockCode');
    
    console.log(`📋 Found ${wardens.length} wardens with assigned blocks`);
    
    // First, clear all assignedWardens from blocks
    await PrisonBlock.updateMany({}, { $set: { assignedWardens: [] } });
    console.log('🧹 Cleared all assignedWardens from blocks');
    
    // Then, update blocks based on warden assignments
    for (const warden of wardens) {
      const assignedBlockIds = warden.wardenDetails.assignedBlocks.map(block => block._id);
      
      if (assignedBlockIds.length > 0) {
        await PrisonBlock.updateMany(
          { _id: { $in: assignedBlockIds } },
          { $addToSet: { assignedWardens: warden._id } }
        );
        
        console.log(`✅ Updated blocks for warden ${warden.name}:`, 
          warden.wardenDetails.assignedBlocks.map(b => b.name).join(', '));
      }
    }
    
    // Verify the fix
    console.log('\n🔍 Verification:');
    
    const allBlocks = await PrisonBlock.find().populate('assignedWardens', 'name');
    const allocatedBlocks = allBlocks.filter(block => block.assignedWardens.length > 0);
    const unallocatedBlocks = allBlocks.filter(block => block.assignedWardens.length === 0);
    
    console.log(`📊 Total blocks: ${allBlocks.length}`);
    console.log(`📊 Allocated blocks: ${allocatedBlocks.length}`);
    console.log(`📊 Unallocated blocks: ${unallocatedBlocks.length}`);
    
    console.log('\n📋 Allocated blocks:');
    allocatedBlocks.forEach(block => {
      console.log(`   - ${block.name} (${block.blockCode}): ${block.assignedWardens.map(w => w.name).join(', ')}`);
    });
    
    console.log('\n📋 Unallocated blocks:');
    unallocatedBlocks.forEach(block => {
      console.log(`   - ${block.name} (${block.blockCode})`);
    });
    
    console.log('\n🎉 Block assignments fixed successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the fix
fixBlockAssignments();

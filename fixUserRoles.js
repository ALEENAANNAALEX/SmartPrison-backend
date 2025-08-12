const mongoose = require('mongoose');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/prison-visit-system');
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

// Fix user roles
const fixUserRoles = async () => {
  try {
    console.log('🔍 Checking current users...');
    
    // Get the users collection directly
    const db = mongoose.connection.db;
    const users = db.collection('users');
    
    // Find all users
    const allUsers = await users.find({}).toArray();
    console.log(`📊 Found ${allUsers.length} users in database`);
    
    if (allUsers.length === 0) {
      console.log('ℹ️ No users found in database');
      return;
    }
    
    // Show current users
    console.log('\n👥 Current users:');
    allUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name || 'No name'}`);
      console.log(`   📧 Email: ${user.email}`);
      console.log(`   🎭 Role: ${user.role || 'NO ROLE SET'}`);
      console.log(`   🔐 Auth: ${user.authProvider || 'local'}`);
      console.log('');
    });
    
    // Update users without roles
    console.log('🔧 Updating users without roles...');
    
    let updateCount = 0;
    
    for (const user of allUsers) {
      if (!user.role) {
        let newRole = 'user';
        
        // Keep admin@gmail.com as admin
        if (user.email === 'admin@gmail.com') {
          newRole = 'admin';
        }
        
        const result = await users.updateOne(
          { _id: user._id },
          { $set: { role: newRole } }
        );
        
        if (result.modifiedCount > 0) {
          console.log(`✅ Updated ${user.email} → role: ${newRole}`);
          updateCount++;
        }
      } else {
        console.log(`ℹ️ ${user.email} already has role: ${user.role}`);
      }
    }
    
    console.log(`\n🎉 Updated ${updateCount} users with roles!`);
    
    // Verify the updates
    console.log('\n📋 Final verification:');
    const updatedUsers = await users.find({}).toArray();
    
    updatedUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name || 'No name'}`);
      console.log(`   📧 Email: ${user.email}`);
      console.log(`   🎭 Role: ${user.role || 'STILL NO ROLE'}`);
      console.log(`   🔐 Auth: ${user.authProvider || 'local'}`);
      console.log('');
    });
    
    // Role statistics
    const roleStats = {};
    updatedUsers.forEach(user => {
      const role = user.role || 'NO ROLE';
      roleStats[role] = (roleStats[role] || 0) + 1;
    });
    
    console.log('📊 Role Statistics:');
    Object.entries(roleStats).forEach(([role, count]) => {
      console.log(`   ${role}: ${count} users`);
    });
    
  } catch (error) {
    console.error('❌ Error fixing user roles:', error);
  } finally {
    mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
};

// Run the fix
const main = async () => {
  await connectDB();
  await fixUserRoles();
};

main();

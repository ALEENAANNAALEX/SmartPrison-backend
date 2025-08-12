const mongoose = require('mongoose');

// Simple User schema for updating roles
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: false },
  role: {
    type: String,
    enum: ['user', 'admin', 'warden', 'staff'],
    default: 'user'
  },
  authProvider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },
  supabaseId: { type: String, unique: true, sparse: true },
  profilePicture: { type: String },
  emailVerified: { type: Boolean, default: false },
  phoneNumber: { type: String },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

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

// Update user roles
const updateUserRoles = async () => {
  try {
    console.log('🔍 Finding users without roles...');
    
    // Find all users without a role or with null/undefined role
    const usersWithoutRole = await User.find({
      $or: [
        { role: { $exists: false } },
        { role: null },
        { role: undefined },
        { role: '' }
      ]
    });
    
    console.log(`📊 Found ${usersWithoutRole.length} users without roles`);
    
    if (usersWithoutRole.length === 0) {
      console.log('✅ All users already have roles assigned!');
      return;
    }
    
    // Update each user to have 'user' role (except admin@gmail.com)
    for (const user of usersWithoutRole) {
      let newRole = 'user';
      
      // Keep admin@gmail.com as admin
      if (user.email === 'admin@gmail.com') {
        newRole = 'admin';
      }
      
      await User.updateOne(
        { _id: user._id },
        { $set: { role: newRole } }
      );
      
      console.log(`✅ Updated ${user.email} → role: ${newRole}`);
    }
    
    console.log('🎉 All user roles updated successfully!');
    
    // Verify the updates
    console.log('\n📋 Final role summary:');
    const roleStats = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 },
          users: { $push: '$email' }
        }
      }
    ]);
    
    roleStats.forEach(stat => {
      console.log(`👥 ${stat._id}: ${stat.count} users`);
      stat.users.forEach(email => {
        console.log(`   - ${email}`);
      });
    });
    
  } catch (error) {
    console.error('❌ Error updating user roles:', error);
  } finally {
    mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
};

// Run the update
const main = async () => {
  await connectDB();
  await updateUserRoles();
};

main();

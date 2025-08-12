const mongoose = require('mongoose');

// Simple User schema for checking roles
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

// Check user roles
const checkUserRoles = async () => {
  try {
    console.log('📋 Current user roles in database:\n');
    
    // Get all users with their roles
    const users = await User.find({}, 'name email role authProvider createdAt').sort({ createdAt: 1 });
    
    console.log(`👥 Total users: ${users.length}\n`);
    
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name}`);
      console.log(`   📧 Email: ${user.email}`);
      console.log(`   🎭 Role: ${user.role || 'NO ROLE SET'}`);
      console.log(`   🔐 Auth: ${user.authProvider || 'local'}`);
      console.log(`   📅 Created: ${user.createdAt.toLocaleDateString()}`);
      console.log('');
    });
    
    // Get role statistics
    console.log('📊 Role Statistics:');
    const roleStats = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);
    
    roleStats.forEach(stat => {
      const roleName = stat._id || 'NO ROLE';
      console.log(`   ${roleName}: ${stat.count} users`);
    });
    
    // Check for users without roles
    const usersWithoutRole = await User.find({
      $or: [
        { role: { $exists: false } },
        { role: null },
        { role: undefined },
        { role: '' }
      ]
    });
    
    if (usersWithoutRole.length > 0) {
      console.log(`\n⚠️ Found ${usersWithoutRole.length} users without roles:`);
      usersWithoutRole.forEach(user => {
        console.log(`   - ${user.email}`);
      });
    } else {
      console.log('\n✅ All users have roles assigned!');
    }
    
  } catch (error) {
    console.error('❌ Error checking user roles:', error);
  } finally {
    mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
};

// Run the check
const main = async () => {
  await connectDB();
  await checkUserRoles();
};

main();

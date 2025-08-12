const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

async function createAdminInCorrectDB() {
  const client = new MongoClient('mongodb://localhost:27017');
  
  try {
    console.log('🔌 Connecting to MongoDB...');
    await client.connect();
    
    const db = client.db('mern_prison'); // Use the correct database
    const users = db.collection('users');
    
    console.log('🗑️ Removing existing admin...');
    await users.deleteMany({ email: 'admin@gmail.com' });
    
    console.log('🔐 Creating password hash...');
    const hashedPassword = await bcrypt.hash('admin@123', 10);
    
    console.log('👤 Creating admin user...');
    const adminUser = {
      name: 'System Administrator',
      email: 'admin@gmail.com',
      password: hashedPassword,
      role: 'admin',
      authProvider: 'local',
      emailVerified: true,
      createdAt: new Date(),
      lastLogin: new Date()
    };
    
    const result = await users.insertOne(adminUser);
    console.log('✅ Admin user created!');
    console.log('🆔 ID:', result.insertedId);
    
    // Verify creation
    const verifyAdmin = await users.findOne({ email: 'admin@gmail.com' });
    if (verifyAdmin) {
      console.log('✅ Verification successful!');
      console.log('📧 Email:', verifyAdmin.email);
      console.log('👤 Role:', verifyAdmin.role);
      console.log('🔐 Has password:', !!verifyAdmin.password);
      
      // Test password
      const isMatch = await bcrypt.compare('admin@123', verifyAdmin.password);
      console.log('🔑 Password test:', isMatch ? 'PASS ✅' : 'FAIL ❌');
    }
    
    // Show all users in the database
    console.log('\n📋 All users in mern_prison database:');
    const allUsers = await users.find({}).toArray();
    allUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name}`);
      console.log(`   📧 Email: ${user.email}`);
      console.log(`   🎭 Role: ${user.role}`);
      console.log(`   🔐 Auth: ${user.authProvider}`);
      console.log('');
    });
    
    console.log('\n🎯 Admin Login Credentials:');
    console.log('📧 Email: admin@gmail.com');
    console.log('🔑 Password: admin@123');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('🔌 Database connection closed');
  }
}

createAdminInCorrectDB();

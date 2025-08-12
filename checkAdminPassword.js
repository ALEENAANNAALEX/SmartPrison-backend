const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

async function checkAndFixAdminPassword() {
  const client = new MongoClient('mongodb://localhost:27017');
  
  try {
    console.log('🔌 Connecting to MongoDB...');
    await client.connect();
    
    const db = client.db('mern_prison');
    const users = db.collection('users');
    
    // Check admin@prison.gov account
    console.log('🔍 Checking admin@prison.gov account...');
    const prisonAdmin = await users.findOne({ email: 'admin@prison.gov' });
    
    if (prisonAdmin) {
      console.log('✅ Found admin@prison.gov account');
      console.log('👤 Name:', prisonAdmin.name);
      console.log('🎭 Role:', prisonAdmin.role);
      console.log('🔐 Has password:', !!prisonAdmin.password);
      
      // Test common passwords
      const commonPasswords = ['admin', 'admin123', 'admin@123', 'password', 'prison123'];
      let passwordFound = false;
      
      for (const testPassword of commonPasswords) {
        if (prisonAdmin.password) {
          const isMatch = await bcrypt.compare(testPassword, prisonAdmin.password);
          if (isMatch) {
            console.log(`🔑 Password found: "${testPassword}"`);
            passwordFound = true;
            break;
          }
        }
      }
      
      if (!passwordFound) {
        console.log('❌ Password not found in common passwords');
        console.log('🔧 Setting password to "admin123"...');
        
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await users.updateOne(
          { email: 'admin@prison.gov' },
          { $set: { password: hashedPassword } }
        );
        
        console.log('✅ Password updated successfully!');
        console.log('🎯 Login credentials for admin@prison.gov:');
        console.log('📧 Email: admin@prison.gov');
        console.log('🔑 Password: admin123');
      }
    } else {
      console.log('❌ admin@prison.gov account not found');
    }
    
    // Also show both admin accounts
    console.log('\n📋 All admin accounts:');
    const adminUsers = await users.find({ role: 'admin' }).toArray();
    adminUsers.forEach((admin, index) => {
      console.log(`${index + 1}. ${admin.name}`);
      console.log(`   📧 Email: ${admin.email}`);
      console.log(`   🔐 Has password: ${!!admin.password}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('🔌 Database connection closed');
  }
}

checkAndFixAdminPassword();

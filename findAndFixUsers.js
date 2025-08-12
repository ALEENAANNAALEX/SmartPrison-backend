const { MongoClient } = require('mongodb');

async function findAndFixUsers() {
  const client = new MongoClient('mongodb://localhost:27017');
  
  try {
    console.log('🔌 Connecting to MongoDB...');
    await client.connect();
    
    // List all databases
    const adminDb = client.db().admin();
    const databases = await adminDb.listDatabases();
    
    console.log('📋 Available databases:');
    databases.databases.forEach(db => {
      console.log(`   - ${db.name}`);
    });
    
    // Check the prison-visit-system database
    const db = client.db('prison-visit-system');
    const collections = await db.listCollections().toArray();
    
    console.log('\n📋 Collections in prison-visit-system:');
    collections.forEach(collection => {
      console.log(`   - ${collection.name}`);
    });
    
    // Try to find users in the users collection
    const users = db.collection('users');
    const userCount = await users.countDocuments();
    console.log(`\n👥 Users in 'users' collection: ${userCount}`);
    
    if (userCount > 0) {
      const allUsers = await users.find({}).toArray();
      
      console.log('\n👥 Current users:');
      allUsers.forEach((user, index) => {
        console.log(`${index + 1}. ${user.name || 'No name'}`);
        console.log(`   📧 Email: ${user.email}`);
        console.log(`   🎭 Role: ${user.role || 'NO ROLE SET'}`);
        console.log(`   🔐 Auth: ${user.authProvider || 'local'}`);
        console.log(`   🆔 ID: ${user._id}`);
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
    }
    
    // Also check if there might be users in other collections
    for (const collection of collections) {
      if (collection.name !== 'users' && !collection.name.startsWith('system.')) {
        const coll = db.collection(collection.name);
        const count = await coll.countDocuments();
        if (count > 0) {
          console.log(`\n🔍 Found ${count} documents in '${collection.name}' collection`);
          
          // Check if this collection might contain user data
          const sample = await coll.findOne({});
          if (sample && (sample.email || sample.name)) {
            console.log(`   📧 Sample document has email/name - might be users!`);
            console.log(`   📄 Sample:`, JSON.stringify(sample, null, 2));
          }
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('\n🔌 Database connection closed');
  }
}

findAndFixUsers();

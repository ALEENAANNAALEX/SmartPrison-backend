const { MongoClient } = require('mongodb');

async function checkAllDatabases() {
  const client = new MongoClient('mongodb://localhost:27017');
  
  try {
    console.log('🔌 Connecting to MongoDB...');
    await client.connect();
    
    // List all databases
    const adminDb = client.db().admin();
    const databases = await adminDb.listDatabases();
    
    console.log('📋 Checking all databases for users...\n');
    
    for (const database of databases.databases) {
      if (database.name === 'admin' || database.name === 'config' || database.name === 'local') {
        continue; // Skip system databases
      }
      
      console.log(`🔍 Checking database: ${database.name}`);
      const db = client.db(database.name);
      
      try {
        const collections = await db.listCollections().toArray();
        console.log(`   📋 Collections: ${collections.map(c => c.name).join(', ')}`);
        
        // Check each collection for user-like data
        for (const collection of collections) {
          if (collection.name.startsWith('system.')) continue;
          
          const coll = db.collection(collection.name);
          const count = await coll.countDocuments();
          
          if (count > 0) {
            console.log(`   📊 ${collection.name}: ${count} documents`);
            
            // Get a sample document to see if it looks like user data
            const sample = await coll.findOne({});
            if (sample && (sample.email || sample.name)) {
              console.log(`   👤 Found user-like data in ${collection.name}!`);
              
              // Get all documents if it's a small collection
              if (count <= 10) {
                const allDocs = await coll.find({}).toArray();
                allDocs.forEach((doc, index) => {
                  console.log(`      ${index + 1}. ${doc.name || 'No name'}`);
                  console.log(`         📧 Email: ${doc.email || 'No email'}`);
                  console.log(`         🎭 Role: ${doc.role || 'NO ROLE SET'}`);
                  console.log(`         🔐 Auth: ${doc.authProvider || 'No auth provider'}`);
                  console.log(`         🆔 ID: ${doc._id}`);
                  console.log('');
                });
                
                // Update users without roles in this collection
                console.log(`   🔧 Updating users without roles in ${database.name}.${collection.name}...`);
                
                let updateCount = 0;
                for (const doc of allDocs) {
                  if (!doc.role && doc.email) {
                    let newRole = 'user';
                    
                    // Keep admin@gmail.com as admin
                    if (doc.email === 'admin@gmail.com') {
                      newRole = 'admin';
                    }
                    
                    const result = await coll.updateOne(
                      { _id: doc._id },
                      { $set: { role: newRole } }
                    );
                    
                    if (result.modifiedCount > 0) {
                      console.log(`      ✅ Updated ${doc.email} → role: ${newRole}`);
                      updateCount++;
                    }
                  }
                }
                
                if (updateCount > 0) {
                  console.log(`   🎉 Updated ${updateCount} users in ${database.name}.${collection.name}!`);
                  
                  // Show updated data
                  console.log(`   📋 Updated users:`);
                  const updatedDocs = await coll.find({}).toArray();
                  updatedDocs.forEach((doc, index) => {
                    console.log(`      ${index + 1}. ${doc.name || 'No name'}`);
                    console.log(`         📧 Email: ${doc.email || 'No email'}`);
                    console.log(`         🎭 Role: ${doc.role || 'STILL NO ROLE'}`);
                    console.log(`         🔐 Auth: ${doc.authProvider || 'No auth provider'}`);
                    console.log('');
                  });
                }
              } else {
                console.log(`      📄 Sample document:`, JSON.stringify(sample, null, 2));
              }
            }
          }
        }
      } catch (error) {
        console.log(`   ❌ Error checking ${database.name}: ${error.message}`);
      }
      
      console.log(''); // Empty line between databases
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('🔌 Database connection closed');
  }
}

checkAllDatabases();

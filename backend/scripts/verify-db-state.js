const mongoose = require('mongoose');
require('dotenv').config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  
  const guestUsers = await db.collection('users').countDocuments({ 
    email: { $regex: /^guest_.*@linksphere\.internal$/ } 
  });
  
  const totalUsers = await db.collection('users').countDocuments({});
  
  const anonymousUrls = await db.collection('urls').countDocuments({ owner: null });
  
  const ownedUrls = await db.collection('urls').countDocuments({ owner: { $ne: null } });
  
  console.log('=== DATABASE STATE VERIFICATION ===');
  console.log('');
  console.log('Guest users (guest_*@linksphere.internal):', guestUsers);
  console.log('Total users:', totalUsers);
  console.log('');
  console.log('Anonymous URLs (owner: null):', anonymousUrls);
  console.log('Owned URLs (owner: user):', ownedUrls);
  console.log('');
  console.log(guestUsers === 0 ? '✓ PASS: No guest users created' : '✗ FAIL: Guest users exist');
  
  await mongoose.connection.close();
}

check().catch(e => console.error('ERROR:', e.message));

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { sequelize, initDatabase } = require('../config/database');
const User = require('../modules/user/user.model');

const usersToImport = [
  {
    id: 1,
    name: 'Test User',
    role: 'USER',
    fullAddress: '104, Sunrise Complex, Navrangpura',
    state: 'Gujarat',
    city: 'Ahmedabad',
    area: 'Navrangpura',
    pincode: '380009',
    contactNumber: '9876543210',
    email: 'rajesh.sharma@example.com',
    createdAt: '2026-09-29 08:20:00',
    updatedAt: '2026-09-30 08:16:41',
    status: 'ACTIVE',
    gstNumber: '24TEST123456789',
    aadhaar_number: '24TEST123456789',
    password: null
  },
  {
    id: 2,
    name: 'Pooja Kulkarni (Inter-state Client)',
    role: 'USER',
    fullAddress: '5th Floor, Trade Center, BKC',
    state: 'Maharashtra',
    city: 'Mumbai',
    area: 'Bandra Kurla Complex',
    pincode: '400051',
    contactNumber: '+91 98200 44556',
    email: 'pooja.k@example.com',
    createdAt: '2026-09-29 08:20:00',
    updatedAt: '2026-09-29 08:20:00',
    status: 'ACTIVE',
    gstNumber: '',
    aadhaar_number: null,
    password: null
  },
  {
    id: 3,
    name: 'Arun Verma (System Admin)',
    role: 'ADMIN',
    fullAddress: 'Corporate Office HQ, Sector 5',
    state: 'Gujarat',
    city: 'Gandhinagar',
    area: 'Sector 5',
    pincode: '382005',
    contactNumber: '+91 98980 99887',
    email: 'admin@namamienterprises.com',
    createdAt: '2026-09-29 08:20:00',
    updatedAt: '2026-09-30 11:09:15',
    status: 'ACTIVE',
    gstNumber: '',
    aadhaar_number: null,
    password: '$2b$10$DY3RdoHn6KBXSHohHFPDF.DSuler5wM5IEQrkCA0zC/7WnYHnoaLK'
  },
  {
    id: 4,
    name: 'kapil',
    role: 'USER',
    fullAddress: 'Kalta Road',
    state: 'Uttar Pradesh',
    city: 'Lucknow',
    area: 'Lucknow',
    pincode: '226028',
    contactNumber: '8965478965',
    email: 'kapil@gmail.com',
    createdAt: '2026-09-29 11:28:30',
    updatedAt: '2026-09-29 11:28:30',
    status: 'ACTIVE',
    gstNumber: '',
    aadhaar_number: null,
    password: null
  }
];

async function importUsers() {
  try {
    await initDatabase();
    // Ensure table matches model (adds aadhaar_number column if missing)
    await sequelize.sync({ alter: true });

    for (const userData of usersToImport) {
      const existing = await User.findByPk(userData.id);
      if (existing) {
        await existing.update(userData);
        console.log(`🔄 Updated user ID ${userData.id} (${userData.name})`);
      } else {
        await User.create(userData);
        console.log(`✅ Inserted user ID ${userData.id} (${userData.name})`);
      }
    }

    // Adjust auto_increment in MySQL to follow maximum imported ID
    try {
      await sequelize.query('ALTER TABLE users AUTO_INCREMENT = 5;');
    } catch (e) {
      // Non-critical if dialect doesn't support
    }

    console.log('\n🎉 Successfully imported all users into the users table!\n');
    const allUsers = await User.findAll({ raw: true });
    console.log('Current users in DB:', allUsers);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error importing users:', error);
    process.exit(1);
  }
}

importUsers();

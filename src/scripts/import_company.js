const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { sequelize, initDatabase } = require('../config/database');
const Setting = require('../modules/setting/setting.model');

const companyData = {
  id: 1,
  company_name: 'Goldie Sethi Seena Sethi',
  address: 'Plot No. 42, GIDC Phase 2, Industrial Estate, SG Highway',
  state: 'Uttar Pradesh',
  city: 'Lucknow',
  pincode: '380015',
  mobile: '+91 98765 43210',
  gst_number: '24AAACN1234F1Z8',
  hsn_number: 'HSA-789012',
  email: 'accounts@namamienterprises.com',
  bank_name: 'HDFC Bank Ltd',
  account_number: '50200012345678',
  ifsc_code: 'HDFC0001234',
  account_holder_name: 'Goldie Sethi Seena Sethi',
  created_at: '2026-09-29 08:20:00',
  updated_at: '2026-09-29 11:26:47'
};

async function importCompany() {
  try {
    await initDatabase();

    // 1. Ensure `companies` table exists in the database
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`companies\` (
        \`id\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        \`company_name\` VARCHAR(255) NOT NULL,
        \`address\` TEXT,
        \`state\` VARCHAR(255),
        \`city\` VARCHAR(255),
        \`pincode\` VARCHAR(50),
        \`mobile\` VARCHAR(50),
        \`gst_number\` VARCHAR(50),
        \`hsn_number\` VARCHAR(50),
        \`email\` VARCHAR(255),
        \`bank_name\` VARCHAR(255),
        \`account_number\` VARCHAR(100),
        \`ifsc_code\` VARCHAR(50),
        \`account_holder_name\` VARCHAR(255),
        \`created_at\` DATETIME,
        \`updated_at\` DATETIME
      );
    `);

    // 2. Insert into `companies` table
    await sequelize.query(`
      INSERT INTO \`companies\` (
        \`id\`,
        \`company_name\`,
        \`address\`,
        \`state\`,
        \`city\`,
        \`pincode\`,
        \`mobile\`,
        \`gst_number\`,
        \`hsn_number\`,
        \`email\`,
        \`bank_name\`,
        \`account_number\`,
        \`ifsc_code\`,
        \`account_holder_name\`,
        \`created_at\`,
        \`updated_at\`
      ) VALUES (
        :id,
        :company_name,
        :address,
        :state,
        :city,
        :pincode,
        :mobile,
        :gst_number,
        :hsn_number,
        :email,
        :bank_name,
        :account_number,
        :ifsc_code,
        :account_holder_name,
        :created_at,
        :updated_at
      )
      ON DUPLICATE KEY UPDATE
        \`company_name\` = VALUES(\`company_name\`),
        \`address\` = VALUES(\`address\`),
        \`state\` = VALUES(\`state\`),
        \`city\` = VALUES(\`city\`),
        \`pincode\` = VALUES(\`pincode\`),
        \`mobile\` = VALUES(\`mobile\`),
        \`gst_number\` = VALUES(\`gst_number\`),
        \`hsn_number\` = VALUES(\`hsn_number\`),
        \`email\` = VALUES(\`email\`),
        \`bank_name\` = VALUES(\`bank_name\`),
        \`account_number\` = VALUES(\`account_number\`),
        \`ifsc_code\` = VALUES(\`ifsc_code\`),
        \`account_holder_name\` = VALUES(\`account_holder_name\`),
        \`updated_at\` = VALUES(\`updated_at\`);
    `, {
      replacements: companyData
    });

    console.log(`✅ [Success] Inserted company into \`companies\` table.`);

    // 3. Sync with `settings` table (used by the invoice backend & frontend)
    await sequelize.sync({ alter: true });
    let setting = await Setting.findByPk(1);
    const settingPayload = {
      id: 1,
      companyName: companyData.company_name,
      fullAddress: companyData.address,
      state: companyData.state,
      city: companyData.city,
      pincode: companyData.pincode,
      phoneNo: companyData.mobile,
      gstin: companyData.gst_number,
      hsa: companyData.hsn_number,
      email: companyData.email,
      bankName: companyData.bank_name,
      accountNumber: companyData.account_number,
      ifscCode: companyData.ifsc_code,
      accountHolderName: companyData.account_holder_name,
      createdAt: new Date(companyData.created_at),
      updatedAt: new Date(companyData.updated_at)
    };

    if (setting) {
      await setting.update(settingPayload);
      console.log(`✅ [Success] Updated application settings profile.`);
    } else {
      await Setting.create(settingPayload);
      console.log(`✅ [Success] Created application settings profile.`);
    }

    // Verify
    const [companies] = await sequelize.query('SELECT * FROM `companies` WHERE id = 1');
    console.log('\nVerified `companies` record:', companies[0]);

    const activeSettings = await Setting.findByPk(1);
    console.log('\nVerified `settings` record:', activeSettings.toJSON());

    process.exit(0);
  } catch (error) {
    console.error('❌ Error importing company:', error);
    process.exit(1);
  }
}

importCompany();

const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('USER', 'ADMIN'),
    allowNull: false,
    defaultValue: 'USER'
  },
  fullAddress: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: ''
  },
  state: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: ''
  },
  city: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  gstNumber: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  aadhaar_number: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null
  },
  area: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  pincode: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  contactNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: ''
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  status: {
    type: DataTypes.ENUM('ACTIVE', 'INACTIVE'),
    allowNull: false,
    defaultValue: 'ACTIVE'
  },
  password: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null
  }
}, {
  timestamps: true,
  tableName: 'users'
});

module.exports = User;

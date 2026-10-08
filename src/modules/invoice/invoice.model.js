const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');
const InvoiceItem = require('./invoiceItem.model');
const User = require('../user/user.model');

const Invoice = sequelize.define('Invoice', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  invoiceNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  invoiceDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  dueDate: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  // Snapshot of customer data at time of invoice creation
  customerName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  customerState: {
    type: DataTypes.STRING,
    allowNull: false
  },
  customerCity: {
    type: DataTypes.STRING,
    allowNull: true
  },
  customerAddress: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  customerPhone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  customerEmail: {
    type: DataTypes.STRING,
    allowNull: true
  },
  customerGstin: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  customerStateCode: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },

  // Consignee (Ship to) details
  shippingName: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  shippingAddress: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: ''
  },
  shippingCity: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  shippingState: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  shippingStateCode: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  shippingGstin: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  shippingPhone: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },

  // Dispatch / Transport / Reference metadata fields
  deliveryNote: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  modeTermsOfPayment: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  referenceNoDate: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  otherReferences: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  buyersOrderNo: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  orderDate: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  dispatchDocNo: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  deliveryNoteDate: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  dispatchedThrough: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  destination: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  termsOfDelivery: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: ''
  },
  companyStateCode: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },

  // Snapshot of company data
  companyName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  companyState: {
    type: DataTypes.STRING,
    allowNull: false
  },
  companyAddress: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  companyGstin: {
    type: DataTypes.STRING,
    allowNull: true
  },
  companyPhone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // Tax computation metadata
  isSameState: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  subtotal: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0
  },
  totalCgst: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0
  },
  totalSgst: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0
  },
  totalIgst: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0
  },
  totalTax: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0
  },
  grandTotal: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0
  },
  status: {
    type: DataTypes.ENUM('PAID', 'PENDING', 'CANCELLED', 'INACTIVE'),
    defaultValue: 'PENDING'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  timestamps: true,
  tableName: 'invoices'
});

// Associations
Invoice.hasMany(InvoiceItem, { as: 'items', foreignKey: 'invoiceId', onDelete: 'CASCADE' });
InvoiceItem.belongsTo(Invoice, { foreignKey: 'invoiceId' });
User.hasMany(Invoice, { as: 'invoices', foreignKey: 'userId' });
Invoice.belongsTo(User, { foreignKey: 'userId' });

module.exports = {
  Invoice,
  InvoiceItem
};

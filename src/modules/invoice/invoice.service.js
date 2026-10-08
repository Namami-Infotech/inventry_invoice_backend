const { Op } = require('sequelize');
const { Invoice, InvoiceItem } = require('./invoice.model');
const Setting = require('../setting/setting.model');

const STATE_GST_CODES = {
  'jammu and kashmir': '01',
  'himachal pradesh': '02',
  'punjab': '03',
  'chandigarh': '04',
  'uttarakhand': '05',
  'haryana': '06',
  'delhi': '07',
  'rajasthan': '08',
  'uttar pradesh': '09',
  'bihar': '10',
  'sikkim': '11',
  'arunachal pradesh': '12',
  'nagaland': '13',
  'manipur': '14',
  'mizoram': '15',
  'tripura': '16',
  'meghalaya': '17',
  'assam': '18',
  'west bengal': '19',
  'jharkhand': '20',
  'odisha': '21',
  'chhattisgarh': '22',
  'madhya pradesh': '23',
  'gujarat': '24',
  'daman and diu': '25',
  'dadra and nagar haveli': '26',
  'maharashtra': '27',
  'andhra pradesh': '28',
  'karnataka': '29',
  'goa': '30',
  'lakshadweep': '31',
  'kerala': '32',
  'tamil nadu': '33',
  'puducherry': '34',
  'andaman and nicobar islands': '35',
  'telangana': '36',
  'andhra pradesh (new)': '37',
  'ladakh': '38'
};

function resolveStateCode(stateName, gstin) {
  if (gstin && typeof gstin === 'string' && /^\d{2}/.test(gstin.trim())) {
    return gstin.trim().slice(0, 2);
  }
  if (stateName && typeof stateName === 'string') {
    const key = stateName.trim().toLowerCase();
    return STATE_GST_CODES[key] || '';
  }
  return '';
}

class InvoiceService {
  // Helper method to compute tax for items based on states
  computeItemTax(item, isSameState) {
    const qty = Number(item.qty) || 1;
    const pricePerUnit = Number(item.pricePerUnit) || 0;
    const taxableAmount = Number((qty * pricePerUnit).toFixed(2));
    const gstRate = Number(item.gstRate) || 0;

    let cgstRate = 0;
    let cgstAmount = 0;
    let sgstRate = 0;
    let sgstAmount = 0;
    let igstRate = 0;
    let igstAmount = 0;

    if (isSameState) {
      // Intra-state: Split GST equally into CGST & SGST
      cgstRate = Number((gstRate / 2).toFixed(2));
      sgstRate = Number((gstRate / 2).toFixed(2));
      cgstAmount = Number(((taxableAmount * cgstRate) / 100).toFixed(2));
      sgstAmount = Number(((taxableAmount * sgstRate) / 100).toFixed(2));
    } else {
      // Inter-state: Full GST applies as IGST
      igstRate = gstRate;
      igstAmount = Number(((taxableAmount * igstRate) / 100).toFixed(2));
    }

    const totalTax = Number((cgstAmount + sgstAmount + igstAmount).toFixed(2));
    const totalAmount = Number((taxableAmount + totalTax).toFixed(2));

    return {
      itemId: item.itemId || null,
      itemName: item.itemName || item.name || 'Item',
      hsnSac: item.hsnSac || '',
      qty,
      unit: item.unit || 'Pcs',
      pricePerUnit,
      taxableAmount,
      gstRate,
      cgstRate,
      cgstAmount,
      sgstRate,
      sgstAmount,
      igstRate,
      igstAmount,
      totalAmount
    };
  }

  async generateInvoiceNumber() {
    const year = new Date().getFullYear();
    const count = await Invoice.count();
    const sequence = String(count + 1).padStart(4, '0');
    return `${year}-${sequence}`;
  }

  async getAllInvoices(status = '', search = '') {
    const where = {};

    if (status) {
      where.status = status;
    } else {
      where.status = { [Op.ne]: 'INACTIVE' };
    }

    if (search) {
      where[Op.or] = [
        { invoiceNumber: { [Op.like]: `%${search}%` } },
        { customerName: { [Op.like]: `%${search}%` } },
        { customerState: { [Op.like]: `%${search}%` } },
        { companyState: { [Op.like]: `%${search}%` } }
      ];
    }

    return await Invoice.findAll({
      where,
      include: [{ model: InvoiceItem, as: 'items' }],
      order: [['createdAt', 'DESC']]
    });
  }

  async getInvoiceById(id) {
    return await Invoice.findByPk(id, {
      include: [{ model: InvoiceItem, as: 'items' }]
    });
  }

  async createInvoice(payload) {
    const {
      userId,
      customerName,
      customerState,
      customerCity,
      customerAddress,
      customerPhone,
      customerEmail,
      customerGstin,
      invoiceDate,
      dueDate,
      status,
      notes,
      items = []
    } = payload;

    // Get current company settings
    let setting = await Setting.findOne();
    if (!setting) {
      setting = {
        companyName: '',
        state: '',
        city: '',
        fullAddress: '',
        gstin: '',
        phoneNo: ''
      };
    }

    const companyStateClean = (setting.state || '').trim().toLowerCase();
    const customerStateClean = (customerState || '').trim().toLowerCase();
    const isSameState = Boolean(companyStateClean && customerStateClean && companyStateClean === customerStateClean);

    // Compute all items with tax
    const computedItems = items.map(item => this.computeItemTax(item, isSameState));

    let subtotal = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    for (const item of computedItems) {
      subtotal += item.taxableAmount;
      totalCgst += item.cgstAmount;
      totalSgst += item.sgstAmount;
      totalIgst += item.igstAmount;
    }

    subtotal = Number(subtotal.toFixed(2));
    totalCgst = Number(totalCgst.toFixed(2));
    totalSgst = Number(totalSgst.toFixed(2));
    totalIgst = Number(totalIgst.toFixed(2));
    const totalTax = Number((totalCgst + totalSgst + totalIgst).toFixed(2));
    const grandTotal = Number((subtotal + totalTax).toFixed(2));

    const invoiceNumber = payload.invoiceNumber || await this.generateInvoiceNumber();

    const customerGstinVal = customerGstin || payload.customerGstNumber || '';
    const customerStateCode = payload.customerStateCode || resolveStateCode(customerState, customerGstinVal);
    const companyStateCode = payload.companyStateCode || resolveStateCode(setting.state, setting.gstin);

    // Consignee (Ship to) details - falls back to Bill to if empty
    const shippingName = (payload.shippingName || payload.consigneeName || customerName || 'Customer').trim();
    const shippingAddress = payload.shippingAddress || payload.consigneeAddress || customerAddress || '';
    const shippingCity = payload.shippingCity || payload.consigneeCity || customerCity || '';
    const shippingState = payload.shippingState || payload.consigneeState || customerState || '';
    const shippingGstin = payload.shippingGstin || payload.consigneeGstin || customerGstinVal || '';
    const shippingPhone = payload.shippingPhone || payload.consigneePhone || customerPhone || '';
    const shippingStateCode = payload.shippingStateCode || resolveStateCode(shippingState, shippingGstin);

    const invoice = await Invoice.create({
      invoiceNumber,
      invoiceDate: invoiceDate || new Date(),
      dueDate: dueDate || null,
      userId: userId || null,

      // Buyer (Bill to)
      customerName: customerName || 'Customer',
      customerState: customerState || '',
      customerCity: customerCity || '',
      customerAddress: customerAddress || '',
      customerPhone: customerPhone || '',
      customerEmail: customerEmail || '',
      customerGstin: customerGstinVal,
      customerStateCode,

      // Consignee (Ship to)
      shippingName,
      shippingAddress,
      shippingCity,
      shippingState,
      shippingStateCode,
      shippingGstin,
      shippingPhone,

      // Supplier / Company
      companyName: setting.companyName,
      companyState: setting.state,
      companyAddress: setting.fullAddress,
      companyGstin: setting.gstin,
      companyPhone: setting.phoneNo,
      companyStateCode,

      // Dispatch & Reference Details
      deliveryNote: payload.deliveryNote || '',
      modeTermsOfPayment: payload.modeTermsOfPayment || '',
      referenceNoDate: payload.referenceNoDate || '',
      otherReferences: payload.otherReferences || '',
      buyersOrderNo: payload.buyersOrderNo || '',
      orderDate: payload.orderDate || '',
      dispatchDocNo: payload.dispatchDocNo || '',
      deliveryNoteDate: payload.deliveryNoteDate || '',
      dispatchedThrough: payload.dispatchedThrough || '',
      destination: payload.destination || '',
      termsOfDelivery: payload.termsOfDelivery || '',

      isSameState,
      subtotal,
      totalCgst,
      totalSgst,
      totalIgst,
      totalTax,
      grandTotal,
      status: status || 'PENDING',
      notes: notes || ''
    });

    const invoiceItemsData = computedItems.map(item => ({
      ...item,
      invoiceId: invoice.id
    }));

    await InvoiceItem.bulkCreate(invoiceItemsData);

    return await this.getInvoiceById(invoice.id);
  }

  async updateInvoiceStatus(id, status) {
    const invoice = await Invoice.findByPk(id);
    if (!invoice) return null;
    return await invoice.update({ status });
  }

  async updateInvoicePhone(id, customerPhone, shippingPhone) {
    const invoice = await Invoice.findByPk(id);
    if (!invoice) return null;
    const updateData = {};
    if (customerPhone !== undefined) updateData.customerPhone = customerPhone;
    if (shippingPhone !== undefined) {
      updateData.shippingPhone = shippingPhone;
    } else if (customerPhone !== undefined) {
      updateData.shippingPhone = customerPhone;
    }
    await invoice.update(updateData);
    return await this.getInvoiceById(id);
  }

  async deleteInvoice(id) {
    const invoice = await Invoice.findByPk(id);
    if (!invoice) return false;
    await invoice.update({ status: 'INACTIVE' });
    return true;
  }
}

module.exports = new InvoiceService();

const invoiceService = require('./invoice.service');

class InvoiceController {
  getAll = async (req, res) => {
    try {
      const { status, search } = req.query;
      const invoices = await invoiceService.getAllInvoices(status, search);
      res.json({ success: true, data: invoices });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  getById = async (req, res) => {
    try {
      const invoice = await invoiceService.getInvoiceById(req.params.id);
      if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
      }
      res.json({ success: true, data: invoice });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  create = async (req, res) => {
    try {
      const { customerName, items } = req.body;
      let { customerState } = req.body;

      if (req.body.invoiceDate && typeof req.body.invoiceDate === 'string' && req.body.invoiceDate.includes('/')) {
        const parts = req.body.invoiceDate.trim().split('/');
        if (parts.length === 3 && parts[2].length === 4) {
          req.body.invoiceDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }

      if (!customerName) {
        return res.status(400).json({ success: false, message: 'Customer name is required' });
      }
      if (!customerState) {
        const Setting = require('../setting/setting.model');
        const setting = await Setting.findOne();
        customerState = setting?.state || 'Gujarat';
        req.body.customerState = customerState;
      }
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'At least one item is required' });
      }

      const invoice = await invoiceService.createInvoice(req.body);
      res.status(201).json({ success: true, message: 'Invoice generated successfully', data: invoice });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  updateStatus = async (req, res) => {
    try {
      const { status } = req.body;
      const invoice = await invoiceService.updateInvoiceStatus(req.params.id, status);
      if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
      }
      res.json({ success: true, message: 'Status updated successfully', data: invoice });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  updatePhone = async (req, res) => {
    try {
      const { customerPhone, shippingPhone } = req.body;
      const invoice = await invoiceService.updateInvoicePhone(
        req.params.id,
        customerPhone,
        shippingPhone
      );
      if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
      }
      res.json({ success: true, message: 'Phone number updated successfully', data: invoice });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  delete = async (req, res) => {
    try {
      const success = await invoiceService.deleteInvoice(req.params.id);
      if (!success) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
      }
      res.json({ success: true, message: 'Invoice deleted successfully' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  getNextInvoiceNumber = async (req, res) => {
    try {
      const nextNumber = await invoiceService.generateInvoiceNumber();
      res.json({ success: true, data: { nextInvoiceNumber: nextNumber } });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };
}

module.exports = new InvoiceController();

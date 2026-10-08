const express = require('express');
const router = express.Router();
const invoiceController = require('./invoice.controller');

router.get('/next-number', invoiceController.getNextInvoiceNumber);
router.get('/', invoiceController.getAll);
router.get('/:id', invoiceController.getById);
router.post('/', invoiceController.create);
router.patch('/:id/status', invoiceController.updateStatus);
router.patch('/:id/phone', invoiceController.updatePhone);
router.delete('/:id', invoiceController.delete);

module.exports = router;

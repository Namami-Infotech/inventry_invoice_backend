const { Op } = require('sequelize');
const User = require('./user.model');

class UserService {
  async getAllUsers(role = '', search = '', status = '') {
    const where = {};

    if (status) {
      where.status = status;
    } else {
      where.status = { [Op.ne]: 'INACTIVE' };
    }

    // Admin users must never be returned in general user/client listings
    if (role && role !== 'ADMIN') {
      where.role = role;
    } else {
      where.role = { [Op.ne]: 'ADMIN' };
    }

    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { contactNumber: { [Op.like]: `%${search}%` } },
        { state: { [Op.like]: `%${search}%` } },
        { city: { [Op.like]: `%${search}%` } },
        { gstNumber: { [Op.like]: `%${search}%` } }
      ];
    }

    return await User.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });
  }

  async getUserById(id) {
    return await User.findByPk(id);
  }

  async createUser(data) {
    const gstVal = data.gstNumber || data.gstin || data.pincode || data.aadhaar_number || '';
    return await User.create({
      name: data.name,
      role: data.role || 'USER',
      fullAddress: data.fullAddress || data.address || '',
      state: data.state || '',
      city: data.city || '',
      gstNumber: gstVal,
      aadhaar_number: data.aadhaar_number || null,
      area: data.area || '',
      pincode: data.pincode || gstVal,
      contactNumber: data.contactNumber || data.mobile || '',
      email: data.email || '',
      status: data.status || 'ACTIVE'
    });
  }

  async updateUser(id, data) {
    const user = await User.findByPk(id);
    if (!user) return null;

    const gstVal = data.gstNumber !== undefined
      ? data.gstNumber
      : (data.gstin !== undefined ? data.gstin : (data.pincode !== undefined ? data.pincode : (data.aadhaar_number !== undefined ? data.aadhaar_number : user.gstNumber)));

    return await user.update({
      name: data.name !== undefined ? data.name : user.name,
      role: data.role !== undefined ? data.role : user.role,
      fullAddress: data.fullAddress !== undefined ? data.fullAddress : (data.address !== undefined ? data.address : user.fullAddress),
      state: data.state !== undefined ? data.state : user.state,
      city: data.city !== undefined ? data.city : user.city,
      gstNumber: gstVal,
      aadhaar_number: data.aadhaar_number !== undefined ? data.aadhaar_number : user.aadhaar_number,
      area: data.area !== undefined ? data.area : user.area,
      pincode: data.pincode !== undefined ? data.pincode : (gstVal || user.pincode),
      contactNumber: data.contactNumber !== undefined ? data.contactNumber : (data.mobile !== undefined ? data.mobile : user.contactNumber),
      email: data.email !== undefined ? data.email : user.email,
      status: data.status !== undefined ? data.status : user.status
    });
  }

  async deleteUser(id) {
    const user = await User.findByPk(id);
    if (!user) {
      return { success: false, statusCode: 404, message: 'User not found' };
    }

    // Protection: Admin users cannot be deleted
    if (user.role === 'ADMIN') {
      return {
        success: false,
        statusCode: 400,
        message: 'Admin user cannot be deleted. Role ADMIN is protected.'
      };
    }

    // Soft delete: mark status as INACTIVE
    await user.update({ status: 'INACTIVE' });
    return {
      success: true,
      message: 'User status successfully updated to INACTIVE'
    };
  }
}

module.exports = new UserService();

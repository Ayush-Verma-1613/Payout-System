const asyncHandler = require('../utils/asyncHandler');
const userRepository = require('../repositories/userRepository');
const { ValidationError, ConflictError } = require('../domain/errors');

const createUser = asyncHandler(async (req, res) => {
  const { name, email } = req.body || {};
  if (!name || !email) throw new ValidationError('name and email are required');

  const existing = await userRepository.findByEmail(email);
  if (existing) throw new ConflictError('A user with this email already exists');

  const user = await userRepository.create({ name, email });
  res.status(201).json(user);
});

module.exports = { createUser };

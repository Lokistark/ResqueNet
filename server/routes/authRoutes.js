const express = require('express');
const { register, login, logout, getMe, getUserCount, getAllUsers, deleteUser } = require('../controllers/authController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/logout', logout);
router.get('/me', protect, getMe);
router.get('/count', protect, restrictTo('admin'), getUserCount);

// USER MANAGEMENT (Admins Only)
router.get('/', protect, restrictTo('admin'), getAllUsers);
router.delete('/:id', protect, restrictTo('admin'), deleteUser);

module.exports = router;

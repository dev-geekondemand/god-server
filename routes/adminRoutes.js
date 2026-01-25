const express = require('express');

const { loginAdmin, registerAdmin, loadAdmin } = require('../controllers/adminController.js');
const { protectAdmin } = require('../middlewares/authMiddleware.js');

const router = express.Router();

router.post('/admin-login', loginAdmin);
router.post('/register', registerAdmin);
router.get('/load-admin', protectAdmin, loadAdmin);

module.exports = router;
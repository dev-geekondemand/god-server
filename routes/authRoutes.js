const express = require('express');
const { loginAdmin, registerAdmin,loadAdmin, logoutAdmin } = require('../controllers/adminController.js');
const { protectAdmin } = require('../middlewares/authMiddleware.js');

const router = express.Router();

router.post('/login', loginAdmin);
// router.post('/register', registerAdmin);
router.get('/loadAdmin',protectAdmin, loadAdmin);
router.post('/logout', protectAdmin, logoutAdmin);

module.exports = router;

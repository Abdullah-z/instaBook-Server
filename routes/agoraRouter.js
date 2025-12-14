const express = require('express');
const router = express.Router();
const { generateToken } = require('../controllers/agoraCtrl');

// Generate Agora token for voice/video calls
router.post('/agora/token', generateToken);

module.exports = router;

const express = require('express');
const { getPublicAreas } = require('../controllers/areaController');

const router = express.Router();

router.get('/', getPublicAreas);

module.exports = router;

const express = require('express');
const { getAreas } = require('../controllers/areaController');

const router = express.Router();

router.get('/', getAreas);

module.exports = router;

const express = require('express');
const { getAreas, createArea, updateArea, deleteArea } = require('../controllers/areaController');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(auth, requireRole('platform_admin'));
router.get('/', getAreas);
router.post('/', createArea);
router.put('/:id', updateArea);
router.delete('/:id', deleteArea);

module.exports = router;

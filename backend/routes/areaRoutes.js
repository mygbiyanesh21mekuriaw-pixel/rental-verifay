const express = require('express');
const {
  getAreas,
  getUnassignedProperties,
  createArea,
  updateArea,
  setAreaActive,
  deleteArea,
} = require('../controllers/areaController');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(auth, requireRole('platform_admin'));
router.get('/unassigned-properties', getUnassignedProperties);
router.get('/', getAreas);
router.post('/', createArea);
router.put('/:id', updateArea);
router.patch('/:id/status', setAreaActive);
router.delete('/:id', deleteArea);

module.exports = router;

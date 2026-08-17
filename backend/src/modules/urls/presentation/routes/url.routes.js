const express = require('express');
const { urlController } = require('./url.route-dependencies');
const { authenticate } = require('../../../auth/presentation/middleware/auth.middleware');
const {
  validateCreateUrl,
  validateUpdateUrl,
  validateUrlId,
} = require('../validators/url.validator');

const router = express.Router();

router.use(authenticate);

router.post('/', validateCreateUrl, urlController.create);
router.get('/', urlController.getAll);
router.get('/:id', validateUrlId, urlController.getById);
router.patch('/:id', validateUrlId, validateUpdateUrl, urlController.update);
router.delete('/:id', validateUrlId, urlController.remove);

module.exports = router;

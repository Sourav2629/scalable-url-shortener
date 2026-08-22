const express = require('express');
const { urlController } = require('./url.route-dependencies');
const { validateCreatePublicUrl } = require('../validators/url.validator');

const router = express.Router();

router.post('/', validateCreatePublicUrl, urlController.createPublic);

module.exports = router;

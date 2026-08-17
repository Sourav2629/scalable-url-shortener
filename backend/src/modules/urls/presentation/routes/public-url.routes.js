const express = require('express');
const { urlController } = require('./url.route-dependencies');

const router = express.Router();

router.get('/:shortCode', urlController.redirect);

module.exports = router;

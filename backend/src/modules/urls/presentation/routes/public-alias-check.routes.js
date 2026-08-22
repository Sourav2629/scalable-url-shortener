const express = require('express');
const { urlController } = require('./url.route-dependencies');

const router = express.Router();

router.get('/check/:alias', urlController.checkAliasAvailability);

module.exports = router;
const express = require('express');
const { analyticsService } = require('./analytics.route-dependencies');
const { authenticate } = require('../../../auth/presentation/middleware/auth.middleware');
const { validateUrlId } = require('../../../urls/presentation/validators/url.validator');

const router = express.Router();

router.use(authenticate);

router.get('/:id/analytics/summary', validateUrlId, async (req, res, next) => {
  try {
    const summary = await analyticsService.getSummary(req.auth.userId, req.params.id);
    res.json(summary);
  } catch (err) { next(err); }
});

router.get('/:id/analytics/timeseries', validateUrlId, async (req, res, next) => {
  try {
    const { from, to, interval } = req.query;
    const timeseries = await analyticsService.getTimeseries(
      req.auth.userId, 
      req.params.id, 
      from, 
      to, 
      interval || 'day'
    );
    res.json(timeseries);
  } catch (err) { next(err); }
});

module.exports = router;

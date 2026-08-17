function createUrlController(urlService) {
  return {
    create: async (req, res) => {
      const url = await urlService.createUrl(req.auth.userId, req.body);

      res.status(201).json({ url });
    },
    getAll: async (req, res) => {
      const urls = await urlService.getUserUrls(req.auth.userId);

      res.status(200).json({ urls });
    },
    getById: async (req, res) => {
      const url = await urlService.getUrlById(req.auth.userId, req.params.id);

      res.status(200).json({ url });
    },
    update: async (req, res) => {
      const url = await urlService.updateUrl(req.auth.userId, req.params.id, req.body);

      res.status(200).json({ url });
    },
    remove: async (req, res) => {
      await urlService.deleteUrl(req.auth.userId, req.params.id);

      res.status(204).send();
    },
    redirect: async (req, res, next) => {
      try {
        const requestInfo = {
          ip: req.ip,
          userAgent: req.get('user-agent'),
          referrer: req.get('referrer'),
        };
        const originalUrl = await urlService.getUrlByShortCode(req.params.shortCode, requestInfo);
        res.redirect(302, originalUrl);
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = createUrlController;

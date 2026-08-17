function createAuthController(authService) {
  return {
    register: async (req, res) => {
      const authentication = await authService.register(req.body);

      res.status(201).json(authentication);
    },
    login: async (req, res) => {
      const authentication = await authService.login(req.body);

      res.status(200).json(authentication);
    },
    logout: async (req, res) => {
      await authService.logout(req.auth.userId);

      res.status(204).send();
    },
    getCurrentUser: async (req, res) => {
      const user = await authService.getCurrentUser(req.auth.userId);

      res.status(200).json({ user });
    },
  };
}

module.exports = createAuthController;

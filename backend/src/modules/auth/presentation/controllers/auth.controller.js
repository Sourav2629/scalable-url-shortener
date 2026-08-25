function createAuthController(authService) {
  return {
    register: async (req, res) => {
      const result = await authService.register(req.body);

      res.status(201).json(result);
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
    verifyEmail: async (req, res) => {
      // verifyEmail now returns authentication response with tokens on success
      const result = await authService.verifyEmail(req.body);

      res.status(200).json(result);
    },
    resendVerification: async (req, res) => {
      const result = await authService.resendVerification(req.body);

      res.status(200).json(result);
    },
    forgotPassword: async (req, res) => {
      const result = await authService.forgotPassword(req.body);

      res.status(200).json(result);
    },
    resetPassword: async (req, res) => {
      const result = await authService.resetPassword(req.body);

      res.status(200).json(result);
    },
    resendPasswordReset: async (req, res) => {
      const result = await authService.resendPasswordReset(req.body);

      res.status(200).json(result);
    },
    updateProfile: async (req, res) => {
      const user = await authService.updateProfile(req.auth.userId, req.body);

      res.status(200).json({ user });
    },
    changePassword: async (req, res) => {
      const result = await authService.changePassword(req.auth.userId, req.body);

      res.status(200).json(result);
    },
    deleteAccount: async (req, res) => {
      const result = await authService.deleteAccount(req.auth.userId, req.body);

      res.status(200).json(result);
    },
    refresh: async (req, res) => {
      const result = await authService.refreshToken(req.body);

      res.status(200).json(result);
    },
  };
}

module.exports = createAuthController;

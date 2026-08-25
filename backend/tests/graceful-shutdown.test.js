const {
  createGracefulShutdown,
  registerCrashHandlers,
} = require('../src/shared/utils/graceful-shutdown');

describe('Graceful shutdown utilities', () => {
  const fakeLog = () => ({
    info: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
  });

  let exitCalls;

  function mockProcessExit() {
    exitCalls = [];
    return jest.spyOn(process, 'exit').mockImplementation((code) => {
      exitCalls.push(code);
      return undefined;
    });
  }

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('runs cleanup and exits with code 0 by default', async () => {
    const log = fakeLog();
    const exitSpy = mockProcessExit();
    const cleanup = jest.fn().mockResolvedValue(undefined);

    const shutdown = createGracefulShutdown({ log, timeoutMs: 1000, cleanup });
    shutdown('SIGTERM');
    await Promise.resolve(); // let finish() run

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(exitCalls).toEqual([0]);
    expect(log.info).toHaveBeenCalledWith(
      { signal: 'SIGTERM' },
      'SIGTERM received. Starting graceful shutdown...'
    );
    expect(exitSpy).toHaveBeenCalled();
  });

  test('passes the given exit code through', async () => {
    const log = fakeLog();
    mockProcessExit();

    const shutdown = createGracefulShutdown({ log, timeoutMs: 1000, closeServer: null });
    shutdown('unhandledRejection', 1);
    await Promise.resolve();

    expect(exitCalls).toEqual([1]);
    expect(log.error).toHaveBeenCalledWith(
      { signal: 'unhandledRejection' },
      'unhandledRejection received. Starting graceful shutdown...'
    );
  });

  test('waits for express-style closeServer callback before exiting', async () => {
    const log = fakeLog();
    const exitSpy = mockProcessExit();
    let releaseServer;
    const closeServer = jest.fn((done) => { releaseServer = done; });
    const cleanup = jest.fn().mockResolvedValue(undefined);

    const shutdown = createGracefulShutdown({ log, timeoutMs: 1000, closeServer, cleanup });
    shutdown('SIGINT');
    await Promise.resolve();

    expect(exitSpy).not.toHaveBeenCalled();

    releaseServer();
    await Promise.resolve();

    expect(cleanup).toHaveBeenCalled();
    expect(exitCalls).toEqual([0]);
  });

  test('is idempotent — repeated signals do not re-run shutdown', async () => {
    const log = fakeLog();
    mockProcessExit();
    let releaseServer;
    const closeServer = jest.fn((done) => { releaseServer = done; });
    const cleanup = jest.fn();

    const shutdown = createGracefulShutdown({ log, timeoutMs: 1000, closeServer, cleanup });

    shutdown('SIGINT', 0);
    shutdown('SIGTERM', 0); // duplicate must be ignored

    releaseServer();
    await Promise.resolve();

    expect(closeServer).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  test('cleanup failure exits with code 1', async () => {
    const log = fakeLog();
    mockProcessExit();
    const cleanup = jest.fn().mockRejectedValue(new Error('mongo disconnect failed'));

    const shutdown = createGracefulShutdown({ log, timeoutMs: 1000, cleanup });
    shutdown('SIGTERM', 0);

    await new Promise((r) => setTimeout(r, 0));

    expect(exitCalls).toEqual([1]);
    expect(log.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'Error during shutdown.'
    );
  });

  test('force-exits with code 1 when the server never finishes closing', async () => {
    jest.useFakeTimers();
    const log = fakeLog();
    mockProcessExit();
    // closeServer that never calls its callback
    const closeServer = jest.fn(() => {});

    const shutdown = createGracefulShutdown({ log, timeoutMs: 5000, closeServer });
    shutdown('SIGTERM', 0);

    await jest.advanceTimersByTimeAsync(5001);

    expect(exitCalls).toEqual([1]);
    expect(log.error).toHaveBeenCalledWith(
      'Could not close connections in time, forcefully shutting down'
    );
  });

  describe('registerCrashHandlers', () => {
    test('wires uncaughtException and unhandledRejection to the shutdown handler', () => {
      const handlers = {};
      const onSpy = jest
        .spyOn(process, 'on')
        .mockImplementation((event, cb) => {
          handlers[event] = cb;
          return process;
        });

      const log = fakeLog();
      const shutdown = jest.fn();
      registerCrashHandlers({ log, shutdown });

      expect(onSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));

      handlers.uncaughtException(new Error('boom'));
      expect(shutdown).toHaveBeenLastCalledWith('uncaughtException', 1);
      expect(log.fatal).toHaveBeenCalledWith(
        { err: expect.any(Error) },
        'Uncaught exception. Shutting down...'
      );

      handlers.unhandledRejection('a string rejection');
      expect(shutdown).toHaveBeenLastCalledWith('unhandledRejection', 1);
      expect(log.error).toHaveBeenCalledWith(
        { err: expect.any(Error) },
        'Unhandled promise rejection. Shutting down...'
      );
    });
  });
});

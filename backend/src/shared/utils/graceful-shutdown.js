/**
 * Shared graceful-shutdown utilities.
 *
 * Used by both the HTTP server (server.js) and the analytics worker
 * (workers/analytics.worker.js) so shutdown semantics stay consistent:
 * - shutdown runs at most once
 * - a bounded force-exit timeout prevents hanging forever
 * - cleanup errors exit non-zero
 * - uncaughtException/unhandledRejection log through the structured logger
 *   and delegate to the same shutdown path (never keeping a corrupted
 *   process alive)
 */

/**
 * Create an idempotent shutdown handler.
 *
 * @param {Object} options
 * @param {Object} options.log - Pino logger instance
 * @param {number} options.timeoutMs - Force-exit timeout in milliseconds
 * @param {Function} [options.closeServer] - Optional express-style close that
 *   receives a done callback: (done) => void. When omitted, cleanup runs
 *   immediately.
 * @param {Function} [options.cleanup] - Async cleanup (close DB/Redis/etc.)
 * @returns {Function} shutdown(signal, exitCode = 0)
 */
function createGracefulShutdown({ log, timeoutMs, closeServer, cleanup }) {
  let initiated = false;

  return function shutdown(signal, exitCode = 0) {
    if (initiated) {
      return;
    }
    initiated = true;

    const level = exitCode === 0 ? 'info' : 'error';
    log[level]({ signal }, `${signal} received. Starting graceful shutdown...`);

    const timer = setTimeout(() => {
      log.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, timeoutMs);
    // Do not keep the event loop alive solely for this safety timer.
    if (typeof timer.unref === 'function') {
      timer.unref();
    }

    const finish = async () => {
      try {
        if (cleanup) {
          await cleanup();
        }
        clearTimeout(timer);
        log.info('Shutdown complete.');
        process.exit(exitCode);
      } catch (err) {
        log.error({ err }, 'Error during shutdown.');
        process.exit(1);
      }
    };

    if (closeServer) {
      closeServer(finish);
    } else {
      finish();
    }
  };
}

/**
 * Register process-level crash handlers that log through the structured
 * logger and delegate to the shared shutdown handler. The process always
 * exits non-zero after a crash — never keeps running in a corrupted state.
 *
 * @param {Object} options
 * @param {Object} options.log - Pino logger instance
 * @param {Function} options.shutdown - Handler created by createGracefulShutdown
 */
function registerCrashHandlers({ log, shutdown }) {
  process.on('uncaughtException', (err) => {
    log.fatal({ err }, 'Uncaught exception. Shutting down...');
    shutdown('uncaughtException', 1);
  });

  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    log.error({ err }, 'Unhandled promise rejection. Shutting down...');
    shutdown('unhandledRejection', 1);
  });
}

module.exports = { createGracefulShutdown, registerCrashHandlers };

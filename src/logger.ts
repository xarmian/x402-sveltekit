import type { Logger } from './types.js';

/**
 * Default logger that wraps console.error.
 * Used when no custom logger is provided.
 */
export const defaultLogger: Logger = {
	error: (message: string, ...args: unknown[]) => console.error(message, ...args),
};

/**
 * No-op logger for when logging is disabled.
 * Used when logger option is set to null.
 */
export const noopLogger: Logger = {
	error: () => {},
};

/**
 * Get the effective logger based on the provided option.
 * @param logger - The logger option (Logger, null, or undefined)
 * @returns The logger to use (defaultLogger if undefined, noopLogger if null)
 */
export function getLogger(logger: Logger | null | undefined): Logger {
	if (logger === null) return noopLogger;
	if (logger === undefined) return defaultLogger;
	return logger;
}

/**
 * Sanitize error messages to avoid leaking sensitive information.
 * Only includes the error message, not stack traces or internal details.
 */
export function sanitizeError(err: unknown): string {
	if (err instanceof Error) {
		return err.message;
	}
	return String(err);
}

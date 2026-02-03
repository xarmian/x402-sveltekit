/**
 * Error messages used throughout the library.
 * Centralizing them ensures consistency and makes localization easier.
 */
export const ErrorMessages = {
	/** Returned when the payment service fails to initialize */
	SERVICE_UNAVAILABLE: 'Payment service temporarily unavailable',

	/** Returned when the payment signature header is malformed or invalid */
	INVALID_SIGNATURE_HEADER: 'Invalid payment signature header',

	/** Returned when no payment requirements match the provided payment */
	NO_MATCHING_REQUIREMENTS: 'No matching payment requirements',

	/** Returned when payment verification fails without a specific reason */
	VERIFICATION_FAILED: 'Payment verification failed',

	/** Log prefix for initialization failures */
	LOG_INIT_FAILED: '[x402] Failed to initialize HTTP resource server:',

	/** Log prefix for settlement failures */
	LOG_SETTLEMENT_FAILED: '[x402] Settlement failed:',

	/** Log prefix for settlement exceptions */
	LOG_SETTLEMENT_ERROR: '[x402] Settlement error:',
} as const;

/**
 * Format a network validation error message.
 */
export function networkValidationError(network: string): string {
	return `Invalid network format: "${network}". Expected format: "protocol:chainId" (e.g., "eip155:8453")`;
}

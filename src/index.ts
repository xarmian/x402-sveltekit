// Hook API — three abstraction levels
export { paymentHookFromHTTPServer, paymentHook, paymentHookFromConfig } from './hook.js';

// Adapter
export { SvelteKitAdapter } from './adapter.js';

// Utilities
export {
	createRequestContext,
	create402Response,
	handleSettlement,
	handleStaticRouteVerified,
	extractPaymentPayload,
	verifyAndBuildPaymentInfo,
} from './utils.js';

// Chain helpers
export { buildPaymentOptions, getEnabledChainNames, validateNetwork } from './chains.js';
export type { ChainConfig, ChainsConfig } from './chains.js';

// Logger utilities
export { defaultLogger, noopLogger, getLogger, sanitizeError } from './logger.js';

// Error messages
export { ErrorMessages, networkValidationError } from './errors.js';

// Types
export type {
	// Library types
	PaymentInfo,
	DynamicRouteConfig,
	RoutePaymentConfig,
	RoutesConfig,
	SchemeRegistration,
	PaymentHookOptions,
	PaymentHookFromConfigOptions,
	Logger,
	// Re-exported from @x402/core for convenience
	X402RoutesConfig,
	X402RouteConfig,
	X402PaymentOption,
	HTTPRequestContext,
	HTTPAdapter,
	Network,
	PaymentRequired,
	PaymentRequirements,
	PaymentPayload,
	VerifyResponse,
	SettleResponse,
} from './types.js';

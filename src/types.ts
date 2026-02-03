import type { RequestEvent } from '@sveltejs/kit';
import type {
	RoutesConfig as X402RoutesConfig,
	RouteConfig as X402RouteConfig,
	PaymentOption as X402PaymentOption,
	HTTPRequestContext,
} from '@x402/core/http';
import type { x402ResourceServer } from '@x402/core/server';
import type { Network } from '@x402/core/types';

// Re-export x402 native types for convenience
export type { X402RoutesConfig, X402RouteConfig, X402PaymentOption, HTTPRequestContext };
export type { Network } from '@x402/core/types';
export type {
	PaymentRequired,
	PaymentRequirements,
	PaymentPayload,
	VerifyResponse,
	SettleResponse,
} from '@x402/core/types';
export type { HTTPAdapter } from '@x402/core/http';

/**
 * Dynamic route configuration that receives SvelteKit RequestEvent
 * and can return null to skip payment (e.g. when free-tier params are used).
 */
export interface DynamicRouteConfig {
	accepts: (
		event: RequestEvent
	) => Promise<X402PaymentOption[] | null> | X402PaymentOption[] | null;
	description?: string;
	mimeType?: string;
}

/**
 * A route can be statically configured or use dynamic pricing.
 */
export type RoutePaymentConfig = X402RouteConfig | DynamicRouteConfig;

/**
 * Routes configuration mapping "METHOD /path" patterns to payment configs.
 */
export type RoutesConfig = Record<string, RoutePaymentConfig>;

/**
 * Payment info stored in event.locals.x402 after successful verification.
 */
export interface PaymentInfo {
	payer: string;
	network: Network;
	transaction?: string;
}

/**
 * A scheme registration function that registers a chain scheme with the resource server.
 */
export interface SchemeRegistration {
	register: (server: x402ResourceServer) => void;
}

/**
 * Logger interface for customizable logging.
 */
export interface Logger {
	error: (message: string, ...args: unknown[]) => void;
	warn?: (message: string, ...args: unknown[]) => void;
	info?: (message: string, ...args: unknown[]) => void;
	debug?: (message: string, ...args: unknown[]) => void;
}

/**
 * Options for paymentHookFromConfig (highest-level API).
 */
export interface PaymentHookFromConfigOptions {
	/** URL of the x402 facilitator service */
	facilitatorUrl: string;

	/** Route configurations for payment-protected endpoints */
	routes: RoutesConfig;

	/** Scheme registrations (e.g. EVM, SVM). If omitted, auto-registers EVM+SVM+AVM. */
	schemes?: SchemeRegistration[];

	/** Whether the payment system is enabled (defaults to true) */
	enabled?: boolean;

	/** Custom logger (defaults to console). Set to null to disable logging. */
	logger?: Logger | null;
}

/**
 * Options for paymentHook (mid-level API).
 */
export interface PaymentHookOptions {
	/** Pre-configured x402ResourceServer */
	resourceServer: x402ResourceServer;

	/** Route configurations for payment-protected endpoints */
	routes: RoutesConfig;

	/** Whether the payment system is enabled (defaults to true) */
	enabled?: boolean;

	/** Custom logger (defaults to console). Set to null to disable logging. */
	logger?: Logger | null;
}

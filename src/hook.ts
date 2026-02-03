import type { Handle, RequestEvent } from '@sveltejs/kit';
import {
	x402HTTPResourceServer,
	HTTPFacilitatorClient,
	type RouteConfig as X402RouteConfig,
} from '@x402/core/http';
import { x402ResourceServer } from '@x402/core/server';
import { SvelteKitAdapter } from './adapter.js';
import {
	create402Response,
	createRequestContext,
	extractPaymentPayload,
	handleSettlement,
	handleStaticRouteVerified,
	verifyAndBuildPaymentInfo,
} from './utils.js';
import type {
	DynamicRouteConfig,
	PaymentHookOptions,
	PaymentHookFromConfigOptions,
	RoutesConfig,
	SchemeRegistration,
	Logger,
} from './types.js';
import { getLogger, sanitizeError } from './logger.js';
import { ErrorMessages } from './errors.js';

/**
 * Initialization state tracking using a discriminated union.
 * - pending: Initialization in progress
 * - success: Initialization completed successfully
 * - failed: Initialization failed with an error
 */
type InitState =
	| { status: 'pending' }
	| { status: 'success' }
	| { status: 'failed'; error: Error };

/**
 * Check if a route config is a DynamicRouteConfig (accepts is a function).
 */
function isDynamic(cfg: X402RouteConfig | DynamicRouteConfig): cfg is DynamicRouteConfig {
	return typeof (cfg as DynamicRouteConfig).accepts === 'function';
}

/**
 * Parse a route pattern like "POST /api/v1/draw" into { method, pathPattern }.
 */
function parseRouteKey(key: string): { method: string; pathPattern: string } {
	const parts = key.split(' ');
	if (parts.length === 2) {
		return { method: parts[0].toUpperCase(), pathPattern: parts[1] };
	}
	return { method: '*', pathPattern: key };
}

/**
 * Simple path matching: exact match or wildcard trailing *.
 * Note: Only supports exact matches and trailing wildcards (e.g., "/api/v1/*").
 * For complex patterns like "/users/:id", use a path-to-regexp library.
 */
function pathMatches(pattern: string, pathname: string): boolean {
	if (pattern === pathname) return true;
	if (pattern.endsWith('*')) {
		return pathname.startsWith(pattern.slice(0, -1));
	}
	return false;
}

/**
 * Convert an x402HTTPResourceServer payment-error result to a Response.
 */
function paymentErrorToResponse(result: {
	response: { status: number; headers: Record<string, string>; body?: unknown };
}): Response {
	let bodyStr: string;
	if (result.response.body === undefined || result.response.body === null) {
		bodyStr = '';
	} else if (typeof result.response.body === 'string') {
		bodyStr = result.response.body;
	} else {
		bodyStr = JSON.stringify(result.response.body);
	}
	return new Response(bodyStr, {
		status: result.response.status,
		headers: result.response.headers,
	});
}

/**
 * Create a 503 Service Unavailable response for initialization failures.
 */
function create503Response(): Response {
	return new Response(JSON.stringify({ error: ErrorMessages.SERVICE_UNAVAILABLE }), {
		status: 503,
		headers: { 'Content-Type': 'application/json' },
	});
}

/**
 * Level 1 (lowest): Create a payment hook from a pre-configured x402HTTPResourceServer.
 *
 * Use this when you have full control over the HTTP server setup.
 * Only handles static routes (no dynamic pricing).
 *
 * @param httpServer - A pre-configured x402HTTPResourceServer instance
 * @returns A SvelteKit Handle function for payment enforcement
 *
 * @example
 * const httpServer = new x402HTTPResourceServer(resourceServer, routes);
 * export const handle = paymentHookFromHTTPServer(httpServer);
 */
export function paymentHookFromHTTPServer(httpServer: x402HTTPResourceServer): Handle {
	return async ({ event, resolve }) => {
		const context = createRequestContext(event);

		if (httpServer.requiresPayment(context)) {
			const result = await httpServer.processHTTPRequest(context);

			if (result.type === 'payment-error') {
				return paymentErrorToResponse(result);
			}

			if (result.type === 'payment-verified') {
				return handleStaticRouteVerified(
					httpServer,
					event,
					async (e) => resolve(e),
					result.paymentPayload,
					result.paymentRequirements
				);
			}
		}

		return resolve(event);
	};
}

/**
 * Dynamic route entry for optimized lookup.
 */
interface DynamicRouteEntry {
	pathPattern: string;
	config: DynamicRouteConfig;
}

/**
 * Level 2 (mid): Create a payment hook from a resource server + routes config.
 *
 * Supports both static and dynamic routes.
 * Dynamic routes take priority over static routes when both match.
 *
 * @param options - Configuration options
 * @param options.resourceServer - Pre-configured x402ResourceServer
 * @param options.routes - Route configurations mapping patterns to payment configs
 * @param options.enabled - Whether payment enforcement is enabled (default: true)
 * @param options.logger - Custom logger or null to disable (default: console.error)
 * @returns A SvelteKit Handle function for payment enforcement
 *
 * @example
 * export const handle = paymentHook({
 *   resourceServer,
 *   routes: {
 *     'POST /api/paid': { accepts: async () => [...], description: 'Paid endpoint' }
 *   }
 * });
 */
export function paymentHook(options: PaymentHookOptions): Handle {
	const { resourceServer, routes, enabled = true, logger } = options;
	const log = getLogger(logger);

	if (!enabled) {
		return async ({ event, resolve }) => resolve(event);
	}

	// Separate static routes from dynamic routes
	const staticRoutes: Record<string, X402RouteConfig> = {};
	// Organize dynamic routes by method for O(1) method lookup
	const dynamicRoutesByMethod = new Map<string, DynamicRouteEntry[]>();

	for (const [key, cfg] of Object.entries(routes)) {
		if (isDynamic(cfg)) {
			const { method, pathPattern } = parseRouteKey(key);
			const entry: DynamicRouteEntry = { pathPattern, config: cfg };
			const existing = dynamicRoutesByMethod.get(method) ?? [];
			existing.push(entry);
			dynamicRoutesByMethod.set(method, existing);
		} else {
			staticRoutes[key] = cfg;
		}
	}

	const hasStaticRoutes = Object.keys(staticRoutes).length > 0;
	const hasDynamicRoutes = dynamicRoutesByMethod.size > 0;

	// Only create HTTP resource server if there are static routes
	const httpServer = hasStaticRoutes
		? new x402HTTPResourceServer(resourceServer, staticRoutes)
		: null;

	// Track initialization state explicitly
	let initState: InitState = { status: 'pending' };
	let initPromise: Promise<void> | null = null;

	if (httpServer) {
		// HTTP server initialization also initializes the underlying resource server
		initPromise = httpServer
			.initialize()
			.then(() => {
				initState = { status: 'success' };
			})
			.catch((err) => {
				const error = err instanceof Error ? err : new Error(String(err));
				initState = { status: 'failed', error };
				log.error(ErrorMessages.LOG_INIT_FAILED, sanitizeError(err));
			});
	} else if (hasDynamicRoutes) {
		// Dynamic routes need the resource server initialized to fetch supported kinds
		initPromise = resourceServer
			.initialize()
			.then(() => {
				initState = { status: 'success' };
			})
			.catch((err) => {
				const error = err instanceof Error ? err : new Error(String(err));
				initState = { status: 'failed', error };
				log.error(ErrorMessages.LOG_INIT_FAILED, sanitizeError(err));
			});
	} else {
		initState = { status: 'success' };
	}

	function findDynamicRoute(method: string, pathname: string): DynamicRouteConfig | null {
		// Check method-specific routes first
		const methodRoutes = dynamicRoutesByMethod.get(method);
		if (methodRoutes) {
			for (const route of methodRoutes) {
				if (pathMatches(route.pathPattern, pathname)) return route.config;
			}
		}
		// Check wildcard routes
		const wildcardRoutes = dynamicRoutesByMethod.get('*');
		if (wildcardRoutes) {
			for (const route of wildcardRoutes) {
				if (pathMatches(route.pathPattern, pathname)) return route.config;
			}
		}
		return null;
	}

	return async ({ event, resolve }) => {
		// Wait for initialization if still pending
		if (initState.status === 'pending' && initPromise) {
			await initPromise;
		}

		// Return 503 if initialization failed
		if (initState.status === 'failed') {
			return create503Response();
		}

		const method = event.request.method;
		const pathname = event.url.pathname;

		// --- Try dynamic routes first (documented behavior: dynamic takes priority) ---
		const dynamicConfig = findDynamicRoute(method, pathname);
		if (dynamicConfig) {
			return handleDynamicRoute(event, async (e) => resolve(e), resourceServer, dynamicConfig, log);
		}

		// --- Try static routes via x402HTTPResourceServer ---
		if (httpServer) {
			const context = createRequestContext(event);

			if (httpServer.requiresPayment(context)) {
				const result = await httpServer.processHTTPRequest(context);

				if (result.type === 'payment-error') {
					return paymentErrorToResponse(result);
				}

				if (result.type === 'payment-verified') {
					return handleStaticRouteVerified(
						httpServer,
						event,
						async (e) => resolve(e),
						result.paymentPayload,
						result.paymentRequirements,
						log
					);
				}
			}
		}

		return resolve(event);
	};
}

/**
 * Level 3 (highest): Create a payment hook from config.
 *
 * Configures the resource server from facilitator URL and explicit scheme registrations.
 *
 * @param options - Configuration options
 * @param options.facilitatorUrl - URL of the x402 facilitator service
 * @param options.routes - Route configurations mapping patterns to payment configs
 * @param options.schemes - Scheme registrations (EVM, SVM, etc.)
 * @param options.enabled - Whether payment enforcement is enabled (default: true)
 * @param options.logger - Custom logger or null to disable (default: console.error)
 * @returns A SvelteKit Handle function for payment enforcement
 *
 * @example
 * // Register EVM and SVM schemes
 * import { registerExactEvmScheme } from '@x402/evm/exact/server';
 * import { registerExactSvmScheme } from '@x402/svm/exact/server';
 *
 * export const handle = paymentHookFromConfig({
 *   facilitatorUrl: 'https://x402.org/facilitator',
 *   schemes: [
 *     { register: registerExactEvmScheme },
 *     { register: registerExactSvmScheme },
 *     // When available: { register: registerExactAvmScheme } from '@x402/avm/exact/server'
 *   ],
 *   routes: {
 *     'POST /api/paid': { accepts: async () => [...], description: 'Paid endpoint' }
 *   }
 * });
 */
export function paymentHookFromConfig(options: PaymentHookFromConfigOptions): Handle {
	const { facilitatorUrl, routes, schemes, enabled = true, logger } = options;

	if (!enabled) {
		return async ({ event, resolve }) => resolve(event);
	}

	const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });
	const resourceServer = new x402ResourceServer(facilitatorClient);

	// Register all schemes synchronously
	for (const scheme of schemes) {
		scheme.register(resourceServer);
	}

	return paymentHook({ resourceServer, routes, enabled, logger });
}

/**
 * Handle a dynamic route request: compute payment options per-request,
 * verify payment, resolve handler, then settle.
 *
 * Performance note: This function creates a Proxy object for each request to preserve
 * RequestEvent methods while using a cloned request. For very high-throughput scenarios,
 * consider using static routes instead.
 */
async function handleDynamicRoute(
	event: RequestEvent,
	resolve: (event: RequestEvent) => Promise<Response>,
	resourceServer: x402ResourceServer,
	dynamicConfig: DynamicRouteConfig,
	log: Logger
): Promise<Response> {
	// Clone only the request for body reading - keep the original event intact
	// This preserves all RequestEvent methods (getClientAddress, cookies, etc.)
	const clonedRequest = event.request.clone();

	// Create a proxy event that uses the cloned request for accepts()
	// but keeps all other properties/methods from the original event
	const eventForAccepts = new Proxy(event, {
		get(target, prop) {
			if (prop === 'request') return clonedRequest;
			return Reflect.get(target, prop);
		},
	}) as RequestEvent;

	const paymentOptions = await dynamicConfig.accepts(eventForAccepts);

	// null or empty array means no payment needed (e.g. free-tier request)
	if (paymentOptions === null || paymentOptions.length === 0) {
		return resolve(event);
	}

	const adapter = new SvelteKitAdapter(event);

	// Build payment requirements using the resource server
	const requirements = await resourceServer.buildPaymentRequirementsFromOptions(paymentOptions, {
		adapter,
		path: event.url.pathname,
		method: event.request.method,
	});

	const resourceInfo = {
		url: event.url.href,
		description: dynamicConfig.description ?? '',
		mimeType: dynamicConfig.mimeType ?? 'application/json',
	};

	// Try to extract payment
	let paymentPayload;
	try {
		paymentPayload = extractPaymentPayload(event);
	} catch {
		return create402Response(
			resourceServer.createPaymentRequiredResponse(
				requirements,
				resourceInfo,
				ErrorMessages.INVALID_SIGNATURE_HEADER
			)
		);
	}

	if (!paymentPayload) {
		return create402Response(
			resourceServer.createPaymentRequiredResponse(requirements, resourceInfo)
		);
	}

	// Verify payment
	const result = await verifyAndBuildPaymentInfo(
		resourceServer,
		paymentPayload,
		requirements,
		resourceInfo
	);

	if (!result.ok) {
		return result.response;
	}

	// Store payment info in locals (create a new object to avoid mutation concerns)
	const paymentInfo = { ...result.paymentInfo };
	(event.locals as Record<string, unknown>).x402 = paymentInfo;

	// Resolve the route handler
	const response = await resolve(event);

	// Only settle on successful (2xx) responses
	if (response.status >= 200 && response.status < 300) {
		return handleSettlement(
			resourceServer,
			paymentPayload,
			result.matchedReq,
			response,
			paymentInfo,
			log
		);
	}

	return response;
}

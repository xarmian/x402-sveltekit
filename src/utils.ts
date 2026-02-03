import type { RequestEvent } from '@sveltejs/kit';
import type { HTTPRequestContext } from '@x402/core/http';
import type { x402HTTPResourceServer } from '@x402/core/http';
import type { PaymentRequired, PaymentRequirements, PaymentPayload } from '@x402/core/types';
import type { x402ResourceServer } from '@x402/core/server';
import {
	encodePaymentRequiredHeader,
	encodePaymentResponseHeader,
	decodePaymentSignatureHeader,
} from '@x402/core/http';
import { SvelteKitAdapter } from './adapter.js';
import type { PaymentInfo, Logger } from './types.js';
import { defaultLogger, sanitizeError } from './logger.js';
import { ErrorMessages } from './errors.js';

/**
 * Create an HTTPRequestContext from a SvelteKit RequestEvent.
 *
 * Header priority: `Payment-Signature` is preferred over `X-Payment` if both are present.
 *
 * @param event - The SvelteKit request event
 * @returns An HTTPRequestContext for use with x402 core functions
 */
export function createRequestContext(event: RequestEvent): HTTPRequestContext {
	const adapter = new SvelteKitAdapter(event);
	// Payment-Signature takes priority over X-Payment for consistency with x402 spec
	const paymentHeader =
		event.request.headers.get('Payment-Signature') ??
		event.request.headers.get('X-Payment') ??
		undefined;
	return {
		adapter,
		path: event.url.pathname,
		method: event.request.method,
		paymentHeader,
	};
}

/**
 * Build a 402 Payment Required response from a PaymentRequired object.
 *
 * @param paymentRequired - The payment requirements to encode in the response
 * @returns A 402 Response with JSON body and Payment-Required header
 */
export function create402Response(paymentRequired: PaymentRequired): Response {
	const encoded = encodePaymentRequiredHeader(paymentRequired);
	return new Response(JSON.stringify(paymentRequired), {
		status: 402,
		headers: {
			'Content-Type': 'application/json',
			'Payment-Required': encoded,
		},
	});
}

/**
 * Handle settlement after a successful response.
 * Returns a new Response with the Payment-Response header if settlement succeeds,
 * or the original response if settlement fails.
 *
 * @param resourceServer - The x402 resource server for settlement
 * @param paymentPayload - The verified payment payload
 * @param requirements - The matched payment requirements
 * @param response - The original response from the route handler
 * @param paymentInfo - Payment info object (will be mutated with transaction details)
 * @param logger - Optional logger for error reporting
 * @returns Response with Payment-Response header on success, or original response on failure
 *
 * @remarks
 * This function clones the response to add headers. If `response.bodyUsed` is true,
 * a warning will be logged and the response may have an empty body.
 */
export async function handleSettlement(
	resourceServer: x402ResourceServer,
	paymentPayload: PaymentPayload,
	requirements: PaymentRequirements,
	response: Response,
	paymentInfo: PaymentInfo,
	logger: Logger = defaultLogger
): Promise<Response> {
	// Warn if response body has already been consumed
	if (response.bodyUsed) {
		logger.error(
			'[x402] Warning: Response body has already been consumed. Settlement response may have empty body.'
		);
	}

	try {
		const settleResult = await resourceServer.settlePayment(paymentPayload, requirements);
		if (settleResult.success) {
			paymentInfo.transaction = settleResult.transaction;
			if (settleResult.payer) {
				paymentInfo.payer = settleResult.payer;
			}
			// Clone the response to safely add headers
			const clonedResponse = response.clone();
			const newHeaders = new Headers(clonedResponse.headers);
			newHeaders.set('Payment-Response', encodePaymentResponseHeader(settleResult));
			return new Response(clonedResponse.body, {
				status: clonedResponse.status,
				statusText: clonedResponse.statusText,
				headers: newHeaders,
			});
		}
		logger.error(ErrorMessages.LOG_SETTLEMENT_FAILED, settleResult.errorReason);
	} catch (err) {
		logger.error(ErrorMessages.LOG_SETTLEMENT_ERROR, sanitizeError(err));
	}
	return response;
}

/**
 * Extract and decode a payment payload from request headers.
 *
 * Header priority: `Payment-Signature` is preferred over `X-Payment` if both are present.
 *
 * @param event - The SvelteKit request event
 * @returns The decoded payment payload, or null if no payment header is present
 * @throws Error if the payment header is present but malformed
 */
export function extractPaymentPayload(event: RequestEvent): PaymentPayload | null {
	// Payment-Signature takes priority over X-Payment for consistency with x402 spec
	const paymentHeader =
		event.request.headers.get('Payment-Signature') ??
		event.request.headers.get('X-Payment') ??
		null;

	if (!paymentHeader) return null;

	return decodePaymentSignatureHeader(paymentHeader);
}

/**
 * Verify a payment and build PaymentInfo on success.
 *
 * @param resourceServer - The x402 resource server for verification
 * @param paymentPayload - The payment payload to verify
 * @param requirements - The list of acceptable payment requirements
 * @param resourceInfo - Information about the requested resource
 * @returns Success with PaymentInfo and matched requirements, or failure with 402 Response
 */
export async function verifyAndBuildPaymentInfo(
	resourceServer: x402ResourceServer,
	paymentPayload: PaymentPayload,
	requirements: PaymentRequirements[],
	resourceInfo: { url: string; description: string; mimeType: string }
): Promise<
	| { ok: true; paymentInfo: PaymentInfo; matchedReq: PaymentRequirements }
	| { ok: false; response: Response }
> {
	const matchedReq = resourceServer.findMatchingRequirements(requirements, paymentPayload);
	if (!matchedReq) {
		return {
			ok: false,
			response: create402Response(
				resourceServer.createPaymentRequiredResponse(
					requirements,
					resourceInfo,
					ErrorMessages.NO_MATCHING_REQUIREMENTS
				)
			),
		};
	}

	const verifyResult = await resourceServer.verifyPayment(paymentPayload, matchedReq);
	if (!verifyResult.isValid) {
		return {
			ok: false,
			response: create402Response(
				resourceServer.createPaymentRequiredResponse(
					requirements,
					resourceInfo,
					verifyResult.invalidReason ?? ErrorMessages.VERIFICATION_FAILED
				)
			),
		};
	}

	return {
		ok: true,
		paymentInfo: {
			payer: verifyResult.payer ?? 'unknown',
			network: matchedReq.network,
		},
		matchedReq,
	};
}

/**
 * Handle a verified static route: set locals, resolve, settle on 2xx.
 * Shared by paymentHookFromHTTPServer and paymentHook to avoid duplication.
 *
 * @param httpServer - The x402 HTTP resource server for settlement
 * @param event - The SvelteKit request event
 * @param resolve - The resolve function to call the route handler
 * @param paymentPayload - The verified payment payload
 * @param paymentRequirements - The matched payment requirements
 * @param logger - Optional logger for error reporting
 * @returns Response with settlement headers on success, or original response on failure
 *
 * @remarks
 * This function clones the response to add headers. If `response.bodyUsed` is true,
 * a warning will be logged and the response may have an empty body.
 */
export async function handleStaticRouteVerified(
	httpServer: x402HTTPResourceServer,
	event: RequestEvent,
	resolve: (event: RequestEvent) => Promise<Response>,
	paymentPayload: PaymentPayload,
	paymentRequirements: PaymentRequirements,
	logger: Logger = defaultLogger
): Promise<Response> {
	const paymentInfo: PaymentInfo = {
		payer: 'unknown',
		network: paymentRequirements.network,
	};
	(event.locals as Record<string, unknown>).x402 = paymentInfo;

	const response = await resolve(event);

	if (response.status >= 200 && response.status < 300) {
		// Warn if response body has already been consumed
		if (response.bodyUsed) {
			logger.error(
				'[x402] Warning: Response body has already been consumed. Settlement response may have empty body.'
			);
		}

		try {
			const settleResult = await httpServer.processSettlement(
				paymentPayload,
				paymentRequirements
			);
			if (settleResult.success) {
				paymentInfo.transaction = settleResult.transaction;
				paymentInfo.payer = settleResult.payer ?? paymentInfo.payer;
				// Clone the response to safely add headers
				const clonedResponse = response.clone();
				const newHeaders = new Headers(clonedResponse.headers);
				for (const [k, v] of Object.entries(settleResult.headers)) {
					newHeaders.set(k, v);
				}
				return new Response(clonedResponse.body, {
					status: clonedResponse.status,
					statusText: clonedResponse.statusText,
					headers: newHeaders,
				});
			}
			logger.error(ErrorMessages.LOG_SETTLEMENT_FAILED, settleResult.errorReason);
		} catch (err) {
			logger.error(ErrorMessages.LOG_SETTLEMENT_ERROR, sanitizeError(err));
		}
	}

	return response;
}

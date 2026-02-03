import { describe, it, expect, vi } from 'vitest';
import {
	createRequestContext,
	create402Response,
	extractPaymentPayload,
	verifyAndBuildPaymentInfo,
	handleSettlement,
	handleStaticRouteVerified,
} from './utils.js';
import { mockEvent, mockResolve } from './test-helpers.js';
import type { x402ResourceServer } from '@x402/core/server';

describe('createRequestContext', () => {
	it('creates context from event with Payment-Signature header', () => {
		const event = mockEvent({
			method: 'POST',
			url: 'https://example.com/api/v1/draw',
			headers: { 'Payment-Signature': 'test-signature' },
		});

		const context = createRequestContext(event);

		expect(context.path).toBe('/api/v1/draw');
		expect(context.method).toBe('POST');
		expect(context.paymentHeader).toBe('test-signature');
		expect(context.adapter).toBeDefined();
	});

	it('creates context from event with X-Payment header', () => {
		const event = mockEvent({
			method: 'GET',
			url: 'https://example.com/api/resource',
			headers: { 'X-Payment': 'x-payment-value' },
		});

		const context = createRequestContext(event);

		expect(context.paymentHeader).toBe('x-payment-value');
	});

	it('creates context with undefined paymentHeader when no payment headers', () => {
		const event = mockEvent({
			method: 'GET',
			url: 'https://example.com/api/resource',
		});

		const context = createRequestContext(event);

		expect(context.paymentHeader).toBeUndefined();
	});

	it('prefers Payment-Signature over X-Payment', () => {
		const event = mockEvent({
			headers: {
				'Payment-Signature': 'signature-value',
				'X-Payment': 'x-payment-value',
			},
		});

		const context = createRequestContext(event);

		expect(context.paymentHeader).toBe('signature-value');
	});
});

describe('create402Response', () => {
	it('creates a 402 response with encoded header', () => {
		const paymentRequired = {
			x402Version: 2,
			error: undefined,
			resource: { url: 'https://example.com/', description: 'Test', mimeType: 'application/json' },
			accepts: [
				{
					scheme: 'exact' as const,
					network: 'eip155:8453' as const,
					asset: '0xusdc',
					amount: '100000',
					payTo: '0xAbC',
					maxTimeoutSeconds: 60,
					extra: {},
				},
			],
		};

		const response = create402Response(paymentRequired);

		expect(response.status).toBe(402);
		expect(response.headers.get('Content-Type')).toBe('application/json');
		expect(response.headers.get('Payment-Required')).toBeDefined();
	});

	it('includes error message in response', async () => {
		const paymentRequired = {
			x402Version: 2,
			error: 'Payment verification failed',
			resource: { url: 'https://example.com/', description: '', mimeType: 'application/json' },
			accepts: [],
		};

		const response = create402Response(paymentRequired);
		const body = await response.json();

		expect(body.error).toBe('Payment verification failed');
	});
});

describe('extractPaymentPayload', () => {
	it('returns null when no payment header', () => {
		const event = mockEvent();
		const payload = extractPaymentPayload(event);
		expect(payload).toBeNull();
	});

	it('extracts payload from Payment-Signature header', () => {
		const fakePayload = {
			x402Version: 2,
			resource: { url: 'https://example.com/', description: '', mimeType: 'application/json' },
			accepted: { scheme: 'exact', network: 'eip155:8453' },
			payload: { signature: '0xfake' },
		};
		const encoded = Buffer.from(JSON.stringify(fakePayload)).toString('base64');

		const event = mockEvent({
			headers: { 'Payment-Signature': encoded },
		});

		const payload = extractPaymentPayload(event);
		expect(payload).toBeDefined();
		expect(payload?.x402Version).toBe(2);
	});

	it('extracts payload from X-Payment header', () => {
		const fakePayload = {
			x402Version: 2,
			resource: { url: 'https://example.com/', description: '', mimeType: 'application/json' },
			accepted: { scheme: 'exact', network: 'eip155:8453' },
			payload: { signature: '0xfake' },
		};
		const encoded = Buffer.from(JSON.stringify(fakePayload)).toString('base64');

		const event = mockEvent({
			headers: { 'X-Payment': encoded },
		});

		const payload = extractPaymentPayload(event);
		expect(payload).toBeDefined();
	});

	it('throws on malformed base64', () => {
		const event = mockEvent({
			headers: { 'Payment-Signature': 'not-valid-base64!!!' },
		});

		expect(() => extractPaymentPayload(event)).toThrow();
	});

	it('throws on invalid JSON', () => {
		const encoded = Buffer.from('not-json').toString('base64');
		const event = mockEvent({
			headers: { 'Payment-Signature': encoded },
		});

		expect(() => extractPaymentPayload(event)).toThrow();
	});
});

describe('verifyAndBuildPaymentInfo', () => {
	function mockResourceServer(overrides: Partial<x402ResourceServer> = {}) {
		return {
			findMatchingRequirements: vi.fn().mockReturnValue({
				scheme: 'exact',
				network: 'eip155:8453',
				asset: '0xusdc',
				amount: '100000',
				payTo: '0xAbC',
				maxTimeoutSeconds: 60,
				extra: {},
			}),
			verifyPayment: vi.fn().mockResolvedValue({
				isValid: true,
				payer: '0xPayer',
			}),
			createPaymentRequiredResponse: vi.fn().mockReturnValue({
				x402Version: 2,
				error: 'Error message',
				resource: { url: '', description: '', mimeType: '' },
				accepts: [],
			}),
			...overrides,
		} as unknown as x402ResourceServer;
	}

	it('returns ok with paymentInfo on successful verification', async () => {
		const resourceServer = mockResourceServer();
		const paymentPayload = { x402Version: 2 } as any;
		const requirements = [{ scheme: 'exact', network: 'eip155:8453' as const }] as any;
		const resourceInfo = { url: '', description: '', mimeType: '' };

		const result = await verifyAndBuildPaymentInfo(
			resourceServer,
			paymentPayload,
			requirements,
			resourceInfo
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.paymentInfo.payer).toBe('0xPayer');
			expect(result.paymentInfo.network).toBe('eip155:8453');
		}
	});

	it('returns error response when no matching requirements', async () => {
		const resourceServer = mockResourceServer({
			findMatchingRequirements: vi.fn().mockReturnValue(null),
		});
		const paymentPayload = { x402Version: 2 } as any;
		const requirements = [] as any;
		const resourceInfo = { url: '', description: '', mimeType: '' };

		const result = await verifyAndBuildPaymentInfo(
			resourceServer,
			paymentPayload,
			requirements,
			resourceInfo
		);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.response.status).toBe(402);
		}
	});

	it('returns error response when verification fails', async () => {
		const resourceServer = mockResourceServer({
			verifyPayment: vi.fn().mockResolvedValue({
				isValid: false,
				invalidReason: 'Signature mismatch',
			}),
		});
		const paymentPayload = { x402Version: 2 } as any;
		const requirements = [{ scheme: 'exact', network: 'eip155:8453' as const }] as any;
		const resourceInfo = { url: '', description: '', mimeType: '' };

		const result = await verifyAndBuildPaymentInfo(
			resourceServer,
			paymentPayload,
			requirements,
			resourceInfo
		);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.response.status).toBe(402);
		}
	});

	it('uses default payer when not provided', async () => {
		const resourceServer = mockResourceServer({
			verifyPayment: vi.fn().mockResolvedValue({
				isValid: true,
				payer: undefined,
			}),
		});
		const paymentPayload = { x402Version: 2 } as any;
		const requirements = [{ scheme: 'exact', network: 'eip155:8453' as const }] as any;
		const resourceInfo = { url: '', description: '', mimeType: '' };

		const result = await verifyAndBuildPaymentInfo(
			resourceServer,
			paymentPayload,
			requirements,
			resourceInfo
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.paymentInfo.payer).toBe('unknown');
		}
	});
});

describe('handleSettlement', () => {
	function mockResourceServer(overrides: Partial<x402ResourceServer> = {}) {
		return {
			settlePayment: vi.fn().mockResolvedValue({
				success: true,
				transaction: '0xtx123',
				payer: '0xPayer',
			}),
			...overrides,
		} as unknown as x402ResourceServer;
	}

	it('adds Payment-Response header on successful settlement', async () => {
		const resourceServer = mockResourceServer();
		const paymentPayload = { x402Version: 2 } as any;
		const requirements = { scheme: 'exact', network: 'eip155:8453' as const } as any;
		const originalResponse = new Response('{"ok":true}', { status: 200 });
		const paymentInfo = { payer: 'unknown', network: 'eip155:8453' as const };

		const response = await handleSettlement(
			resourceServer,
			paymentPayload,
			requirements,
			originalResponse,
			paymentInfo
		);

		expect(response.headers.get('Payment-Response')).toBeDefined();
		expect(paymentInfo.transaction).toBe('0xtx123');
		expect(paymentInfo.payer).toBe('0xPayer');
	});

	it('returns original response on settlement failure', async () => {
		const resourceServer = mockResourceServer({
			settlePayment: vi.fn().mockResolvedValue({
				success: false,
				errorReason: 'Insufficient funds',
			}),
		});
		const paymentPayload = { x402Version: 2 } as any;
		const requirements = { scheme: 'exact', network: 'eip155:8453' as const } as any;
		const originalResponse = new Response('{"ok":true}', { status: 200 });
		const paymentInfo = { payer: 'unknown', network: 'eip155:8453' as const };
		const logger = { error: vi.fn() };

		const response = await handleSettlement(
			resourceServer,
			paymentPayload,
			requirements,
			originalResponse,
			paymentInfo,
			logger
		);

		expect(response.headers.get('Payment-Response')).toBeNull();
		expect(logger.error).toHaveBeenCalledWith('[x402] Settlement failed:', 'Insufficient funds');
	});

	it('returns original response on settlement exception', async () => {
		const resourceServer = mockResourceServer({
			settlePayment: vi.fn().mockRejectedValue(new Error('Network error')),
		});
		const paymentPayload = { x402Version: 2 } as any;
		const requirements = { scheme: 'exact', network: 'eip155:8453' as const } as any;
		const originalResponse = new Response('{"ok":true}', { status: 200 });
		const paymentInfo = { payer: 'unknown', network: 'eip155:8453' as const };
		const logger = { error: vi.fn() };

		const response = await handleSettlement(
			resourceServer,
			paymentPayload,
			requirements,
			originalResponse,
			paymentInfo,
			logger
		);

		expect(response.headers.get('Payment-Response')).toBeNull();
		expect(logger.error).toHaveBeenCalledWith('[x402] Settlement error:', 'Network error');
	});
});

describe('handleStaticRouteVerified', () => {
	it('sets payment info in locals', async () => {
		const httpServer = {
			processSettlement: vi.fn().mockResolvedValue({
				success: true,
				transaction: '0xtx',
				payer: '0xPayer',
				headers: { 'Payment-Response': 'encoded' },
			}),
		} as any;

		const event = mockEvent();
		const resolve = mockResolve(200);
		const paymentPayload = { x402Version: 2 } as any;
		const paymentRequirements = { scheme: 'exact', network: 'eip155:8453' as const } as any;

		await handleStaticRouteVerified(
			httpServer,
			event,
			resolve,
			paymentPayload,
			paymentRequirements
		);

		expect((event.locals as any).x402).toBeDefined();
		expect((event.locals as any).x402.network).toBe('eip155:8453');
	});

	it('does not settle on non-2xx response', async () => {
		const httpServer = {
			processSettlement: vi.fn().mockResolvedValue({
				success: true,
				transaction: '0xtx',
				payer: '0xPayer',
				headers: {},
			}),
		} as any;

		const event = mockEvent();
		const resolve = mockResolve(400);
		const paymentPayload = { x402Version: 2 } as any;
		const paymentRequirements = { scheme: 'exact', network: 'eip155:8453' as const } as any;

		await handleStaticRouteVerified(
			httpServer,
			event,
			resolve,
			paymentPayload,
			paymentRequirements
		);

		expect(httpServer.processSettlement).not.toHaveBeenCalled();
	});

	it('adds settlement headers on success', async () => {
		const httpServer = {
			processSettlement: vi.fn().mockResolvedValue({
				success: true,
				transaction: '0xtx',
				payer: '0xPayer',
				headers: { 'Payment-Response': 'encoded', 'X-Custom': 'value' },
			}),
		} as any;

		const event = mockEvent();
		const resolve = mockResolve(200);
		const paymentPayload = { x402Version: 2 } as any;
		const paymentRequirements = { scheme: 'exact', network: 'eip155:8453' as const } as any;

		const response = await handleStaticRouteVerified(
			httpServer,
			event,
			resolve,
			paymentPayload,
			paymentRequirements
		);

		expect(response.headers.get('Payment-Response')).toBe('encoded');
		expect(response.headers.get('X-Custom')).toBe('value');
	});
});

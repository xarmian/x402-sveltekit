import type { RequestEvent, Cookies } from '@sveltejs/kit';

/**
 * Create a mock Cookies object for testing.
 */
function mockCookies(): Cookies {
	const store = new Map<string, string>();
	return {
		get: (name: string) => store.get(name),
		getAll: () => Array.from(store.entries()).map(([name, value]) => ({ name, value })),
		set: (name: string, value: string) => {
			store.set(name, value);
		},
		delete: (name: string) => {
			store.delete(name);
		},
		serialize: (name: string, value: string) => `${name}=${value}`,
	} as Cookies;
}

/**
 * Create a mock RequestEvent for testing.
 */
export function mockEvent(
	opts: {
		method?: string;
		url?: string;
		headers?: Record<string, string>;
		body?: string;
		params?: Record<string, string>;
		locals?: Record<string, unknown>;
	} = {}
): RequestEvent {
	const { method = 'GET', url = 'https://example.com/', headers = {}, body, params = {}, locals = {} } = opts;
	const parsedUrl = new URL(url);
	const request = new Request(url, {
		method,
		headers: new Headers(headers),
		body: body ?? undefined,
	});

	const cookies = mockCookies();
	const responseHeaders = new Headers();

	return {
		request,
		url: parsedUrl,
		params,
		route: { id: null },
		locals: locals as App.Locals,
		cookies,
		getClientAddress: () => '127.0.0.1',
		platform: undefined,
		isDataRequest: false,
		isSubRequest: false,
		setHeaders: (newHeaders: Record<string, string>) => {
			for (const [key, value] of Object.entries(newHeaders)) {
				responseHeaders.set(key, value);
			}
		},
		depends: () => {},
		fetch: globalThis.fetch,
	} as unknown as RequestEvent;
}

/**
 * Create a mock resolve function for testing.
 */
export function mockResolve(status = 200): (event: RequestEvent) => Promise<Response> {
	return async () =>
		new Response(JSON.stringify({ ok: true }), {
			status,
			headers: { 'Content-Type': 'application/json' },
		});
}

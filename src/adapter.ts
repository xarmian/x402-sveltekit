import type { RequestEvent } from '@sveltejs/kit';
import type { HTTPAdapter } from '@x402/core/http';

/**
 * SvelteKit-specific HTTPAdapter that wraps a RequestEvent.
 * Implements the @x402/core HTTPAdapter interface for use with
 * x402HTTPResourceServer.
 */
export class SvelteKitAdapter implements HTTPAdapter {
	private readonly req: Request;
	private readonly url: URL;

	constructor(event: RequestEvent) {
		this.req = event.request;
		this.url = event.url;
	}

	getHeader(name: string): string | undefined {
		return this.req.headers.get(name) ?? undefined;
	}

	getMethod(): string {
		return this.req.method;
	}

	getPath(): string {
		return this.url.pathname;
	}

	getUrl(): string {
		return this.url.href;
	}

	getAcceptHeader(): string {
		return this.req.headers.get('accept') ?? '';
	}

	getUserAgent(): string {
		return this.req.headers.get('user-agent') ?? '';
	}

	getQueryParams(): Record<string, string | string[]> {
		const params: Record<string, string | string[]> = {};
		for (const [key, value] of this.url.searchParams.entries()) {
			const existing = params[key];
			if (existing === undefined) {
				params[key] = value;
			} else if (Array.isArray(existing)) {
				existing.push(value);
			} else {
				params[key] = [existing, value];
			}
		}
		return params;
	}

	getQueryParam(name: string): string | string[] | undefined {
		const values = this.url.searchParams.getAll(name);
		if (values.length === 0) return undefined;
		if (values.length === 1) return values[0];
		return values;
	}
}

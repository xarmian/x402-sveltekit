import { describe, it, expect } from 'vitest';
import { SvelteKitAdapter } from './adapter.js';
import { mockEvent } from './test-helpers.js';

describe('SvelteKitAdapter', () => {
	it('returns header values', () => {
		const event = mockEvent({ headers: { 'x-custom': 'value123' } });
		const adapter = new SvelteKitAdapter(event);
		expect(adapter.getHeader('x-custom')).toBe('value123');
	});

	it('returns undefined for missing headers', () => {
		const event = mockEvent();
		const adapter = new SvelteKitAdapter(event);
		expect(adapter.getHeader('x-nonexistent')).toBeUndefined();
	});

	it('returns the HTTP method', () => {
		const event = mockEvent({ method: 'POST' });
		const adapter = new SvelteKitAdapter(event);
		expect(adapter.getMethod()).toBe('POST');
	});

	it('returns the pathname', () => {
		const event = mockEvent({ url: 'https://example.com/api/v1/draw' });
		const adapter = new SvelteKitAdapter(event);
		expect(adapter.getPath()).toBe('/api/v1/draw');
	});

	it('returns the full URL', () => {
		const event = mockEvent({ url: 'https://example.com/api/test?q=1' });
		const adapter = new SvelteKitAdapter(event);
		expect(adapter.getUrl()).toBe('https://example.com/api/test?q=1');
	});

	it('returns accept header', () => {
		const event = mockEvent({ headers: { accept: 'application/json' } });
		const adapter = new SvelteKitAdapter(event);
		expect(adapter.getAcceptHeader()).toBe('application/json');
	});

	it('returns empty string for missing accept header', () => {
		const event = mockEvent();
		const adapter = new SvelteKitAdapter(event);
		expect(adapter.getAcceptHeader()).toBe('');
	});

	it('returns user-agent header', () => {
		const event = mockEvent({ headers: { 'user-agent': 'TestBot/1.0' } });
		const adapter = new SvelteKitAdapter(event);
		expect(adapter.getUserAgent()).toBe('TestBot/1.0');
	});

	it('returns empty string for missing user-agent', () => {
		const event = mockEvent();
		const adapter = new SvelteKitAdapter(event);
		expect(adapter.getUserAgent()).toBe('');
	});

	it('returns query params', () => {
		const event = mockEvent({ url: 'https://example.com/api?foo=bar&baz=1' });
		const adapter = new SvelteKitAdapter(event);
		expect(adapter.getQueryParams()).toEqual({ foo: 'bar', baz: '1' });
	});

	it('returns multi-value query params as arrays', () => {
		const event = mockEvent({ url: 'https://example.com/api?tag=a&tag=b' });
		const adapter = new SvelteKitAdapter(event);
		expect(adapter.getQueryParams()).toEqual({ tag: ['a', 'b'] });
	});

	it('returns single query param', () => {
		const event = mockEvent({ url: 'https://example.com/api?foo=bar' });
		const adapter = new SvelteKitAdapter(event);
		expect(adapter.getQueryParam('foo')).toBe('bar');
	});

	it('returns undefined for missing query param', () => {
		const event = mockEvent({ url: 'https://example.com/api' });
		const adapter = new SvelteKitAdapter(event);
		expect(adapter.getQueryParam('nope')).toBeUndefined();
	});

	it('returns array for multi-value query param', () => {
		const event = mockEvent({ url: 'https://example.com/api?id=1&id=2' });
		const adapter = new SvelteKitAdapter(event);
		expect(adapter.getQueryParam('id')).toEqual(['1', '2']);
	});
});

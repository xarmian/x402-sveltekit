declare module '@x402/avm/exact/server' {
	import type { x402ResourceServer } from '@x402/core/server';
	export function registerExactAvmScheme(server: x402ResourceServer): x402ResourceServer;
}

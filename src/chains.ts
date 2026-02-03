import type { PaymentOption as X402PaymentOption } from '@x402/core/http';
import type { Network } from '@x402/core/types';
import { networkValidationError } from './errors.js';

/**
 * Network format pattern following CAIP-2 conventions.
 * Format: "namespace:reference" where:
 * - namespace: alphanumeric with optional hyphens (e.g., "eip155", "solana", "cosmos")
 * - reference: alphanumeric with hyphens, underscores, and base64 characters
 *
 * Examples:
 * - "eip155:8453" (Base mainnet)
 * - "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" (Solana mainnet)
 * - "cosmos:cosmoshub-4" (Cosmos Hub)
 * - "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=" (Algorand with base64)
 */
const NETWORK_PATTERN = /^[a-zA-Z0-9-]+:[a-zA-Z0-9+/=_-]+$/;

/**
 * Maximum supported price in USD.
 * Prices above this may lose precision due to floating-point limitations.
 */
const MAX_PRICE_USD = 1_000_000_000; // 1 billion

/**
 * Validate that a network string matches the expected CAIP-2 format.
 *
 * @param network - The network string to validate
 * @throws Error if the network format is invalid
 *
 * @example
 * validateNetwork('eip155:8453'); // Valid - Base mainnet
 * validateNetwork('solana:mainnet'); // Valid - Solana mainnet
 * validateNetwork('cosmos:cosmoshub-4'); // Valid - Cosmos Hub
 * validateNetwork('invalid'); // Throws Error
 */
export function validateNetwork(network: string): asserts network is Network {
	if (!NETWORK_PATTERN.test(network)) {
		throw new Error(networkValidationError(network));
	}
}

/**
 * Format a USD price as a string, avoiding scientific notation.
 * Removes trailing zeros for cleaner output.
 *
 * @param priceUsd - The price in USD (must be non-negative, max 1 billion)
 * @returns A formatted price string like "$0.01" or "$0.0000005"
 * @throws Error if price is negative or exceeds maximum
 */
function formatPrice(priceUsd: number): string {
	if (priceUsd < 0) {
		throw new Error('Price must be non-negative');
	}
	if (priceUsd > MAX_PRICE_USD) {
		throw new Error(`Price exceeds maximum supported value of $${MAX_PRICE_USD}`);
	}
	// Use toFixed(10) to handle very small values without scientific notation
	// Then remove trailing zeros and unnecessary decimal point
	const fixed = priceUsd.toFixed(10);
	const trimmed = fixed.replace(/\.?0+$/, '');
	return `$${trimmed}`;
}

export interface ChainConfig {
	payTo: string;
	network: Network;
}

export interface ChainsConfig {
	evm: ChainConfig[];
	solana: ChainConfig | null;
	algorand: ChainConfig | null;
}

/**
 * Build payment option objects for all enabled chains at the given USD price.
 * Validates network formats at runtime.
 *
 * @param chains - Configuration for enabled blockchain networks
 * @param priceUsd - The price in USD (supports very small values like 0.00000001)
 * @returns Array of payment options for all enabled chains
 *
 * @example
 * const options = buildPaymentOptions({
 *   evm: [{ payTo: '0x123...', network: 'eip155:8453' }],
 *   solana: null,
 *   algorand: null,
 * }, 0.01);
 */
export function buildPaymentOptions(chains: ChainsConfig, priceUsd: number): X402PaymentOption[] {
	const options: X402PaymentOption[] = [];
	const priceStr = formatPrice(priceUsd);

	for (const entry of chains.evm) {
		validateNetwork(entry.network);
		options.push({
			scheme: 'exact',
			price: priceStr,
			network: entry.network,
			payTo: entry.payTo,
		});
	}
	if (chains.solana) {
		validateNetwork(chains.solana.network);
		options.push({
			scheme: 'exact',
			price: priceStr,
			network: chains.solana.network,
			payTo: chains.solana.payTo,
		});
	}
	if (chains.algorand) {
		validateNetwork(chains.algorand.network);
		options.push({
			scheme: 'exact',
			price: priceStr,
			network: chains.algorand.network,
			payTo: chains.algorand.payTo,
		});
	}

	return options;
}

/**
 * Return names of chains that have a non-null/non-empty config.
 */
export function getEnabledChainNames(chains: ChainsConfig): string[] {
	const names: string[] = [];
	if (chains.evm.length > 0) names.push('evm');
	if (chains.solana) names.push('solana');
	if (chains.algorand) names.push('algorand');
	return names;
}

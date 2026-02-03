import { describe, it, expect } from 'vitest';
import { buildPaymentOptions, getEnabledChainNames, validateNetwork, type ChainsConfig } from './chains.js';

const evmBase = { payTo: '0xAbC123', network: 'eip155:8453' as `${string}:${string}` };
const evmSepolia = { payTo: '0xAbC123', network: 'eip155:84532' as `${string}:${string}` };
const solanaChain = {
	payTo: 'SoLpUbKeY123',
	network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as `${string}:${string}`,
};
const algorandChain = {
	payTo: 'ALGO_ADDR_XYZ',
	network: 'algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=' as `${string}:${string}`,
};

describe('buildPaymentOptions', () => {
	it('returns 1 option for single EVM network', () => {
		const chains: ChainsConfig = { evm: [evmBase], solana: null, algorand: null };
		const options = buildPaymentOptions(chains, 0.004);
		expect(options).toHaveLength(1);
		expect(options[0]).toEqual({
			scheme: 'exact',
			price: '$0.004',
			network: evmBase.network,
			payTo: evmBase.payTo,
		});
	});

	it('returns 2 options for EVM with two networks', () => {
		const chains: ChainsConfig = { evm: [evmBase, evmSepolia], solana: null, algorand: null };
		const options = buildPaymentOptions(chains, 0.01);
		expect(options).toHaveLength(2);
		expect(options[0].network).toBe('eip155:8453');
		expect(options[1].network).toBe('eip155:84532');
		expect(options[0].payTo).toBe(options[1].payTo);
		expect(options[0].price).toBe(options[1].price);
	});

	it('returns options for EVM + Solana', () => {
		const chains: ChainsConfig = { evm: [evmBase], solana: solanaChain, algorand: null };
		const options = buildPaymentOptions(chains, 0.01);
		expect(options).toHaveLength(2);
		expect(options[0].network).toBe(evmBase.network);
		expect(options[1].network).toBe(solanaChain.network);
		expect(options[0].price).toBe(options[1].price);
	});

	it('returns options for all chains including multi-network EVM', () => {
		const chains: ChainsConfig = {
			evm: [evmBase, evmSepolia],
			solana: solanaChain,
			algorand: algorandChain,
		};
		const options = buildPaymentOptions(chains, 0.035);
		expect(options).toHaveLength(4);
		expect(options[0].network).toBe('eip155:8453');
		expect(options[1].network).toBe('eip155:84532');
		expect(options[2].network).toBe(solanaChain.network);
		expect(options[3].network).toBe(algorandChain.network);
	});

	it('returns empty array when no chains configured', () => {
		const chains: ChainsConfig = { evm: [], solana: null, algorand: null };
		expect(buildPaymentOptions(chains, 0.004)).toEqual([]);
	});

	it('maps correct payTo for each chain', () => {
		const chains: ChainsConfig = {
			evm: [evmBase],
			solana: solanaChain,
			algorand: algorandChain,
		};
		const options = buildPaymentOptions(chains, 1);
		expect(options[0].payTo).toBe(evmBase.payTo);
		expect(options[1].payTo).toBe(solanaChain.payTo);
		expect(options[2].payTo).toBe(algorandChain.payTo);
	});

	it('returns Solana-only option when only Solana configured', () => {
		const chains: ChainsConfig = { evm: [], solana: solanaChain, algorand: null };
		const options = buildPaymentOptions(chains, 0.001);
		expect(options).toHaveLength(1);
		expect(options[0].network).toBe(solanaChain.network);
	});

	it('formats very small prices without scientific notation', () => {
		const chains: ChainsConfig = { evm: [evmBase], solana: null, algorand: null };
		const options = buildPaymentOptions(chains, 0.00000001);
		expect(options[0].price).toBe('$0.00000001');
		// Should not contain 'e' for scientific notation
		expect(options[0].price).not.toMatch(/e/i);
	});

	it('formats medium prices correctly', () => {
		const chains: ChainsConfig = { evm: [evmBase], solana: null, algorand: null };
		const options = buildPaymentOptions(chains, 0.05);
		expect(options[0].price).toBe('$0.05');
	});

	it('formats whole dollar amounts without trailing zeros', () => {
		const chains: ChainsConfig = { evm: [evmBase], solana: null, algorand: null };
		const options = buildPaymentOptions(chains, 1);
		expect(options[0].price).toBe('$1');
	});

	it('formats prices with trailing zeros correctly', () => {
		const chains: ChainsConfig = { evm: [evmBase], solana: null, algorand: null };
		const options = buildPaymentOptions(chains, 0.1);
		expect(options[0].price).toBe('$0.1');
	});
});

describe('getEnabledChainNames', () => {
	it('returns empty for no chains', () => {
		expect(getEnabledChainNames({ evm: [], solana: null, algorand: null })).toEqual([]);
	});

	it('returns all names when all enabled', () => {
		expect(
			getEnabledChainNames({ evm: [evmBase], solana: solanaChain, algorand: algorandChain })
		).toEqual(['evm', 'solana', 'algorand']);
	});

	it('returns only enabled chains', () => {
		expect(
			getEnabledChainNames({ evm: [evmBase], solana: null, algorand: algorandChain })
		).toEqual(['evm', 'algorand']);
	});

	it('returns evm for multi-network EVM config', () => {
		expect(
			getEnabledChainNames({ evm: [evmBase, evmSepolia], solana: null, algorand: null })
		).toEqual(['evm']);
	});
});

describe('validateNetwork', () => {
	it('accepts valid EVM network format', () => {
		expect(() => validateNetwork('eip155:8453')).not.toThrow();
		expect(() => validateNetwork('eip155:1')).not.toThrow();
		expect(() => validateNetwork('eip155:84532')).not.toThrow();
	});

	it('accepts valid Solana network format', () => {
		expect(() => validateNetwork('solana:mainnet')).not.toThrow();
		expect(() => validateNetwork('solana:devnet')).not.toThrow();
		expect(() => validateNetwork('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')).not.toThrow();
	});

	it('accepts valid Algorand network format', () => {
		expect(() => validateNetwork('algorand:mainnet-v1')).not.toThrow();
		expect(() => validateNetwork('algorand:testnet-v1')).not.toThrow();
	});

	it('rejects empty string', () => {
		expect(() => validateNetwork('')).toThrow('Invalid network format');
	});

	it('rejects network without colon', () => {
		expect(() => validateNetwork('eip1558453')).toThrow('Invalid network format');
	});

	it('rejects network with only colon', () => {
		expect(() => validateNetwork(':')).toThrow('Invalid network format');
	});

	it('rejects network with multiple colons', () => {
		expect(() => validateNetwork('eip155:8453:extra')).toThrow('Invalid network format');
	});

	it('rejects network with spaces', () => {
		expect(() => validateNetwork('eip155: 8453')).toThrow('Invalid network format');
	});

	it('rejects network with special characters', () => {
		expect(() => validateNetwork('eip155:8453!')).toThrow('Invalid network format');
	});
});

describe('buildPaymentOptions network validation', () => {
	it('throws on invalid EVM network format', () => {
		const chains: ChainsConfig = {
			evm: [{ payTo: '0xAbC', network: 'invalid' as any }],
			solana: null,
			algorand: null,
		};
		expect(() => buildPaymentOptions(chains, 0.01)).toThrow('Invalid network format');
	});

	it('throws on invalid Solana network format', () => {
		const chains: ChainsConfig = {
			evm: [],
			solana: { payTo: 'addr', network: 'bad format' as any },
			algorand: null,
		};
		expect(() => buildPaymentOptions(chains, 0.01)).toThrow('Invalid network format');
	});

	it('throws on invalid Algorand network format', () => {
		const chains: ChainsConfig = {
			evm: [],
			solana: null,
			algorand: { payTo: 'addr', network: '' as any },
		};
		expect(() => buildPaymentOptions(chains, 0.01)).toThrow('Invalid network format');
	});
});

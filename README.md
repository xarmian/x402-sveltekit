# x402-sveltekit

SvelteKit middleware for the [x402 HTTP payment protocol](https://x402.org). Enforce crypto payments on your SvelteKit API routes using the standard `Handle` hook.

## Install

```bash
npm install x402-sveltekit @x402/core

# Install the chain schemes you need:
npm install @x402/evm    # EVM chains (Base, Ethereum, etc.)
npm install @x402/svm    # Solana
```

## Quick Start

```ts
// src/hooks.server.ts
import { sequence } from '@sveltejs/kit/hooks';
import { paymentHookFromConfig } from 'x402-sveltekit';
import { registerExactEvmScheme } from '@x402/evm/exact/server';

const x402Handle = paymentHookFromConfig({
  facilitatorUrl: 'https://x402.org/facilitator',
  schemes: [
    { register: registerExactEvmScheme },
  ],
  routes: {
    'GET /api/premium': {
      accepts: [
        {
          scheme: 'exact',
          network: 'eip155:8453', // Base mainnet
          payTo: '0xYourWalletAddress',
          price: '$0.01',
        },
      ],
      description: 'Premium API endpoint',
    },
  },
});

export const handle = sequence(x402Handle, yourAppHandle);
```

## Multi-Chain Support

Register multiple chain schemes to accept payments on different networks:

```ts
import { registerExactEvmScheme } from '@x402/evm/exact/server';
import { registerExactSvmScheme } from '@x402/svm/exact/server';

const x402Handle = paymentHookFromConfig({
  facilitatorUrl: 'https://x402.org/facilitator',
  schemes: [
    { register: registerExactEvmScheme },  // EVM chains
    { register: registerExactSvmScheme },  // Solana
    // Future: { register: registerExactAvmScheme } for Algorand
  ],
  routes: { ... },
});
```

## Three API Levels

### Level 3: `paymentHookFromConfig` (recommended)

The simplest API — provide a facilitator URL, schemes, and routes:

```ts
import { paymentHookFromConfig } from 'x402-sveltekit';
import { registerExactEvmScheme } from '@x402/evm/exact/server';

const handle = paymentHookFromConfig({
  facilitatorUrl: 'https://x402.org/facilitator',
  schemes: [{ register: registerExactEvmScheme }],
  routes: { ... },
  enabled: true, // default: true
});
```

### Level 2: `paymentHook`

Bring your own `x402ResourceServer`. Useful when you need custom configuration or lifecycle hooks:

```ts
import { paymentHook } from 'x402-sveltekit';
import { x402ResourceServer } from '@x402/core/server';
import { HTTPFacilitatorClient } from '@x402/core/http';
import { registerExactEvmScheme } from '@x402/evm/exact/server';

const facilitator = new HTTPFacilitatorClient({ url: '...' });
const server = new x402ResourceServer(facilitator);
registerExactEvmScheme(server);

const handle = paymentHook({
  resourceServer: server,
  routes: { ... },
});
```

### Level 1: `paymentHookFromHTTPServer`

Bring your own fully-configured `x402HTTPResourceServer`. For static routes only:

```ts
import { paymentHookFromHTTPServer } from 'x402-sveltekit';
import { x402HTTPResourceServer } from '@x402/core/http';

const httpServer = new x402HTTPResourceServer(resourceServer, routes);
await httpServer.initialize();

const handle = paymentHookFromHTTPServer(httpServer);
```

## Dynamic Routes

Compute payment options per-request. Return `null` or `[]` to allow free access:

```ts
const handle = paymentHookFromConfig({
  facilitatorUrl: '...',
  schemes: [{ register: registerExactEvmScheme }],
  routes: {
    'POST /api/v1/generate': {
      accepts: async (event) => {
        const body = await event.request.json();

        // Free tier — no payment needed
        if (body.size === 'small') return null;

        // Dynamic pricing based on request
        const price = computePrice(body);
        return [
          { scheme: 'exact', network: 'eip155:8453', payTo: '0x...', price: `$${price}` },
        ];
      },
      description: 'Generate content',
      mimeType: 'application/json',
    },
  },
});
```

## Accessing Payment Info

After successful payment verification, payment info is available in `event.locals.x402`:

```ts
// In your +server.ts route handler
export async function POST({ locals }) {
  if (locals.x402) {
    console.log('Paid by:', locals.x402.payer);
    console.log('Network:', locals.x402.network);
    console.log('Transaction:', locals.x402.transaction);
  }
}
```

## Chain Helpers

Utility functions for building multi-chain payment options:

```ts
import { buildPaymentOptions, getEnabledChainNames } from 'x402-sveltekit';

const chains = {
  evm: [
    { payTo: '0x...', network: 'eip155:8453' },    // Base mainnet
    { payTo: '0x...', network: 'eip155:84532' },   // Base Sepolia
  ],
  solana: { payTo: 'So1...', network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' },
  algorand: null, // Not configured
};

const options = buildPaymentOptions(chains, 0.01); // $0.01 on all configured chains
const enabled = getEnabledChainNames(chains); // ['evm', 'solana']
```

## TypeScript

Add payment info types to your `app.d.ts`:

```ts
import type { PaymentInfo } from 'x402-sveltekit';

declare global {
  namespace App {
    interface Locals {
      x402?: PaymentInfo;
    }
  }
}
```

## Supported Networks

Networks use [CAIP-2](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md) format:

| Chain | Network ID | Example |
|-------|------------|---------|
| Base | `eip155:8453` | Mainnet |
| Base Sepolia | `eip155:84532` | Testnet |
| Ethereum | `eip155:1` | Mainnet |
| Solana | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | Mainnet |

## License

Apache-2.0

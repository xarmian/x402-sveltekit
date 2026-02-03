# x402-sveltekit

SvelteKit middleware for the [x402 HTTP payment protocol](https://x402.org). Enforce crypto payments on your SvelteKit API routes using the standard `Handle` hook.

## Install

```bash
npm install x402-sveltekit @x402/core @x402/evm
# Optional: npm install @x402/svm @x402/avm
```

## Quick Start

The simplest way to get started — `paymentHookFromConfig` handles all setup:

```ts
// src/hooks.server.ts
import { sequence } from '@sveltejs/kit/hooks';
import { paymentHookFromConfig } from 'x402-sveltekit';

const x402Handle = paymentHookFromConfig({
  facilitatorUrl: 'https://x402.org/facilitator',
  routes: {
    'GET /api/premium': {
      accepts: [
        {
          scheme: 'exact',
          network: 'eip155:8453',
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

## Three API Levels

### Level 3: `paymentHookFromConfig` (recommended)

Auto-configures everything from a facilitator URL. Automatically discovers and registers installed chain schemes (`@x402/evm`, `@x402/svm`, `@x402/avm`).

```ts
import { paymentHookFromConfig } from 'x402-sveltekit';

const handle = paymentHookFromConfig({
  facilitatorUrl: 'https://x402.org/facilitator',
  routes: { ... },
  enabled: true, // defaults to true
});
```

### Level 2: `paymentHook`

Bring your own `x402ResourceServer` and routes. Useful when you need custom scheme registration or lifecycle hooks.

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

Bring your own fully-configured `x402HTTPResourceServer`. For static routes only.

```ts
import { paymentHookFromHTTPServer } from 'x402-sveltekit';
import { x402HTTPResourceServer } from '@x402/core/http';

const httpServer = new x402HTTPResourceServer(resourceServer, routes);
await httpServer.initialize();

const handle = paymentHookFromHTTPServer(httpServer);
```

## Dynamic Routes

Compute payment options per-request. Return `null` to allow free access:

```ts
const handle = paymentHookFromConfig({
  facilitatorUrl: '...',
  routes: {
    'POST /api/v1/draw': {
      accepts: async (event) => {
        const body = await event.request.json();

        // Free tier — no payment needed
        if (!body.longevity) return null;

        // Dynamic pricing
        const price = computePrice(body);
        return [
          { scheme: 'exact', network: 'eip155:8453', payTo: '0x...', price: `$${price}` },
        ];
      },
      description: 'Draw with longevity',
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

Utility functions for multi-chain payment options:

```ts
import { buildPaymentOptions, getEnabledChainNames } from 'x402-sveltekit';

const chains = {
  evm: [{ payTo: '0x...', network: 'eip155:8453' }],
  solana: { payTo: 'So1...', network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' },
  algorand: null,
};

const options = buildPaymentOptions(chains, 0.01); // $0.01 on all chains
const enabled = getEnabledChainNames(chains); // ['evm', 'solana']
```

## Custom Scheme Registration

```ts
import { paymentHookFromConfig } from 'x402-sveltekit';
import { registerExactEvmScheme } from '@x402/evm/exact/server';

const handle = paymentHookFromConfig({
  facilitatorUrl: '...',
  schemes: [
    { register: (server) => registerExactEvmScheme(server) },
  ],
  routes: { ... },
});
```

## TypeScript

Add payment info to your `app.d.ts`:

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

## License

Apache-2.0

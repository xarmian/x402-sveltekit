# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SvelteKit middleware for the x402 HTTP payment protocol. Provides a server hook that intercepts 402 Payment Required responses and handles payment negotiation with blockchain wallets (EVM and SVM chains).

## Development Commands

- `npm run build` - Build with tsup
- `npm test` - Run tests with Vitest
- `npm run test:watch` - Run tests in watch mode

## Architecture

Single-directory library (`src/`) with these key files:

- **`hook.ts`** - SvelteKit server hook that intercepts requests and handles x402 payment flow
- **`adapter.ts`** - Payment adapter that bridges x402/core with SvelteKit's request/response model
- **`chains.ts`** - Chain configuration and detection (EVM/SVM)
- **`types.ts`** - TypeScript types for configuration and payments
- **`utils.ts`** - Helper utilities
- **`errors.ts`** - Custom error types
- **`logger.ts`** - Logging utilities
- **`index.ts`** - Public exports

## Key Dependencies

- **`@x402/core`** - Core x402 protocol (required)
- **`@sveltejs/kit`** - SvelteKit (peer dependency)
- **`@x402/evm`** - EVM chain support (optional peer dependency)
- **`@x402/svm`** - SVM chain support (optional peer dependency)

## Release Process

1. Bump the version in `package.json`
2. Commit: `git commit -am "vX.Y.Z"`
3. Tag: `git tag vX.Y.Z`
4. Push with tags: `git push origin main --tags`
5. The `publish.yml` workflow automatically handles npm publish (with OIDC provenance) and GitHub Release creation

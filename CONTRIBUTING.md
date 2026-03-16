# Contributing to Proof of Agent

Thanks for your interest in PoA. This is an open standard — contributions make it stronger.

## Ways to contribute

**Spec feedback** — Open an issue if you spot gaps, ambiguities, or improvements to `spec/POA-SPEC-v0.1.md`. The standard is in draft and actively evolving.

**SDK integrations** — PRs for additional language SDKs (Python, Rust, Go) are welcome. Follow the same patterns as the TypeScript SDK.

**Agent framework plugins** — Integrations with elizaOS, Solana Agent Kit, GOAT, or other agent frameworks. If you build a plugin, open a PR to add it to `examples/`.

**Bug reports** — If you find issues with the Anchor program or SDK, open an issue with reproduction steps.

**Documentation** — Improvements to the README, spec, or inline code comments.

## Development setup

```bash
# Clone the repo
git clone https://github.com/KiyoKanshiEdits/proof-of-agent.git
cd proof-of-agent/poa

# Install dependencies
yarn install

# Build the program
anchor build

# Run tests (start local validator first)
solana-test-validator
# In another terminal:
anchor test --skip-local-validator

# Build the SDK
cd sdk && npm install && npm run build
```

## Pull request guidelines

- Keep PRs focused — one feature or fix per PR
- Include tests for new functionality
- Update the spec if your change affects the receipt schema or instructions
- Use clear commit messages

## Code of conduct

Be respectful. This is a collaborative project building open infrastructure for the agent economy.

## Questions?

Open an issue or reach out on X.

# JavaScript client

A generated JavaScript library for the Program Metadata program.

## Getting started

To build and test your JavaScript client from the root of the repository, you may use the following command.

```sh
make test-js-clients-js
```

This will build the program and run the tests for your JavaScript client. Tests run in-memory via [LiteSVM](https://github.com/LiteSVM/litesvm) — no local validator required.

## Available client scripts.

Alternatively, you can go into the client directory and run the tests directly.

```sh
# Build your programs so the compiled `.so` file is available for LiteSVM.
make build-sbf-program

# Go into the client directory and run the tests.
cd clients/js
pnpm install
pnpm build
pnpm test
```

You may also use the following scripts to lint and/or format your JavaScript client.

```sh
pnpm lint
pnpm lint:fix
pnpm format
pnpm format:fix
```

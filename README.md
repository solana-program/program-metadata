# Program Metadata

<a href="https://github.com/solana-program/program-metadata/actions/workflows/main.yml"><img src="https://img.shields.io/github/actions/workflow/status/solana-program/program-metadata/main.yml?logo=GitHub" /></a>
<a href="https://explorer.solana.com/address/ProgM6JCCvbYkfKqJYHePx4xxSUSqJp7rh8Lyv7nk7S"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fsolana-program%2Fprogram-metadata%2Fmain%2Fprogram%2Fidl.json&query=%24.version&label=program&logo=data:image/svg%2bxml;base64,PHN2ZyB3aWR0aD0iMzEzIiBoZWlnaHQ9IjI4MSIgdmlld0JveD0iMCAwIDMxMyAyODEiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxnIGNsaXAtcGF0aD0idXJsKCNjbGlwMF80NzZfMjQzMCkiPgo8cGF0aCBkPSJNMzExLjMxOCAyMjEuMDU3TDI1OS42NiAyNzYuNTU4QzI1OC41MzcgMjc3Ljc2NCAyNTcuMTc4IDI3OC43MjUgMjU1LjY2OSAyNzkuMzgyQzI1NC4xNTkgMjgwLjAzOSAyNTIuNTMgMjgwLjM3OCAyNTAuODg0IDI4MC4zNzdINS45OTcxOUM0LjgyODcgMjgwLjM3NyAzLjY4NTY4IDI4MC4wMzUgMi43MDg1NSAyNzkuMzkzQzEuNzMxNDMgMjc4Ljc1MSAwLjk2Mjc3MSAyNzcuODM3IDAuNDk3MDIgMjc2Ljc2NEMwLjAzMTI2OTEgMjc1LjY5IC0wLjExMTI4NiAyNzQuNTA0IDAuMDg2ODcxMiAyNzMuMzVDMC4yODUwMjggMjcyLjE5NiAwLjgxNTI2NSAyNzEuMTI2IDEuNjEyNDMgMjcwLjI3TDUzLjMwOTkgMjE0Ljc2OUM1NC40Mjk5IDIxMy41NjYgNTUuNzg0MyAyMTIuNjA3IDU3LjI4OTMgMjExLjk1QzU4Ljc5NDMgMjExLjI5MyA2MC40MTc4IDIxMC45NTMgNjIuMDU5NSAyMTAuOTVIMzA2LjkzM0MzMDguMTAxIDIxMC45NSAzMDkuMjQ0IDIxMS4yOTIgMzEwLjIyMSAyMTEuOTM0QzMxMS4xOTkgMjEyLjU3NiAzMTEuOTY3IDIxMy40OSAzMTIuNDMzIDIxNC41NjRDMzEyLjg5OSAyMTUuNjM3IDMxMy4wNDEgMjE2LjgyNCAzMTIuODQzIDIxNy45NzdDMzEyLjY0NSAyMTkuMTMxIDMxMi4xMTUgMjIwLjIwMSAzMTEuMzE4IDIyMS4wNTdaTTI1OS42NiAxMDkuMjk0QzI1OC41MzcgMTA4LjA4OCAyNTcuMTc4IDEwNy4xMjcgMjU1LjY2OSAxMDYuNDdDMjU0LjE1OSAxMDUuODEzIDI1Mi41MyAxMDUuNDc0IDI1MC44ODQgMTA1LjQ3NUg1Ljk5NzE5QzQuODI4NyAxMDUuNDc1IDMuNjg1NjggMTA1LjgxNyAyLjcwODU1IDEwNi40NTlDMS43MzE0MyAxMDcuMTAxIDAuOTYyNzcxIDEwOC4wMTUgMC40OTcwMiAxMDkuMDg4QzAuMDMxMjY5MSAxMTAuMTYyIC0wLjExMTI4NiAxMTEuMzQ4IDAuMDg2ODcxMiAxMTIuNTAyQzAuMjg1MDI4IDExMy42NTYgMC44MTUyNjUgMTE0LjcyNiAxLjYxMjQzIDExNS41ODJMNTMuMzA5OSAxNzEuMDgzQzU0LjQyOTkgMTcyLjI4NiA1NS43ODQzIDE3My4yNDUgNTcuMjg5MyAxNzMuOTAyQzU4Ljc5NDMgMTc0LjU1OSA2MC40MTc4IDE3NC44OTkgNjIuMDU5NSAxNzQuOTAySDMwNi45MzNDMzA4LjEwMSAxNzQuOTAyIDMwOS4yNDQgMTc0LjU2IDMxMC4yMjEgMTczLjkxOEMzMTEuMTk5IDE3My4yNzYgMzExLjk2NyAxNzIuMzYyIDMxMi40MzMgMTcxLjI4OEMzMTIuODk5IDE3MC4yMTUgMzEzLjA0MSAxNjkuMDI4IDMxMi44NDMgMTY3Ljg3NUMzMTIuNjQ1IDE2Ni43MjEgMzEyLjExNSAxNjUuNjUxIDMxMS4zMTggMTY0Ljc5NUwyNTkuNjYgMTA5LjI5NFpNNS45OTcxOSA2OS40MjY3SDI1MC44ODRDMjUyLjUzIDY5LjQyNzUgMjU0LjE1OSA2OS4wODkgMjU1LjY2OSA2OC40MzJDMjU3LjE3OCA2Ny43NzUxIDI1OC41MzcgNjYuODEzOSAyNTkuNjYgNjUuNjA4MkwzMTEuMzE4IDEwLjEwNjlDMzEyLjExNSA5LjI1MTA3IDMxMi42NDUgOC4xODA1NiAzMTIuODQzIDcuMDI2OTVDMzEzLjA0MSA1Ljg3MzM0IDMxMi44OTkgNC42ODY4NiAzMTIuNDMzIDMuNjEzM0MzMTEuOTY3IDIuNTM5NzQgMzExLjE5OSAxLjYyNTg2IDMxMC4yMjEgMC45ODM5NDFDMzA5LjI0NCAwLjM0MjAyNiAzMDguMTAxIDMuOTUzMTRlLTA1IDMwNi45MzMgMEw2Mi4wNTk1IDBDNjAuNDE3OCAwLjAwMjc5ODY2IDU4Ljc5NDMgMC4zNDMxNCA1Ny4yODkzIDAuOTk5OTUzQzU1Ljc4NDMgMS42NTY3NyA1NC40Mjk5IDIuNjE2MDcgNTMuMzA5OSAzLjgxODQ3TDEuNjI1NzYgNTkuMzE5N0MwLjgyOTM2MSA2MC4xNzQ4IDAuMjk5MzU5IDYxLjI0NCAwLjEwMDc1MiA2Mi4zOTY0Qy0wLjA5Nzg1MzkgNjMuNTQ4OCAwLjA0MzU2OTggNjQuNzM0MiAwLjUwNzY3OSA2NS44MDczQzAuOTcxNzg5IDY2Ljg4MDMgMS43Mzg0MSA2Ny43OTQzIDIuNzEzNTIgNjguNDM3MkMzLjY4ODYzIDY5LjA4MDIgNC44Mjk4NCA2OS40MjQgNS45OTcxOSA2OS40MjY3WiIgZmlsbD0idXJsKCNwYWludDBfbGluZWFyXzQ3Nl8yNDMwKSIvPgo8L2c+CjxkZWZzPgo8bGluZWFyR3JhZGllbnQgaWQ9InBhaW50MF9saW5lYXJfNDc2XzI0MzAiIHgxPSIyNi40MTUiIHkxPSIyODcuMDU5IiB4Mj0iMjgzLjczNSIgeTI9Ii0yLjQ5NTc0IiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+CjxzdG9wIG9mZnNldD0iMC4wOCIgc3RvcC1jb2xvcj0iIzk5NDVGRiIvPgo8c3RvcCBvZmZzZXQ9IjAuMyIgc3RvcC1jb2xvcj0iIzg3NTJGMyIvPgo8c3RvcCBvZmZzZXQ9IjAuNSIgc3RvcC1jb2xvcj0iIzU0OTdENSIvPgo8c3RvcCBvZmZzZXQ9IjAuNiIgc3RvcC1jb2xvcj0iIzQzQjRDQSIvPgo8c3RvcCBvZmZzZXQ9IjAuNzIiIHN0b3AtY29sb3I9IiMyOEUwQjkiLz4KPHN0b3Agb2Zmc2V0PSIwLjk3IiBzdG9wLWNvbG9yPSIjMTlGQjlCIi8+CjwvbGluZWFyR3JhZGllbnQ+CjxjbGlwUGF0aCBpZD0iY2xpcDBfNDc2XzI0MzAiPgo8cmVjdCB3aWR0aD0iMzEyLjkzIiBoZWlnaHQ9IjI4MC4zNzciIGZpbGw9IndoaXRlIi8+CjwvY2xpcFBhdGg+CjwvZGVmcz4KPC9zdmc+Cg==&color=9945FF" /></a>
<a href="https://www.npmjs.com/package/@solana-program/program-metadata"><img src="https://img.shields.io/npm/v/%40solana-program%2Fprogram-metadata?logo=npm&color=377CC0" /></a>
<a href="https://crates.io/crates/spl-program-metadata-client"><img src="https://img.shields.io/crates/v/spl-program-metadata-client?logo=rust" /></a>

Attach custom data to any program.

## Overview

The Program Metadata provides the ability to attach metadata information to any program. The information is represented by a PDA account with a pre-defined derivation, e.g., it can be used to add the IDL of a program, with a PDA derived using the `"idl"` string.

There are two types of metadata accounts:

- canonical: these are metadata accounts created by the program upgrade authority. They are derived from `[program key, seed]`.
- non-canonical (a.k.a. _third-party_): these are metadata account created by any authority. They are derived from `[program key, authority key, seed]`.

While there can only be a single canonical metadata account for a pair _(program, seed)_, there can be any number of non-canonical metadata accounts. The rationale is to allow anyone to add additional metadata to any program, but also provide a mechanism to differentiate metadata information added by the program upgrade authority.The canonical metadata accounts are very easy to find by using the ProgramId and the seed.
The metadata is either saved on chain in an account or it can be saved to a URL or another account.

## Quick Start

Upload an IDL or security.txt file to your program in one command:

```sh
# Upload IDL (as upgrade authority using the default CLI keypair)
npx @solana-program/program-metadata write idl <program-id> ./idl.json

# Upload metadata with additional information about your program similar to security.txt
npx @solana-program/program-metadata write security <program-id> ./security.json
```

At the moment the Solana explorer only reads Codama IDLs that are uploaded as canonical metadata accounts. But soon it will also support security files and Anchor IDLs.

## Usage

The CLI supports both canonical (program upgrade authority) and non-canonical (third-party) metadata accounts, using a seed-based approach (e.g. "idl", "security").

### Installation

You can run the CLI directly with npx (no install required):

```sh
npx @solana-program/program-metadata <command> [options]
```

Or install globally:

```sh
npm install -g @solana-program/program-metadata
```

See all the commands:

```sh
npx @solana-program/program-metadata --help
```

### Commands

#### Create a Metadata Account

Create a new metadata account for a program (either creates or updates if it already exists):

```sh
npx @solana-program/program-metadata write <seed> <program-id> <file> [options]
```

- `<seed>`: e.g. "idl", "security" as standard or anything else you want to use for other data
- `<program-id>`: The program's address
- `<file>`: Path to the metadata or IDL file (JSON, YAML, TOML, etc.)
- `<url>`: Optionally point to a URL containing the metadata
- `<account>`: Optionally point to an account address that contains the metadata. When using this option you also need to set offset and account length: `--account-offset` and `--account-length`

#### Fetch Metadata

Download metadata to a file or print to stdout:

```sh
npx @solana-program/program-metadata fetch <seed> <program-id> [options]
```

- `--output <file>`: Save to file
- `--raw`: Output raw data in hex

#### Authority and Account Management

By default your keypair that creates the metadata account will be its authority. You can change the authority by using the `set-authority` command. This can be useful when you don't want to update the metadata using the program authority going forward or if you use a multisig to create the metadata account for example. (Multisig instructions see further down)

- Set a new authority:  
  `npx @solana-program/program-metadata set-authority <seed> <program-id> --new-authority <pubkey>`
  Note that the program upgrade authority can always claim back the metadata account if it is not immutable.
- Remove authority:  
  `npx @solana-program/program-metadata remove-authority <seed> <program-id>`
  This will leave only the upgrade authority as the authority of the metadata account.
- Make metadata immutable:  
  `npx @solana-program/program-metadata set-immutable <seed> <program-id>`
  This will make the metadata account immutable and cannot be updated anymore, even for the update authority.
- Close metadata account:  
  `npx @solana-program/program-metadata close <seed> <program-id>`
  This will close the account and you can reclaim the rent.

#### Buffer Management

Using a buffer account you can split the metadata update into the uploading of the data part and then assign the buffer to the program in a later transaction.

- Create/update/fetch/close buffer accounts:  
  `npx @solana-program/program-metadata create-buffer|update-buffer|fetch-buffer|close-buffer ...`
- List all buffer accounts for an authority:  
  `npx @solana-program/program-metadata list-buffers [authority]`
- Update a metadata account with a buffer:  
  `npx @solana-program/program-metadata write <seed> <program-id> --buffer <buffer-address>`

### Options

- `--keypair <path>`: Path to keypair file (defaults to Solana config)
- `--url <string>`: Custom RPC URL
- `--non-canonical <pubkey>`: Use a non-canonical (third-party) metadata account, derived with your authority pubkey as an extra seed
- `--priority-fees <number>`: Priority fees per compute unit

#### Squads Multisig

You can also use the program metadata program as a multisig.
All commands in the CLI can also be exported as transactions in various formats using the `--export` flag.
For updating a metadata account of a program that is managed by a Squads multisig you need to create a buffer first and then export a transaction that you can then import and sign in Squads or any other multisig of your choosing.

1. Transfer the program authority to the squad using the [squads dashboard](https://app.squads.so/squads)
2. Create the buffer account and transfer ownership to the squad

```bash
npx @solana-program/program-metadata create-buffer ./target/idl/let_me_buy.json
npx @solana-program/program-metadata set-buffer-authority <buffer-address> --new-authority <multisig-address>
```

3. Export the transaction as base58 and then import it into your multisig under `developers/txBuilder/createTransaction/addInstruction/ImportAsBase58`

```bash
npx @solana-program/program-metadata write idl <program-address> --buffer <buffer-address> --export <multisig-address> --export-encoding base58 --close-buffer <your-address-to-get-the-buffer-rent-back>
```

4. Sign the transaction in your multisig and send it

### Examples

**Upload IDL as canonical (upgrade authority):**

```sh
npx @solana-program/program-metadata write idl <program-id> ./idl.json --keypair <authority-keypair>
```

**Upload metadata as third-party (non-canonical):**

```sh
npx @solana-program/program-metadata write idl <program-id> ./metadata.json --non-canonical <your-pubkey>
```

**Fetch canonical metadata:**

```sh
npx @solana-program/program-metadata fetch idl <program-id> --output ./idl.json
```

**Fetch non-canonical metadata:**

```sh
npx @solana-program/program-metadata fetch idl <program-id> --non-canonical <pubkey> --output ./idl.json
```

**Close a metadata account:**

```sh
npx @solana-program/program-metadata close idl <program-id>
```

## Security.txt File Format

You can also use the program metadata program to upload a `security.txt` file to your program without having it as part of the binary file like the original [security.txt](https://github.com/neodyme-labs/solana-security-txt) format. This is useful to show name, description and icon of your program in the Solana Explorer and also gives security researchers a place to report issues and contact you. You can also add a link to your web app which makes it easier for users to find and interact with your program.

For that you just create a json file containing the security.txt data and upload it to the program metadata account using "security" as seed instead of "idl".

```json
{
  "name": "MyProgramName",
  "logo": "https://upload.wikimedia.org/wikipedia/en/b/b9/Solana_logo.png",
  "description": "Example program for meta data",
  "notification": "On the first of january we will release a new version! Please update your SDKS!!!!",
  "sdk": "https://github.com/solana-program/program-metadata",
  "project_url": "https://github.com/solana-developers/",
  "contacts": [
    "email:security@example.com",
    "discord:MyProgram#1234",
    "twitter:@MyProgram"
  ],
  "policy": "https://example.com/security-policy",
  "preferred_languages": ["en", "de"],
  "encryption": "https://example.com/pgp-key",
  "source_code": "https://github.com/solana-developers/",
  "source_release": "v0.1.0",
  "source_revision": "abc123def456",
  "auditors": ["Audit Firm A", "Security Researcher B"],
  "acknowledgements": "https://example.com/security-acknowledgements",
  "expiry": "2024-12-31",
  "version": "0.1.0"
}
```

Then use the same commands as for the IDL to upload the security.txt file:

```sh
npx @solana-program/program-metadata write security <program-id> ./security.json
```

### How the data is formatted and saved

By default the metadata is `zlib` compressed and encoded in `utf8` and saved on chain in an account.
To save space you can also point the metadata in the account to a URL using the `--url` flag or to another account using the `--account <address>` flag. When using the `--account` flag you can also specify the offset in the account where the data starts using the `--account-offset <number>` and `--account-length <number>` flags.

Like this you can for example have multiple programs point to the same metadata account or you can save your IDL in your github repository and let the metadata account just point to it.

- **Seeds:** The `<seed>` argument is a string like "idl" or "security". Use different seeds for different types of metadata. You can attach any data to programs that you like. If you have a certain standard in mind please open a discussion on this repository. The program could for example also enable versioned IDLs or you could think of adding attestations to programs to make them more trustworthy. Something like an auditedBy metadata could be interesting for example.
- **Canonical vs. Non-Canonical:** By default, the upgrade authority creates canonical metadata. Use `--non-canonical <pubkey>` to create third-party metadata accounts. This could for example be useful for already frozen programs which do not have access to their upgrade authority anymore.
- **File Types:** The CLI auto-detects JSON, YAML, or TOML.
- **Compression:** By default all metadata is compressed in the `zlib` format to save on chain space. You can override this by using the `--compression` flag and change it to `none` or `gzip`.
- **Encoding:** By default all metadata is encoded in `utf8`. You can override this by using the `--encoding` flag and change it to `none`, `base58` or `base64`.

## Building

To build the program locally, first install the required packages using:

```sh
pnpm install
```

and then run:

```sh
pnpm programs:build
```

## Testing

The repository includes two types of tests: program tests and JS client tests.

To run the program tests:

```sh
pnpm programs:test
```

To run the JS tests:

```sh
pnpm clients:js:test
```

## License

The code is licensed under the [Apache License Version 2.0](LICENSE)

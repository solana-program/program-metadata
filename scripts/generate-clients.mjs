#!/usr/bin/env zx
import 'zx/globals';
import * as c from 'codama';
import { renderVisitor as renderJavaScriptVisitor } from '@codama/renderers-js';
import { renderVisitor as renderRustVisitor } from '@codama/renderers-rust';
import { getAllProgramIdls } from './utils.mjs';

// Instanciate Codama.
const [idl] = getAllProgramIdls();
const codama = c.createFromRoot(require(idl));

// Render JavaScript.
const jsClient = path.join(__dirname, '..', 'clients', 'js');
codama.accept(
  renderJavaScriptVisitor(path.join(jsClient, 'src', 'generated'), {
    prettierOptions: require(path.join(jsClient, '.prettierrc.json')),
  })
);

// Render Rust.
// TODO: Extract unsupported types in order to hook them for the Rust client.
// const rustClient = path.join(__dirname, '..', 'clients', 'rust');
// codama.accept(
//   renderRustVisitor(path.join(rustClient, 'src', 'generated'), {
//     formatCode: true,
//     crateFolder: rustClient,
//     anchorTraits: false,
//   })
// );

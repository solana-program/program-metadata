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

// [Rust] Extract remainder and zeroable types so they can be hooked.
codama.update(
  c.bottomUpTransformerVisitor([
    {
      select: '[remainderOptionTypeNode]',
      transform: (node) => {
        c.assertIsNode(node, 'remainderOptionTypeNode');
        if (c.isNode(node.item, 'bytesTypeNode')) {
          return c.definedTypeLinkNode('remainderOptionBytes');
        }
        if (c.isNode(node.item, 'publicKeyTypeNode')) {
          return c.definedTypeLinkNode('remainderOptionPubkey');
        }
        if (
          c.isNode(node.item, 'definedTypeLinkNode') &&
          node.item.name === 'seed'
        ) {
          return c.definedTypeLinkNode('remainderOptionSeed');
        }
        return node;
      },
    },
    {
      select: '[zeroableOptionTypeNode]',
      transform: (node) => {
        c.assertIsNode(node, 'zeroableOptionTypeNode');
        if (c.isNode(node.item, 'publicKeyTypeNode')) {
          return c.definedTypeLinkNode('zeroableOptionPubkey');
        }
        if (
          c.isNode(node.item, 'numberTypeNode') &&
          node.item.format === 'u32'
        ) {
          return c.definedTypeLinkNode('zeroableOptionOffset');
        }
        return node;
      },
    },
    {
      select: '[instructionArgumentNode]',
      transform: (node) => {
        c.assertIsNode(node, 'instructionArgumentNode');
        if (node.defaultValue === undefined) {
          return node;
        }
        if (!c.isNode(node.type, 'definedTypeLinkNode')) {
          return node;
        }
        if (
          !(
            node.type.name.startsWith('remainderOption') ||
            node.type.name.startsWith('zeroableOption')
          )
        ) {
          return node;
        }
        return c.instructionArgumentNode({ ...node, defaultValue: undefined });
      },
    },
    {
      select: '[accountNode]',
      transform: (node) => {
        c.assertIsNode(node, 'accountNode');
        return c.accountNode({ ...node, pda: undefined });
      },
    },
  ])
);

// Render Rust.
const rustClient = path.join(__dirname, '..', 'clients', 'rust');
codama.accept(
  renderRustVisitor(path.join(rustClient, 'src', 'generated'), {
    formatCode: true,
    crateFolder: rustClient,
    anchorTraits: false,
    linkOverrides: {
      definedTypes: {
        remainderOptionBytes: 'hooked',
        remainderOptionPubkey: 'hooked',
        remainderOptionSeed: 'hooked',
        zeroableOptionPubkey: 'hooked',
        zeroableOptionOffset: 'hooked',
      },
    },
  })
);

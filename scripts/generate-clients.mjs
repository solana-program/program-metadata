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
      select: '[programNode]',
      transform: (node) => {
        c.assertIsNode(node, 'programNode');
        return c.programNode({
          ...node,
          definedTypes: [
            ...node.definedTypes,
            c.definedTypeNode({
              name: 'remainderOptionBytes',
              type: c.remainderOptionTypeNode(c.bytesTypeNode()),
            }),
            c.definedTypeNode({
              name: 'remainderOptionPubkey',
              type: c.remainderOptionTypeNode(c.publicKeyTypeNode()),
            }),
            c.definedTypeNode({
              name: 'remainderOptionSeed',
              type: c.remainderOptionTypeNode(c.definedTypeLinkNode('seed')),
            }),
            c.definedTypeNode({
              name: 'zeroableOptionPubkey',
              type: c.zeroableOptionTypeNode(c.publicKeyTypeNode()),
            }),
            c.definedTypeNode({
              name: 'zeroableOptionOffset',
              type: c.zeroableOptionTypeNode(c.numberTypeNode('u32')),
            }),
          ],
        });
      },
    },
  ])
);

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

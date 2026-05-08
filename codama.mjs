import * as c from 'codama';

export default {
    idl: 'program/idl.json',
    before: [],
    scripts: {
        js: {
            from: '@codama/renderers-js',
            args: ['clients/js/src/generated', { packageFolder: 'clients/js', syncPackageJson: true }],
        },
        rust: [
            {
                from: 'codama#bottomUpTransformerVisitor',
                args: [
                    [
                        {
                            select: '[remainderOptionTypeNode]',
                            transform: node => {
                                c.assertIsNode(node, 'remainderOptionTypeNode');
                                if (c.isNode(node.item, 'bytesTypeNode')) {
                                    return c.definedTypeLinkNode('remainderOptionBytes');
                                }
                                if (c.isNode(node.item, 'publicKeyTypeNode')) {
                                    return c.definedTypeLinkNode('remainderOptionPubkey');
                                }
                                if (c.isNode(node.item, 'definedTypeLinkNode') && node.item.name === 'seed') {
                                    return c.definedTypeLinkNode('remainderOptionSeed');
                                }
                                return node;
                            },
                        },
                        {
                            select: '[zeroableOptionTypeNode]',
                            transform: node => {
                                c.assertIsNode(node, 'zeroableOptionTypeNode');
                                if (c.isNode(node.item, 'publicKeyTypeNode')) {
                                    return c.definedTypeLinkNode('zeroableOptionPubkey');
                                }
                                if (c.isNode(node.item, 'numberTypeNode') && node.item.format === 'u32') {
                                    return c.definedTypeLinkNode('zeroableOptionOffset');
                                }
                                return node;
                            },
                        },
                        {
                            select: '[instructionArgumentNode]',
                            transform: node => {
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
                            transform: node => {
                                c.assertIsNode(node, 'accountNode');
                                return c.accountNode({ ...node, pda: undefined });
                            },
                        },
                    ],
                ],
            },
            {
                from: '@codama/renderers-rust',
                args: [
                    'clients/rust/src/generated',
                    {
                        formatCode: true,
                        crateFolder: 'clients/rust',
                        toolchain: '+nightly-2025-05-09',
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
                    },
                ],
            },
        ],
    },
};

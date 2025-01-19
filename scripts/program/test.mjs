#!/usr/bin/env zx
import 'zx/globals';
import {
  cliArguments,
  getProgramFolders,
  workingDirectory,
} from '../utils.mjs';

// Save external programs binaries to the output directory.
import './dump.mjs';

// Configure additional arguments here, e.g.:
// ['--arg1', '--arg2', ...cliArguments()]
const testArgs = cliArguments();

const hasSolfmt = await which('solfmt', { nothrow: true });

// Test the programs.
for (const folder of getProgramFolders()) {
  const manifestPath = path.join(workingDirectory, folder, 'Cargo.toml');

  if (hasSolfmt) {
    await $`cargo test-sbf --manifest-path ${manifestPath} ${testArgs} 2>&1 | solfmt`;
  } else {
    await $`cargo test-sbf --manifest-path ${manifestPath} ${testArgs}`;
  }
}

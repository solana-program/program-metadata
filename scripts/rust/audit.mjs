#!/usr/bin/env zx
import 'zx/globals';

const advisories = [
  // ed25519-dalek: Double Public Key Signing Function Oracle Attack
  //
  // Remove once repo upgrades to ed25519-dalek v2
  'RUSTSEC-2022-0093',

  // curve25519-dalek
  //
  // Remove once repo upgrades to curve25519-dalek v4
  'RUSTSEC-2024-0344',

  // Crate:     tonic
  // Version:   0.9.2
  // Title:     Remotely exploitable Denial of Service in Tonic
  // Date:      2024-10-01
  // ID:        RUSTSEC-2024-0376
  // URL:       https://rustsec.org/advisories/RUSTSEC-2024-0376
  // Solution:  Upgrade to >=0.12.3
  'RUSTSEC-2024-0376',

  // Remove the ignores below once the dependencies are updated to versions
  // that have the vulnerabilities fixed.

  // Crate:     quinn-proto
  // Version:   0.11.12
  // Title:     Denial of service in Quinn endpoints
  // Date:      2026-03-09
  // ID:        RUSTSEC-2026-0037
  // URL:       https://rustsec.org/advisories/RUSTSEC-2026-0037
  // Severity:  8.7 (high)
  // Solution:  Upgrade to >=0.11.14
  'RUSTSEC-2026-0037',

  //Crate:     rustls-webpki
  // Version:   0.101.7
  // Title:     Reachable panic in certificate revocation list parsing
  // Date:      2026-04-22
  // ID:        RUSTSEC-2026-0104
  // URL:       https://rustsec.org/advisories/RUSTSEC-2026-0104
  // Solution:  Upgrade to >=0.103.13, <0.104.0-alpha.1 OR >=0.104.0-alpha.7
  'RUSTSEC-2026-0104',

  // Crate:     rustls-webpki
  // Version:   0.101.7
  // Title:     Name constraints for URI names were incorrectly accepted
  // Date:      2026-04-14
  // ID:        RUSTSEC-2026-0098
  // URL:       https://rustsec.org/advisories/RUSTSEC-2026-0098
  // Solution:  Upgrade to >=0.103.12, <0.104.0-alpha.1 OR >=0.104.0-alpha.6
  'RUSTSEC-2026-0098',

  // Crate:     rustls-webpki
  // Version:   0.101.7
  // Title:     Name constraints were accepted for certificates asserting a wildcard name
  // Date:      2026-04-14
  // ID:        RUSTSEC-2026-0099
  // URL:       https://rustsec.org/advisories/RUSTSEC-2026-0099
  // Solution:  Upgrade to >=0.103.12, <0.104.0-alpha.1 OR >=0.104.0-alpha.6
  'RUSTSEC-2026-0099',

  // Crate:     rustls-webpki
  // Version:   0.103.4
  // Title:     Reachable panic in certificate revocation list parsing
  // Date:      2026-04-22
  // ID:        RUSTSEC-2026-0104
  // URL:       https://rustsec.org/advisories/RUSTSEC-2026-0104
  // Solution:  Upgrade to >=0.103.13, <0.104.0-alpha.1 OR >=0.104.0-alpha.7
  'RUSTSEC-2026-0104',

  // Crate:     rustls-webpki
  // Version:   0.103.4
  // Title:     CRLs not considered authoritative by Distribution Point due to faulty matching logic
  // Date:      2026-03-20
  // ID:        RUSTSEC-2026-0049
  // URL:       https://rustsec.org/advisories/RUSTSEC-2026-0049
  // Solution:  Upgrade to >=0.103.10
  'RUSTSEC-2026-0049',

  // Crate:     rustls-webpki
  // Version:   0.103.4
  // Title:     Name constraints for URI names were incorrectly accepted
  // Date:      2026-04-14
  // ID:        RUSTSEC-2026-0098
  // URL:       https://rustsec.org/advisories/RUSTSEC-2026-0098
  // Solution:  Upgrade to >=0.103.12, <0.104.0-alpha.1 OR >=0.104.0-alpha.6
  'RUSTSEC-2026-0098',

  // Crate:     rustls-webpki
  // Version:   0.103.4
  // Title:     Name constraints were accepted for certificates asserting a wildcard name
  // Date:      2026-04-14
  // ID:        RUSTSEC-2026-0099
  // URL:       https://rustsec.org/advisories/RUSTSEC-2026-0099
  // Solution:  Upgrade to >=0.103.12, <0.104.0-alpha.1 OR >=0.104.0-alpha.6
  'RUSTSEC-2026-0099',

  // Crate:     time
  // Version:   0.3.41
  // Title:     Denial of Service via Stack Exhaustion
  // Date:      2026-02-05
  // ID:        RUSTSEC-2026-0009
  // URL:       https://rustsec.org/advisories/RUSTSEC-2026-0009
  // Severity:  6.8 (medium)
  // Solution:  Upgrade to >=0.3.47
  'RUSTSEC-2026-0009'
];
const ignores = []
advisories.forEach(x => {
  ignores.push('--ignore');
  ignores.push(x);
});

// Check Solana version.
await $`cargo audit ${ignores}`;

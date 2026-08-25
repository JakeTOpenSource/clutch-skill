# Contributing

Contributions should keep Clutch small, inspectable, and fail-closed.

Before opening a pull request:

1. Explain the concrete failure or capability gap being addressed.
2. Keep model names in the example adapter rather than hard-coding them into the protocol.
3. Keep one canonical `clutch/` folder. Add an installation target rather than copying the protocol into a vendor-specific fork.
4. Add or update an adversarial fixture when behavior changes.
5. Run `npm run refresh-manifests`, then `npm test`.
6. Mark modified files prominently when Apache-2.0 requires it.
7. Keep claims within what the tests actually establish.

Unless explicitly marked otherwise, an intentional contribution submitted for inclusion is provided under Apache-2.0 as described in Section 5 of the license. Do not submit private data, credentials, proprietary material, or work you lack authority to license.

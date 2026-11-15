# Shared session store

This package intentionally creates one module-level session coordinator and exposes it as a shared singleton. This is an intentional dependency-injection anti-pattern for comparison only; production applications should own and inject their coordinator rather than rely on hidden global state.

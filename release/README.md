# Release builds

The Windows installer (`NicheRadar-Setup-<version>.exe`) is built on Windows by GitHub Actions on every push.
Download it from the latest **Build** run under the repository's *Actions* tab (*Artifacts →
NicheRadar-Windows-installer*). Pushing a tag such as `v1.0.0` also attaches it to a GitHub Release.

To build it yourself on Windows: `cd desktop && npm install && npm run dist`. The installer lands in
`desktop/dist-installer/`. Copy it here if you want to keep it with the repository.

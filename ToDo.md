Someday / Maybes
- [ ] Find and implement a more maintainable api doc strategy (currently run this command and hand edit a lot: typedoc --excludeExternals --excludeNotExported --excludePrivate --includeVersion --toc Injector,Binder,Container,Injectable,Inject,Optional,PostConstruct --mode file --out tmp-docs src)
- [ ] Integrate nyc coverage report into GitHub Actions (https://github.com/codecov/codecov-action), and add a badge for it.
- [ ] Figure out why nyc chokes on sourceMaps. (seems to work for us first time but not after there is an .nyc_output dir): https://github.com/istanbuljs/nyc/issues/847#issuecomment-397439475  For now, just nuke before run.

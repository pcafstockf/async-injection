Someday / Maybes
- [ ] Find and implement a more maintainable api doc strategy (currently run this command and hand edit a lot: typedoc --excludeExternals --excludeNotExported --excludePrivate --includeVersion --toc Injector,Binder,Container,Injectable,Inject,Optional,PostConstruct --mode file --out tmp-docs src)
- [ ] Update the gh-pages branch (it's pretty out of date).
- [ ] Integrate nyc coverage report into GitHub Actions (https://github.com/codecov/codecov-action), and add a badge for it.
- [ ] Figure out why nyc chokes on sourceMaps. (seems to work for us first time but not after there is an .nyc_output dir): https://github.com/istanbuljs/nyc/issues/847#issuecomment-397439475  For now, just nuke before run.
- [X] ESLINT integration.
- [ ] Add tests that mis-appy decorators (see src/decorators.ts)
- [ ] Add tests for removing container bindings
- [ ] Add tests for checking if a binding is known by traversing up the Container hierarchy.
- [ ] Is there a real world scenario where we would attempt Container.resolve on a rejected synchronous singleton binding? I'm thinking maybe a synchronous object that threw on construction, and was subsequently a parameter in an asynchronous constructor of a depending singleton object? If so add a unit test, otherwise remove the code that handles this (see coverage of provider.ts, container.ts).

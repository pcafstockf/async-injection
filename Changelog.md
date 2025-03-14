## 2.0.2 / 2025-03-13
* Fix failure to use `@Optional` when async object construction fails [#19](https://github.com/pcafstockf/async-injection/issues/19).  
  Thanks to [@dmtaub](https://github.com/pcafstockf/async-injection/issues/19) for finding this and providing a reproducible unit test.

## 2.0.1 / 2024-09-11
* Fix package.json exports [#18](https://github.com/pcafstockf/async-injection/issues/18).
  * Thanks to [@IvanLi-CN](https://github.com/pcafstockf/async-injection/issues/18) for finding this, and the solution.

## 2.0.0 / 2024-08-06
* Move typedefs up from lib/{cjs|esm} to just lib.
* Remove binder.ts exports from index.ts

## 1.6.0 / 2024-05-23
* Change internal meta-data constants from symbols to namespaced strings.
  This enables different compilation units to share a common Container. 
  Thanks to [@dmtaub](https://github.com/pcafstockf/async-injection/issues/16) for finding this and proposing a solution.
* Update github build matrix to drop node 14 and add node 20.
  This does not impact the library or its targets (only the build matrix github uses to run tests).

## 1.5.5 / 2024-01-18
* Backwards compatibly binder api updates.
* Update patch level dependencies.

## 1.5.4 / 2023-11-15
* Improved handling of class constructor parameter type recognition.
* Update dependencies.

## 1.5.3 / 2023-06-05
* Address esm issues [#10](https://github.com/pcafstockf/async-injection/issues/10) and [#15](https://github.com/pcafstockf/async-injection/issues/15)
* Fix missing type overload on Binder interface.
* Update dev dependencies.

## 1.5.2 / 2023-01-18
* No code changes.
* Updates to docs for consistency across projects.

## 1.5.1 / 2023-01-18
* Update dev dependencies.
* Update github workflows.
* Update badges in main ReadMe.
* Add support directory.

## 1.5.0 / 2022-04-16
* Add experimental ability to clone a Container (see Container.clone JSDoc comments for details).
* Fix error handling callback to pass instantiated object when construction succeeds but post construction fails.
* Reformat code project wide (based on IntelliJ formatting options).

## 1.4.0 / 2022-02-16
* Add Angular style InjectionToken class as a variant of InjectableId to support implicit typing of constants and interfaces.  
* Minor update to Binder.resolveSingletons to make it chainable (aka return the Container/Binder instance).  
* Minor updates to ReadMe.

## 1.3.0 / 2021-11-27
* Support Container driven release of Singleton allocated resources (see Container.releaseSingletons).  
* Update devDependencies.  
* Minor updates to ReadMe.

## 1.2.7 / 2021-08-02
* Revert type declaration for AbstractConstructor which was broken during eslint integration.  
* Update eslint related dev-dependencies.

## 1.2.6 / 2021-07-14
* Merge PR #9 [ESLINT integration + Improvements](https://github.com/pcafstockf/async-injection/pull/9).  
* Update devDependencies.  
* Resolved a couple of eslint warnings.  
* tsc no longer removes comments in generated code.  This can cause problems with post-processing tools such as istanbul. If file size is of concern to you, you should probably be minifying anyway.

## 1.2.5 / 2021-06-28
* No actual source code changes.  
* Added Reflect type from reflect-metadata in order to remove the @ts-ignore comments.  
* Improved tsconfig.json structure for IDE compatibility.  
** Thanks to @tripodsgames for those contributions.  
* Update tsc devDependency from 4.3.3 to 4.3.4.  
* Update the ChangeLog to properly reflect recent GitHub releases.

## 1.2.4 / 2021-06-17
* Build esm into esm dir (not mjs).  
* No actual source code changes.

## 1.2.3 / 2021-06-11
* cjs and esm distributions.  
* Build now generates both cjs and esm distributions.  
* tslib (where used) is now inlined instead of imported.  
* No other code changes.

## 1.2.0 / 2021-06-08
* New Feature: Allow alternate polyfill for Reflect API  
WARNING: This is a a breaking change release.  
The API and code have not changed, but you will need to explicitly import a polyfill into your own code in order to use this release (see the ReadMe).  
Previously Async-Injection relied on reflect-metadata (which is still supported), but this release also allows for the use of alternative implementations such as:  
core-js (core-js/es7/reflect)
reflection
Thank you to @tripodsgames for this contribution.

## 1.1.0 / 2021-05-07
* Add post construction handling feature to Binder.bindClass.  This is for scenarios where it is not feasible to add the @PostConstruct decorator to the target class.  
* Updated tslib  
* Updated jasmine devDependency.

## 1.0.8 / 2020-06-08
* Add ability to walk up the parent container hierarchy to methods Injector.isIdKnown and Container.removeBinding  
* Update tslib  
* Update ts-node and nyc devDependencies.

## 1.0.7 / 2019-04-27
* Fix issue #1  
* Update ts-node and source-map-support devDependencies  
* Add tslint and Changelog  
* Update ReadMe with badges  

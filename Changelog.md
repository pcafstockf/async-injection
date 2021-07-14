**1.0.7 / 2019-04-27**  
Fix issue #1  
Update ts-node and source-map-support devDependencies  
Add tslint and Changelog  
Update ReadMe with badges  

**1.0.8 / 2020-06-08**  
Add ability to walk up the parent container hierarchy to methods Injector.isIdKnown and Container.removeBinding  
Update tslib  
Update ts-node and nyc devDependencies.  

**1.1.0 / 2021-05-07**  
Add post construction handling feature to Binder.bindClass.  This is for scenarios where it is not feasible to add the @PostConstruct decorator to the target class.  
Updated tslib  
Updated jasmine devDependency.  

**1.2.0 / 2021-06-08**  
New Feature: Allow alternate polyfill for Reflect API  
WARNING: This is a a breaking change release.  
The API and code have not changed, but you will need to explicitly import a polyfill into your own code in order to use this release (see the ReadMe).  
Previously Async-Injection relied on reflect-metadata (which is still supported), but this release also allows for the use of alternative implementations such as:  
    core-js (core-js/es7/reflect)
    reflection
Thank you to @tripodsgames for this contribution.  

**1.2.3 / 2021-06-11**  
cjs and esm distributions.  
Build now generates both cjs and esm distributions.  
tslib (where used) is now inlined instead of imported.  
No other code changes.  

**1.2.4 / 2021-06-17**  
Build esm into esm dir (not mjs).  
No actual source code changes.  

**1.2.5 / 2021-06-28**  
No actual source code changes.  
Added Reflect type from reflect-metadata in order to remove the @ts-ignore comments.  
Improved tsconfig.json structure for IDE compatibility.  
Thanks to @tripodsgames for those contributions.  
Update tsc devDependency from 4.3.3 to 4.3.4.  
Update the ChangeLog to properly reflect recent GitHub releases.  

**1.2.6 / 2021-07-14**  
Merge PR [https://github.com/pcafstockf/async-injection/pull/9](ESLINT integration + Improvements).  
Update devDependencies.  
Resolved a couple of eslint warnings.  
tsc no longer removes comments in generated code.  This can cause problems with post-processing tools such as istanbul. If file size is of concern to you, you should probably be minifying anyway.  

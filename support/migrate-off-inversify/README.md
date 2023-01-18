I created `async-injection` because I was using InversifyJS at the time,
but after seeing asynchronous injection in NestJS, I realized 
it was a feature I could not live without.  
I was also working with Angular and felt it was a more 
TypeScript friendly, robust API.

**The files in this directory are not built as part of this project.**  
They are provided as a useful starting point to assist you in migrating off Inversify if you want to.

I used the files in this directory to help me migrate my code base 
off Inversify to `async-injection`.  
The `Container` interface in ./di.ts is a compatible subset 
of the `async-injection` `Container` interface.  
The `async-injection` decorators are *mostly* a super-set of the Inversify 
decorators, but the case follows Angular decorators.

By removing references in your code to Inversify, adding these files to your project,
and importing `index.ts`, you can continue to use Inversify (under the hood), 
while gradually migrating your application to an `async-injection` compatible API.  

You can then gradually (or quickly :smile:) migrate your code to import the `Container` and Pascal case decorators,
from `index.ts`.

Once migrated, drop Inversify from your package.json, install `async-injection`, 
and delete the migration files found in this directory.
Finally, you will need to do a search and replace in your code on any imports 
of `index.ts` and substitute that import for `async-injection`.

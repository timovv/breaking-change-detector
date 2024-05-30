# Breaking change detector prototype

This is a prototype of a tool to detect type-level breaking changes between two different versions of a TypeScript package. Upon running the command, the tool will
- Create a temporary package and install both the old and new versions of the package in it.
  - In this package, the tool will create a file with a few variable definitions, one per exported symbol in the old package (concrete symbols only, so functions, classes, variables, etc., but not types or interfaces). The corresponding symbol in the new package will be assigned to it. e.g.: `declare const variable: typeof old.variable = new.variable;`
  - If this assignment results in a syntax error that suggests there may be a breaking change, since the new API surface is not backward-compatible with the old API surface.
- Any syntax errors in this temporary package will be output as potential breaking changes to the console.

## Usage

First, build and install:
```sh
> npm install
> npm run build
```

Then run the breaking change detector:
```sh
> npx detect-breaking-changes <old-version> <new-version>
```

The version specifiers (`<old-version>` and `<new-version>` can be any of the following):
- An `npm` package reference (must be prefixed with `npm:`), e.g.: `npm:@azure/identity@latest`
- A package on disk (the package must be built), e.g. `/home/timov/src/azure-sdk-for-js/sdk/identity/identity`
- A tarball on disk created using `npm pack` or similar, e.g. `/home/timov/downloads/azure-identity-1.0.0.tgz`

## Examples

I'll use the Key Vault packages as an example here

### No breaking changes

There are no breaking changes between version `4.6.0` and `4.7.0` of the `@azure/keyvault-keys` package:

```sh
> npx detect-breaking-changes npm:@azure/keyvault-keys@4.6.0 npm:@azure/keyvault-keys@4.7.0
Installing packages...
Preparing type definitions...
Getting diagnostics...
✅ No breaking changes detected.
```

### Breaking changes are present

Between the `4.7.0-beta.1` and `4.7.0` releases of the `@azure/keyvault-keys` package, some functionality was removed, resulting in a breaking change between these two versions:

```
> npx detect-breaking-changes "npm:@azure/keyvault-keys@4.7.0-beta.1" "npm:@azure/keyvault-keys@4.7.0"
Analyzing breaking changes from npm:@azure/keyvault-keys@4.7.0-beta.1 to npm:@azure/keyvault-keys@4.7.0...
Installing packages...
Preparing type definitions...
Getting diagnostics...

⚠️ Detected 4 possible breaking changes:

src/index.ts:4:7 - error TS2419: Types of construct signatures are incompatible.
  Type 'new (vaultUrl: string, credential: TokenCredential, pipelineOptions?: KeyClientOptions | undefined) => KeyClient' is not assignable to type 'new (vaultUrl: string, credential: TokenCredential, pipelineOptions?: KeyClientOptions | undefined) => KeyClient'.
    Property 'createOkpKey' is missing in type 'import("/home/timov/src/breaking-change-detector/temp/node_modules/new/types/keyvault-keys").KeyClient' but required in type 'import("/home/timov/src/breaking-change-detector/temp/node_modules/old/types/keyvault-keys").KeyClient'.

4 const _KeyClient: typeof oldApi.KeyClient = newApi.KeyClient;
        ~~~~~~~~~~

  node_modules/old/types/keyvault-keys.d.ts:789:5
    789     createOkpKey(name: string, options?: CreateOkpKeyOptions): Promise<KeyVaultKey>;
            ~~~~~~~~~~~~
    'createOkpKey' is declared here.
src/index.ts:7:7 - error TS2741: Property 'Ed25519' is missing in type 'typeof import("/home/timov/src/breaking-change-detector/temp/node_modules/new/types/keyvault-keys").KnownKeyCurveNames' but required in type 'typeof import("/home/timov/src/breaking-change-detector/temp/node_modules/old/types/keyvault-keys").KnownKeyCurveNames'.

7 const _KnownKeyCurveNames: typeof oldApi.KnownKeyCurveNames = newApi.KnownKeyCurveNames;
        ~~~~~~~~~~~~~~~~~~~

  node_modules/old/types/keyvault-keys.d.ts:1538:5
    1538     Ed25519 = "Ed25519"
             ~~~~~~~
    'Ed25519' is declared here.
src/index.ts:10:7 - error TS2739: Type 'typeof KnownKeyTypes' is missing the following properties from type 'typeof KnownKeyTypes': OKP, OKPHSM

10 const _KnownKeyTypes: typeof oldApi.KnownKeyTypes = newApi.KnownKeyTypes;
         ~~~~~~~~~~~~~~
src/index.ts:11:7 - error TS2741: Property 'EdDSA' is missing in type 'typeof import("/home/timov/src/breaking-change-detector/temp/node_modules/new/types/keyvault-keys").KnownSignatureAlgorithms' but required in type 'typeof import("/home/timov/src/breaking-change-detector/temp/node_modules/old/types/keyvault-keys").KnownSignatureAlgorithms'.

11 const _KnownSignatureAlgorithms: typeof oldApi.KnownSignatureAlgorithms = newApi.KnownSignatureAlgorithms;
         ~~~~~~~~~~~~~~~~~~~~~~~~~

  node_modules/old/types/keyvault-keys.d.ts:1614:5
    1614     EdDSA = "EdDSA"
             ~~~~~
    'EdDSA' is declared here.
```

The output is a list of TypeScript diagnostics that indicate potential breaking changes. In this case, the diagnostics indicate that these changes in the new package may break code that depends on the old package:
- The `KeyClient` class in the new package is missing the `createOkpKey` method.
- The `KnownKeyCurveNames` enum in the new package is missing the `Ed25519` member.
- The `KnownKeyTypes` enum in the new package is missing the `OKP` and `OKPHSM` members, and the `KnownSignatureAlgorithms` enum is missing the `EdDSA` member.

## Areas needing work

The tool isn't finished and has a few issues that might need work. Some of these include:
- Improving diagnostic output to be more user-friendly
- Better handling of certain scenarios e.g. those involving generic types -- there may be false positives 
# Router

[![NPM version][npm-image]][npm-url]
[![NPM downloads][downloads-image]][downloads-url]
[![Build status][build-image]][build-url]
[![Build coverage][coverage-image]][coverage-url]

> Simple pathname router that makes zero assumptions about the server.

## Installation

```sh
npm install @borderless/router --save-dev
```

## Usage

```ts
export declare function createRouter(
  routes: string[]
): (pathname: string) => Iterable<Result>;
```

Exposes a simple `createRouter` function that accepts a list of routes. It returns a function that accepts the pathname as input and returns an iterable of results. Results are an object containing the `route` that matched, and list `keys` and `values` (if any) that were extracted from dynamic matches.

```js
import { createRouter } from "@borderless/router";

const router = createRouter([
  "a",
  "b",
  "[param]",
  "@[param]",
  "[param1]/[param2]",
]);

const results = Array.from(router("a"));

expect(results).toEqual([
  { route: "a", keys: [], values: [] },
  { route: "[param]", keys: ["param"], values: ["a"] },
]);
```

Since the result is an iterable, if you only want the first match you can discard the iterable to stop computing results.

```js
const results = router("a");
for (const result of results) {
  console.log(result); //=> { route: "a", keys: [], values: [] }
  break;
}
```

The routes are pre-sorted to match the most specific routes first (i.e. static routes or most segments), it is not based on the input order. The internal representation is a trie.

## TypeScript

This project is written using [TypeScript](https://github.com/Microsoft/TypeScript) and publishes the definitions directly to NPM.

## License

MIT

[npm-image]: https://img.shields.io/npm/v/@borderless/router
[npm-url]: https://npmjs.org/package/@borderless/router
[downloads-image]: https://img.shields.io/npm/dm/@borderless/router
[downloads-url]: https://npmjs.org/package/@borderless/router
[build-image]: https://img.shields.io/github/workflow/status/borderless/router/CI/main
[build-url]: https://github.com/borderless/router/actions/workflows/ci.yml?query=branch%3Amain
[coverage-image]: https://img.shields.io/codecov/c/gh/borderless/router
[coverage-url]: https://codecov.io/gh/borderless/router

/**
 * Parameters are a map of names to matched values.
 */
export type Parameters = Record<string, string | undefined>;

/**
 * Matches return any parameters with the matched route.
 */
export interface Result<T extends string> {
  route: T;
  keys: string[];
  values: string[];
}

/**
 * A router accepts the input pathname and returns an iterable of matching results.
 */
export type Router<T extends string> = (
  pathname: string
) => Iterable<Result<T>>;

/**
 * Build a match function for dynamic route segments.
 */
export type Match = (pathname: string) => string[] | false;

/**
 * Trie-based routing with static and parameter support. Prioritizes static paths
 * before parameters.
 */
class Node<T extends string> {
  route: T | undefined;
  keys: string[] | undefined;

  static: Map<string, Node<T>> = new Map();
  dynamic: Map<Match, Node<T>> = new Map();

  addStatic(value: string) {
    const existing = this.static.get(value);
    if (existing) return existing;
    const child = new Node<T>();
    this.static.set(value, child);
    return child;
  }

  addDynamic(value: Match) {
    const existing = this.dynamic.get(value);
    if (existing) return existing;
    const child = new Node<T>();
    this.dynamic.set(value, child);
    return child;
  }

  *match(value: string): Iterable<[string[], Node<T>]> {
    // Check static nodes first.
    const node = this.static.get(value);
    if (node) yield [[], node];

    // Find dynamic matches second.
    for (const [match, node] of this.dynamic) {
      const params = match(value);
      if (params === false) continue;
      yield [params, node];
    }
  }
}

/**
 * Generate a unique path key for caching.
 */
function pathToKey(path: Path, params: string[]) {
  const name: string[] = [];
  for (const part of path) {
    if (typeof part === "string") {
      name.push(part);
    } else {
      params.push(part.name);
      name.push("[]"); // Can't conflict with valid string parts.
    }
  }
  return name.join("|");
}

/**
 * Add the routes to the trie, with support to re-use identical match functions.
 */
function addToTrie<T extends string>(
  root: Node<T>,
  paths: Path[],
  route: T,
  cache: Map<string, Match>
) {
  let node = root;
  const params: string[] = [];

  for (const path of paths) {
    // Handle empty segments as static empty strings.
    if (path.length === 0) {
      node = node.addStatic("");
      continue;
    }

    // Handle simple static-only paths.
    if (path.length === 1 && typeof path[0] == "string") {
      node = node.addStatic(path[0]);
      continue;
    }

    // Everything else is dynamic, reuse match functions for efficient trie.
    const key = pathToKey(path, params);
    const fn = cache.get(key) ?? createMatch(path);
    cache.set(key, fn);
    node = node.addDynamic(fn);
  }

  if (typeof node.route === "string") {
    throw new TypeError(`Route is already defined for ${route}`);
  }

  node.route = route;
  node.keys = params;
}

/**
 * Build a sorted list of route paths based on inputs strings.
 */
export function buildRoutes(inputs: string[]): Array<[string, Path[]]> {
  return inputs
    .map<[string, Path[]]>((route) => [
      route,
      route.split("/").map((x) => parse(x)),
    ])
    .sort(([, a], [, b]) => {
      // Sort by the shortest number of segments first.
      if (a.length !== b.length) {
        return a.length - b.length;
      }

      // Then sort by the first dynamic segment difference.
      for (let i = 0; i < a.length; i++) {
        const pathsA = a[i];
        const pathsB = b[i];
        const length = Math.max(pathsA.length, pathsB.length);

        for (let j = 0; j < length; j++) {
          const typeofA = typeof pathsA[j];
          const typeofB = typeof pathsB[j];

          // Sort dynamic segments to the end.
          if (typeofA !== typeofB) {
            return typeofA === "string" ? -1 : typeofB === "object" ? -1 : 1;
          }

          // Sort static segments alphabetically.
          if (typeofA === "string") {
            if (pathsA[j] !== pathsB[j]) return pathsA[j] > pathsB[j] ? 1 : -1;
          }
        }
      }

      return 0;
    });
}

/**
 * Build a router from file path compatible characters.
 *
 * Characters to avoid: < > : " / \ | ? *
 * Ref: https://stackoverflow.com/questions/1976007/what-characters-are-forbidden-in-windows-and-linux-directory-names
 */
export function createRouter<T extends string>(
  inputs: Iterable<string>
): Router<T> {
  const root = new Node<T>();
  const cache = new Map<string, Match>();
  const routes = buildRoutes(Array.from(inputs));

  // Add sorted routes to the trie.
  for (const [route, paths] of routes) addToTrie(root, paths, route, cache);

  function* build(
    node: Node<T>,
    index: number,
    segments: string[],
    values: string[]
  ): Iterable<Result<T>> {
    // Reached the end of a valid match.
    if (index === segments.length) {
      if (typeof node.route === "string") {
        yield {
          route: node.route,
          keys: node.keys ?? [],
          values: values.slice(),
        };
      }
      return;
    }

    const length = values.length;
    for (const [params, child] of node.match(segments[index])) {
      values.push(...params); // Append new values.
      yield* build(child, index + 1, segments, values);
      values.length = length; // Reset values after every iteration.
    }
  }

  return function match(pathname: string): Iterable<Result<T>> {
    return build(root, 0, pathname.split("/"), []);
  };
}

/**
 * Create a match function from a series of path parts.
 */
export function createMatch(path: Path): Match {
  const length = path.length;

  // Handle empty pathname matches.
  if (length === 0) return (pathname) => (pathname === "" ? [] : false);

  return function match(pathname) {
    let i = 0;
    let offset = 0;
    const params: string[] = [];

    while (i < length) {
      const part = path[i];

      // Stop processing if we reached the end.
      if (pathname.length === offset) return false;

      // Handle simple string matches at the beginning.
      if (typeof part === "string") {
        if (pathname.slice(offset, offset + part.length) !== part) return false;

        i += 1;
        offset += part.length;
        continue;
      }

      // The part after a parameter is always a string, or the end of parts.
      const next = path[i + 1] as string | undefined;
      if (next === undefined) {
        params.push(pathname.slice(offset));
        break;
      }

      const index = pathname.indexOf(next, offset);
      if (index === -1 || index === offset) return false;

      i += 2;
      params.push(pathname.slice(offset, index));
      offset = index + next.length;
    }

    return params;
  };
}

/**
 * The parameter is dynamic part of the route.
 */
export interface Parameter {
  name: string;
}

/**
 * A parsed route is a set of parameters and static strings.
 */
export type Path = (Parameter | string)[];

/**
 * Simple parser for extracting the segments from a route string.
 */
export function parse(route: string): Path {
  const path: Path = [];
  const length = route.length;
  let i = 0;

  while (i < length) {
    const char = route[i];
    let name = "";

    if (char === "[") {
      if (typeof path[path.length - 1] === "object") {
        throw new TypeError(
          `A parameter must not immediately follow another paramter at ${i}`
        );
      }

      while (i++ < length) {
        const char = route[i];

        if (char === "]") {
          if (name === "") {
            throw new TypeError(`Missing parameter name at ${i}`);
          }

          i++;
          break;
        }

        if (i === length) {
          throw new TypeError(`Missing parameter name close character at ${i}`);
        }

        if (!/[\p{L}\p{N}]/u.test(char)) {
          throw new TypeError(`Invalid name character at ${i}`);
        }

        name += char;
      }

      path.push({ name });
      continue;
    }

    i++;
    if (typeof path[path.length - 1] !== "string") path.push("");
    path[path.length - 1] += char;
  }

  return path;
}

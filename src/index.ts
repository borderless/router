/**
 * Parameters are a map of names to matched values.
 */
export type Parameters = Record<string, string | undefined>;

/**
 * Matches return any parameters with the matched route.
 */
export interface Result {
  route: string;
  keys: string[];
  values: string[];
}

/**
 * A router accepts the input pathname and returns an iterable of matching results.
 */
export type Router = (pathname: string) => Iterable<Result>;

/**
 * Build a match function for dynamic route segments.
 */
export type Match = (pathname: string) => string[] | false;

/**
 * Trie-based routing with static and parameter support. Prioritizes static paths
 * before parameters.
 */
class Node {
  route: string | undefined;
  keys: string[] | undefined;

  static: Map<string, Node> = new Map();
  dynamic: Map<Match, Node> = new Map();

  addStatic(value: string) {
    const existing = this.static.get(value);
    if (existing) return existing;
    const child = new Node();
    this.static.set(value, child);
    return child;
  }

  addDynamic(value: Match) {
    const existing = this.dynamic.get(value);
    if (existing) return existing;
    const child = new Node();
    this.dynamic.set(value, child);
    return child;
  }

  *match(value: string): Iterable<[string[], Node]> {
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
function addToTrie(
  root: Node,
  paths: Path[],
  route: string,
  cache: Map<string, Match>
) {
  let node = root;
  const params: string[] = [];

  for (const path of paths) {
    // Handle simple "static" paths.
    if (path.length === 1 && typeof path[0] == "string") {
      node = node.addStatic(path[0]);
      continue;
    }

    // Re-use dynamic functions for slightly more space efficient tries.
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
export function createRouter(inputs: Iterable<string>): Router {
  const root = new Node();
  const cache = new Map<string, Match>();
  const routes = buildRoutes(Array.from(inputs));

  // Add sorted routes to the trie.
  for (const [route, paths] of routes) addToTrie(root, paths, route, cache);

  function* build(
    node: Node,
    segments: string[],
    values: string[]
  ): Iterable<Result> {
    // Reached the end of a valid match.
    if (segments.length === 0) {
      const { route, keys = [] } = node;
      if (typeof route === "string") yield { route, keys, values };
      return;
    }

    for (const [params, child] of node.match(segments[0])) {
      yield* build(child, segments.slice(1), [...values, ...params]);
    }
  }

  return function match(pathname: string): Iterable<Result> {
    return build(root, pathname.split("/"), []);
  };
}

/**
 * Create a match function from a series of path parts.
 */
export function createMatch(path: Path): Match {
  const length = path.length;

  return function match(pathname) {
    let i = 0;
    let offset = 0;
    const params: string[] = [];

    while (i < length) {
      const part = path[i];

      // Handle simple string matches at the beginning.
      if (typeof part === "string") {
        if (pathname.slice(offset, offset + part.length) !== part) return false;

        i += 1;
        offset += part.length;
        continue;
      }

      // Stop processing if we end in an empty string.
      if (pathname.length === offset) return false;

      // The part after a parameter is always a string, or the end.
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

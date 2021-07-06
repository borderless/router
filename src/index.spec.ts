import { parse, createMatch, createRouter, buildRoutes } from "./index";

describe("parse", () => {
  it("should parse simple segment", () => {
    expect(parse("test")).toEqual(["test"]);
    expect(parse("@blake")).toEqual(["@blake"]);
  });

  it("should parse dynamic segment", () => {
    expect(parse("[test]")).toEqual([{ name: "test" }]);
    expect(parse("[123]")).toEqual([{ name: "123" }]);
    expect(parse("[你好]")).toEqual([{ name: "你好" }]);
  });

  it("should parse mixed segment", () => {
    expect(parse("foo[test]")).toEqual(["foo", { name: "test" }]);
    expect(parse("![test]")).toEqual(["!", { name: "test" }]);
    expect(parse("@[test]")).toEqual(["@", { name: "test" }]);
    expect(parse("[test]bar")).toEqual([{ name: "test" }, "bar"]);
    expect(parse("foo[test]bar")).toEqual(["foo", { name: "test" }, "bar"]);
    expect(parse("[key]@[value]")).toEqual([
      { name: "key" },
      "@",
      { name: "value" },
    ]);
  });

  it("should throw error when no dynamic name", () => {
    expect(() => parse("[]")).toThrowError("Missing parameter name at 1");
  });

  it("should throw error invalid characters in name", () => {
    expect(() => parse("[[]]")).toThrowError("Invalid name character at 1");
    expect(() => parse("[.]")).toThrowError("Invalid name character at 1");
    expect(() => parse("[/]")).toThrowError("Invalid name character at 1");
    expect(() => parse("[@]")).toThrowError("Invalid name character at 1");
  });

  it("should throw error when name doesn't end", () => {
    expect(() => parse("[test")).toThrowError(
      "Missing parameter name close character at 5"
    );
  });

  it("should throw error with repeated parameters", () => {
    expect(() => parse("[a][b]")).toThrowError(
      "A parameter must not immediately follow another paramter at 3"
    );
  });
});

describe("createMatch", () => {
  it("should match string part", () => {
    const match = createMatch(["test"]);

    expect(match("")).toEqual(false);
    expect(match("123")).toEqual(false);
    expect(match("test")).toEqual([]);
    expect(match("fail")).toEqual(false);
  });

  it("should match dynamic part", () => {
    const match = createMatch([{ name: "foo" }]);

    expect(match("")).toEqual(false);
    expect(match("123")).toEqual(["123"]);
    expect(match("abc")).toEqual(["abc"]);
  });

  it("should match dynamic parts", () => {
    const match = createMatch([{ name: "key" }, "@", { name: "value" }]);

    expect(match("123")).toEqual(false);
    expect(match("foo@bar")).toEqual(["foo", "bar"]);
    expect(match("foo@bar@baz")).toEqual(["foo", "bar@baz"]);
    expect(match("@bar")).toEqual(false);
    expect(match("foo@")).toEqual(false);
    expect(match("@@bar")).toEqual(false);
    expect(match("@foo@bar")).toEqual(false);
    expect(match("foo@@")).toEqual(["foo", "@"]);
  });

  it("should match dynamic part after static string", () => {
    const match = createMatch(["@", { name: "value" }]);

    expect(match("blake")).toEqual(false);
    expect(match("@blake")).toEqual(["blake"]);
    expect(match("@blake@test")).toEqual(["blake@test"]);
  });
});

describe("buildRoutes", () => {
  it("should sort routes as static -> dynamic, specific -> general", () => {
    const inputs = [
      "a",
      "b",
      "c",
      "[param]",
      "@[param]",
      "@[param]/x",
      "@[key]/y",
      "@[key1]/[key2]",
      "@[param]/[key]@[value]",
      "@[key1]/@[key2]",
      "[a]/[b]/[c]",
    ].sort(() => (Math.random() > 0.5 ? 1 : -1));

    expect(buildRoutes(inputs).map((x) => x[0])).toEqual([
      "@[param]",
      "a",
      "b",
      "c",
      "[param]",
      "@[key1]/@[key2]",
      "@[param]/x",
      "@[key]/y",
      "@[param]/[key]@[value]",
      "@[key1]/[key2]",
      "[a]/[b]/[c]",
    ]);
  });
});

describe("createRouter", () => {
  it("should match routes in the correct order", () => {
    const router = createRouter(["/foo", "/[param]", "/bar"]);

    expect(Array.from(router("/foo"))).toEqual([
      { route: "/foo", keys: [], values: [] },
      { route: "/[param]", keys: ["param"], values: ["foo"] },
    ]);

    expect(Array.from(router("/bar"))).toEqual([
      { route: "/bar", keys: [], values: [] },
      { route: "/[param]", keys: ["param"], values: ["bar"] },
    ]);

    expect(Array.from(router("/123"))).toEqual([
      { route: "/[param]", keys: ["param"], values: ["123"] },
    ]);

    expect(Array.from(router("/foo/bar"))).toEqual([]);
  });

  it("should error on duplicate routes", () => {
    expect(() => createRouter(["[a]", "[b]"])).toThrowError(
      "Route is already defined for [b]"
    );
  });

  it("should support static routes under dynamic routes", () => {
    const router = createRouter(["[a]/a", "[b]/b"]);

    expect(Array.from(router("foo/a"))).toEqual([
      { route: "[a]/a", keys: ["a"], values: ["foo"] },
    ]);

    expect(Array.from(router("foo/b"))).toEqual([
      { route: "[b]/b", keys: ["b"], values: ["foo"] },
    ]);

    expect(Array.from(router("foo"))).toEqual([]);

    expect(Array.from(router("foo/"))).toEqual([]);

    expect(Array.from(router("foo/c"))).toEqual([]);
  });

  it("should support multiple dynamic routes", () => {
    const router = createRouter(["[a]/[b]"]);

    expect(Array.from(router("foo/bar"))).toEqual([
      { route: "[a]/[b]", keys: ["a", "b"], values: ["foo", "bar"] },
    ]);

    expect(Array.from(router("foo"))).toEqual([]);

    expect(Array.from(router("foo/"))).toEqual([]);

    expect(Array.from(router("foo/bar/baz"))).toEqual([]);
  });

  it("should support dynamic route priority", () => {
    const router = createRouter([
      "[param]/route",
      "@[param]/[param]",
      "@[param]/route",
    ]);

    expect(Array.from(router("123/route"))).toEqual([
      { route: "[param]/route", keys: ["param"], values: ["123"] },
    ]);

    expect(Array.from(router("@123/route"))).toEqual([
      { route: "@[param]/route", keys: ["param"], values: ["123"] },
      {
        route: "@[param]/[param]",
        keys: ["param", "param"],
        values: ["123", "route"],
      },
      { route: "[param]/route", keys: ["param"], values: ["@123"] },
    ]);
  });
});

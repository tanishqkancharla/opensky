import { parse } from "acorn";

export type DesktopProgramScope = { backend: "native" | "opensky"; appSelectors: string[] };
export const nativeMethods = new Set(["get_app_state", "click", "drag", "press_key", "type_text", "select_text", "paste", "scroll", "set_value", "perform_secondary_action"]);
const forbidden = new Set(["constructor", "prototype", "__proto__", "process", "require", "globalThis", "cua", "sky", "nodeRepl", "eval", "Function"]);

/** Admit straight-line public desktop API calls scoped to the fixture app.
 * This is an evaluation boundary, not an alternative SDK or action planner.
 * Both agents keep their real REPL; no filesystem/import/network shortcuts. */
export class DesktopProgramPolicy {
  private bindings = new Set<string>();
  private stateBindings = new Set<string>();
  private screenshotImports = new Set<string>();
  constructor(readonly scope: DesktopProgramScope) {}
  accepts(code: string): boolean {
    try {
      const ast = parse(code, { ecmaVersion: "latest", sourceType: "module", allowAwaitOutsideFunction: true }) as any;
      const bindings = new Set(this.bindings);
      const states = new Set(this.stateBindings);
      const imports = new Set(this.screenshotImports);
      const member = (node: any, object: string, method?: string) => node?.type === "MemberExpression" && !node.computed && node.object?.type === "Identifier" && node.object.name === object && (method === undefined || node.property?.name === method);
      const imported = (node: any, source: string) => node?.type === "AwaitExpression" && node.argument?.type === "ImportExpression" && !node.argument.options && node.argument.source?.value === source;
      const importedSky = (node: any) => node?.type === "MemberExpression" && !node.computed && node.property?.name === "sky" && imported(node.object, "@oai/sky");
      const importedMember = (node: any, source: string, method: string) => node?.type === "MemberExpression" && !node.computed && node.property?.name === method && imported(node.object, source);
      const screenshotURL = (node: any) => node?.type === "MemberExpression" && !node.computed && node.property?.name === "url" && node.object?.type === "MemberExpression" && !node.object.computed && node.object.property?.name === "screenshot" && states.has(node.object.object?.name);
      const value = (node: any): boolean => {
        if (!node) return false;
        if (node.type === "Literal") return !node.regex;
        if (node.type === "Identifier") return bindings.has(node.name) || node.name === "undefined";
        if (node.type === "AwaitExpression") return value(node.argument);
        if (node.type === "UnaryExpression") return ["-", "+", "!"].includes(node.operator) && value(node.argument);
        if (node.type === "ArrayExpression") return node.elements.every(value);
        if (node.type === "ObjectExpression") return node.properties.every((p: any) => p.type === "Property" && p.kind === "init" && !p.computed && !p.method && !forbidden.has(p.key.name ?? p.key.value) && value(p.value));
        if (node.type === "MemberExpression") return !node.computed && !forbidden.has(node.property?.name) && value(node.object);
        if (node.type !== "CallExpression" || node.optional) return false;
        if (member(node.callee, "Object", "keys") && node.arguments.length === 1 && node.arguments[0].type === "Identifier" && ["sky", "app"].includes(node.arguments[0].name)) return true;
        if (this.scope.backend === "native" && ((member(node.callee, "fs", "readFile") && imports.has("fs")) || importedMember(node.callee, "node:fs/promises", "readFile"))) {
          const path = node.arguments[0];
          const converter = (path?.callee?.name === "fileURLToPath" && imports.has("fileURLToPath")) || importedMember(path?.callee, "node:url", "fileURLToPath");
          return node.arguments.length === 1 && path?.type === "CallExpression" && converter && path.arguments.length === 1 && screenshotURL(path.arguments[0]);
        }
        if (!node.arguments.every(value)) return false;
        if (member(node.callee, "JSON", "stringify")) return node.arguments.length === 1;
        if (member(node.callee, "nodeRepl") && ["write", "emitImage"].includes(node.callee.property.name)) return node.arguments.length === 1;
        if (this.scope.backend === "opensky") {
          if (member(node.callee, "cua", "getApp")) return node.arguments.length === 1 && node.arguments[0].type === "Literal" && this.scope.appSelectors.includes(node.arguments[0].value);
          // The bound app enforces its own target and API. Invented method
          // names should receive the SDK's normal error so the agent can
          // recover, rather than become infrastructure interruptions.
          return member(node.callee, "app") && bindings.has("app") &&
            /^[a-z][A-Za-z0-9]*$/.test(node.callee.property.name) && !forbidden.has(node.callee.property.name);
        }
        if (!member(node.callee, "sky") || !nativeMethods.has(node.callee.property.name)) return false;
        const argument = node.arguments[0];
        const app = argument?.type === "ObjectExpression" && argument.properties.find((p: any) => (p.key.name ?? p.key.value) === "app")?.value;
        return node.arguments.length === 1 && app?.type === "Literal" && this.scope.appSelectors.includes(app.value);
      };
      for (const statement of ast.body) {
        if (statement.type === "EmptyStatement") continue;
        if (statement.type === "VariableDeclaration") {
          for (const declaration of statement.declarations) {
            const name = declaration.id?.name;
            if (this.scope.backend === "native" && name === "fs" && imported(declaration.init, "node:fs/promises")) { imports.add("fs"); bindings.add("fs"); continue; }
            if (this.scope.backend === "native" && declaration.id?.type === "ObjectPattern" && declaration.id.properties.length === 1 && declaration.id.properties[0].key?.name === "fileURLToPath" && declaration.id.properties[0].value?.name === "fileURLToPath" && imported(declaration.init, "node:url")) { imports.add("fileURLToPath"); bindings.add("fileURLToPath"); continue; }
            if (declaration.id?.type !== "Identifier" || !name || forbidden.has(name)) return false;
            if (["fs", "fileURLToPath"].includes(name)) return false;
            if (!value(declaration.init)) return false;
            if (name === "app") {
              const init = declaration.init?.type === "AwaitExpression" ? declaration.init.argument : null;
              if (!member(init?.callee, "cua", "getApp")) return false;
            }
            bindings.add(name);
            states.delete(name);
            if (member(declaration.init?.argument?.callee, "sky", "get_app_state")) states.add(name);
          }
        } else if (statement.type === "ExpressionStatement") {
          const expression = statement.expression;
          if (this.scope.backend === "native" && expression.type === "AssignmentExpression" && expression.operator === "=" && member(expression.left, "globalThis", "sky") && importedSky(expression.right)) continue;
          if (!value(expression)) return false;
        } else return false;
      }
      this.bindings = bindings;
      this.stateBindings = states;
      this.screenshotImports = imports;
      return ast.body.length > 0;
    } catch { return false; }
  }
}

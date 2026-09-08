import { parse } from "acorn";

export type DesktopProgramScope = { backend: "native" | "opensky"; appSelectors: string[]; isolatedDesktop?: "linux" };
export const nativeMethods = new Set(["get_app_state", "click", "drag", "press_key", "type_text", "select_text", "paste", "scroll", "set_value", "perform_secondary_action"]);
const nativeLinuxMethods = new Set(["get_screenshot", "click", "move", "drag", "press_key", "type_text", "scroll"]);
const forbidden = new Set(["constructor", "prototype", "__proto__", "process", "require", "globalThis", "cua", "sky", "nodeRepl", "eval", "Function", "Promise", "setTimeout"]);

/** Admit straight-line public desktop API calls scoped to the fixture app.
 * This is an evaluation boundary, not an alternative SDK or action planner.
 * Both agents keep their real REPL; no filesystem/import/network shortcuts. */
export class DesktopProgramPolicy {
  private bindings = new Set<string>();
  private appBindings = new Set<string>();
  private stateBindings = new Set<string>();
  private screenshotImports = new Map<string, "fs" | "url" | "fileURLToPath" | "readFile">();
  private screenshotPaths = new Set<string>();
  constructor(readonly scope: DesktopProgramScope) {}
  executionFailed(): void {
    // A failed assignment may leave an older value in the real REPL. Require
    // a fresh successful observation before admitting another screenshot read.
    this.stateBindings.clear();
    this.screenshotPaths.clear();
  }
  accepts(code: string): boolean {
    try {
      const ast = parse(code, { ecmaVersion: "latest", sourceType: "module", allowAwaitOutsideFunction: true }) as any;
      const bindings = new Set(this.bindings);
      const apps = new Set(this.appBindings);
      const states = new Set(this.stateBindings);
      const imports = new Map(this.screenshotImports);
      const paths = new Set(this.screenshotPaths);
      const member = (node: any, object: string, method?: string) => node?.type === "MemberExpression" && !node.computed && node.object?.type === "Identifier" && node.object.name === object && (method === undefined || node.property?.name === method);
      const imported = (node: any, source: string) => node?.type === "AwaitExpression" && node.argument?.type === "ImportExpression" && !node.argument.options && node.argument.source?.value === source;
      const importedSky = (node: any) => node?.type === "MemberExpression" && !node.computed && node.property?.name === "sky" && imported(node.object, "@oai/sky");
      const importedMember = (node: any, source: string, method: string) => node?.type === "MemberExpression" && !node.computed && node.property?.name === method && imported(node.object, source);
      const scopedApp = (node: any) => this.scope.backend === "opensky" &&
        ((node?.type === "AwaitExpression" && member(node.argument?.callee, "cua", "getApp")) ||
         (node?.type === "Identifier" && apps.has(node.name)));
      const screenshotURL = (node: any) => node?.type === "MemberExpression" && !node.computed && node.property?.name === "url" && node.object?.type === "MemberExpression" && !node.object.computed && node.object.property?.name === "screenshot" && states.has(node.object.object?.name);
      const importCall = (node: any, namespace: "fs" | "url", method: "readFile" | "fileURLToPath") =>
        (node?.type === "Identifier" && imports.get(node.name) === method) ||
        (node?.type === "MemberExpression" && !node.computed && node.property?.name === method && imports.get(node.object?.name) === namespace) ||
        importedMember(node, namespace === "fs" ? "node:fs/promises" : "node:url", method);
      const screenshotPath = (node: any): boolean => node?.type === "AwaitExpression" ? screenshotPath(node.argument) :
        screenshotURL(node) ||
        (node?.type === "Identifier" && paths.has(node.name)) ||
        (node?.type === "NewExpression" && node.callee?.type === "Identifier" && node.callee.name === "URL" && node.arguments.length === 1 && screenshotPath(node.arguments[0])) ||
        (node?.type === "CallExpression" && importCall(node.callee, "url", "fileURLToPath") && node.arguments.length === 1 && screenshotPath(node.arguments[0]));
      const pause = (node: any): boolean => {
        if (node?.type !== "NewExpression" || node.callee?.type !== "Identifier" || node.callee.name !== "Promise" || node.arguments.length !== 1) return false;
        const callback = node.arguments[0];
        if (callback.type !== "ArrowFunctionExpression" || callback.async || callback.params.length !== 1 || callback.params[0].type !== "Identifier" || forbidden.has(callback.params[0].name)) return false;
        const timer = callback.body;
        return timer.type === "CallExpression" && !timer.optional && timer.callee?.type === "Identifier" && timer.callee.name === "setTimeout" &&
          timer.arguments.length === 2 && timer.arguments[0]?.type === "Identifier" && timer.arguments[0].name === callback.params[0].name &&
          timer.arguments[1]?.type === "Literal" && Number.isSafeInteger(timer.arguments[1].value) && timer.arguments[1].value >= 0 && timer.arguments[1].value <= 60_000;
      };
      const value = (node: any): boolean => {
        if (!node) return false;
        if (node.type === "Literal") return !node.regex;
        if (node.type === "Identifier") return bindings.has(node.name) || node.name === "undefined";
        if (node.type === "AwaitExpression") return value(node.argument);
        if (node.type === "UnaryExpression") return ["-", "+", "!"].includes(node.operator) && value(node.argument);
        if (node.type === "ArrayExpression") return node.elements.every(value);
        if (node.type === "ObjectExpression") return node.properties.every((p: any) => p.type === "Property" && p.kind === "init" && !p.computed && !p.method && !forbidden.has(p.key.name ?? p.key.value) && value(p.value));
        if (node.type === "MemberExpression") {
          // Linux screenshots are returned as an array of image values. This
          // admits image[0].bytes, not computed methods or arbitrary globals.
          if (node.computed) return this.scope.isolatedDesktop === "linux" &&
            node.property?.type === "Literal" && Number.isSafeInteger(node.property.value) && node.property.value >= 0 && value(node.object);
          return !forbidden.has(node.property?.name) && value(node.object);
        }
        if (node.type === "NewExpression") return pause(node) || this.scope.backend === "native" && screenshotPath(node);
        if (node.type !== "CallExpression" || node.optional) return false;
        if (member(node.callee, "Object", "keys") && node.arguments.length === 1 && node.arguments[0].type === "Identifier" && ["sky", "app"].includes(node.arguments[0].name)) return true;
        if (this.scope.backend === "native" && importCall(node.callee, "fs", "readFile")) {
          // Node accepts a URL object, or the agent may mistakenly pass the
          // returned URL string and need its ordinary filesystem error. Both
          // remain restricted to the real observation's screenshot source.
          const options = node.arguments[1];
          const readOnlyOptions = options?.type === "Literal" && (typeof options.value === "string" || options.value === null) ||
            options?.type === "ObjectExpression" && options.properties.every((p: any) => p.type === "Property" && p.kind === "init" && !p.computed && !p.method && (p.key.name ?? p.key.value) === "encoding" && value(p.value));
          return [1, 2].includes(node.arguments.length) && screenshotPath(node.arguments[0]) &&
            (node.arguments.length === 1 || readOnlyOptions);
        }
        if (this.scope.backend === "native" && importCall(node.callee, "url", "fileURLToPath")) return screenshotPath(node);
        if (!node.arguments.every(value)) return false;
        if (member(node.callee, "JSON", "stringify")) return node.arguments.length === 1;
        if (member(node.callee, "nodeRepl") && ["write", "emitImage"].includes(node.callee.property.name)) return node.arguments.length === 1;
        if (this.scope.backend === "opensky") {
          if (member(node.callee, "cua", "getApp")) return node.arguments.length === 1 && node.arguments[0].type === "Literal" && this.scope.appSelectors.includes(node.arguments[0].value);
          // The bound app enforces its own target and API. Invented method
          // names should receive the SDK's normal error so the agent can
          // recover, rather than become infrastructure interruptions.
          // The public REPL exposes only bound target methods and data
          // results. A chain rooted in one of those calls retains that same
          // scope, including invented locator chains that throw TypeError.
          // Do not admit calls reached through arbitrary property traversal
          // (app.facade...) or prototype/code-generation methods.
          const appCall = (call: any): boolean => call?.type === "CallExpression" && !call.optional &&
            call.arguments.every(value) && call.callee?.type === "MemberExpression" && !call.callee.computed &&
            ((call.callee.object?.type === "Identifier" && apps.has(call.callee.object.name)) || appCall(call.callee.object)) &&
            /^[a-z][A-Za-z0-9]*$/.test(call.callee.property.name) && !forbidden.has(call.callee.property.name);
          return appCall(node);
        }
        if (!member(node.callee, "sky")) return false;
        if (this.scope.isolatedDesktop === "linux") {
          // Linux's genuine native API targets the desktop, not app handles.
          // The runner must establish a disposable desktop before this scope.
          if (!nativeLinuxMethods.has(node.callee.property.name)) return false;
          return node.callee.property.name === "get_screenshot" ? node.arguments.length === 0 :
            node.arguments.length === 1 && node.arguments[0]?.type === "ObjectExpression";
        }
        if (!nativeMethods.has(node.callee.property.name)) return false;
        const argument = node.arguments[0];
        const app = argument?.type === "ObjectExpression" && argument.properties.find((p: any) => (p.key.name ?? p.key.value) === "app")?.value;
        return node.arguments.length === 1 && app?.type === "Literal" && this.scope.appSelectors.includes(app.value);
      };
      for (const statement of ast.body) {
        if (statement.type === "EmptyStatement") continue;
        if (statement.type === "VariableDeclaration") {
          for (const declaration of statement.declarations) {
            const name = declaration.id?.name;
            if (this.scope.backend === "native") {
              const kind = imported(declaration.init, "node:fs/promises") ? "fs" : imported(declaration.init, "node:url") ? "url" : null;
              if (kind) {
                if (declaration.id.type === "Identifier" && name && !forbidden.has(name) && name !== "app") {
                  imports.set(name, kind); bindings.add(name); states.delete(name); paths.delete(name); continue;
                }
                if (declaration.id.type !== "ObjectPattern" || declaration.id.properties.length !== 1) return false;
                const property = declaration.id.properties[0];
                const exported = kind === "fs" ? "readFile" : "fileURLToPath";
                const alias = property.value?.name;
                if (property.type !== "Property" || property.computed || property.key?.name !== exported || property.value?.type !== "Identifier" || !alias || forbidden.has(alias) || alias === "app") return false;
                imports.set(alias, exported); bindings.add(alias); states.delete(alias); paths.delete(alias); continue;
              }
            }
            if (declaration.id?.type !== "Identifier" || !name || forbidden.has(name)) return false;
            if (imports.has(name)) return false;
            if (!value(declaration.init)) return false;
            const appInit = scopedApp(declaration.init);
            if ((name === "app" || apps.has(name)) && !appInit) return false;
            // Only a new binding or an already-scoped app may receive app
            // authority. Failed assignments must not promote older data.
            if (appInit && bindings.has(name) && !apps.has(name)) return false;
            if (appInit) apps.add(name);
            const isPath = screenshotPath(declaration.init);
            bindings.add(name);
            paths.delete(name);
            if (isPath) paths.add(name);
            states.delete(name);
            if (member(declaration.init?.argument?.callee, "sky", "get_app_state")) states.add(name);
          }
        } else if (statement.type === "ExpressionStatement") {
          const expression = statement.expression;
          if (this.scope.backend === "native" && expression.type === "AssignmentExpression" && expression.operator === "=" && member(expression.left, "globalThis", "sky") && importedSky(expression.right)) continue;
          if (expression.type === "AssignmentExpression" && expression.operator === "=" && expression.left.type === "Identifier") {
            const name = expression.left.name;
            if (!bindings.has(name) || forbidden.has(name) || imports.has(name) || !value(expression.right)) return false;
            // Rebinding an existing app to the same authorized capability is
            // normal recovery. A failed assignment leaves only that older,
            // already-scoped app behind. Never promote an older data binding.
            if (apps.has(name)) {
              if (!scopedApp(expression.right)) return false;
              continue;
            }
            if (name === "app" || scopedApp(expression.right)) return false;
            const isPath = screenshotPath(expression.right);
            paths.delete(name);
            if (isPath) paths.add(name);
            states.delete(name);
            if (member(expression.right?.argument?.callee, "sky", "get_app_state")) states.add(name);
            continue;
          }
          if (!value(expression)) return false;
        } else return false;
      }
      this.bindings = bindings;
      this.appBindings = apps;
      this.stateBindings = states;
      this.screenshotImports = imports;
      this.screenshotPaths = paths;
      return ast.body.length > 0;
    } catch { return false; }
  }
}

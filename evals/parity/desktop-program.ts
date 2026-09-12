import { parse } from "acorn";

export type DesktopProgramScope = { backend: "native" | "opensky"; appSelectors: string[]; isolatedDesktop?: "linux" };
export const nativeMethods = new Set(["get_app_state", "click", "drag", "press_key", "type_text", "select_text", "paste", "scroll", "set_value", "perform_secondary_action"]);
const nativeLinuxMethods = new Set(["get_screenshot", "click", "move", "drag", "press_key", "type_text", "scroll"]);
const forbidden = new Set(["constructor", "prototype", "__proto__", "process", "require", "globalThis", "cua", "sky", "nodeRepl", "eval", "Function", "Promise", "setTimeout"]);

/** Admit scoped public desktop API calls for the fixture app.
 * This is an evaluation boundary, not an alternative SDK or action planner.
 * Both agents keep their real REPL; no filesystem/import/network shortcuts. */
export class DesktopProgramPolicy {
  private bindings = new Set<string>();
  private appBindings = new Set<string>();
  private stateBindings = new Set<string>();
  private screenshotImports = new Map<string, "fs" | "url" | "fileURLToPath" | "readFile">();
  private screenshotPaths = new Set<string>();
  private numericBindings = new Set<string>();
  constructor(readonly scope: DesktopProgramScope) {}
  executionFailed(): void {
    // A failed assignment may leave an older value in the real REPL. Require
    // a fresh successful observation or numeric binding before relying on it.
    this.stateBindings.clear();
    this.screenshotPaths.clear();
    this.numericBindings.clear();
  }
  accepts(code: string): boolean {
    try {
      const ast = parse(code, { ecmaVersion: "latest", sourceType: "module", allowAwaitOutsideFunction: true }) as any;
      let bindings = new Set(this.bindings);
      let apps = new Set(this.appBindings);
      let states = new Set(this.stateBindings);
      let imports = new Map(this.screenshotImports);
      let paths = new Set(this.screenshotPaths);
      let numeric = new Set(this.numericBindings);
      const scopes: Set<string>[] = [];
      type Environment = { bindings: Set<string>; apps: Set<string>; states: Set<string>; imports: Map<string, "fs" | "url" | "fileURLToPath" | "readFile">; paths: Set<string>; numeric: Set<string> };
      const snapshot = (): Environment => ({ bindings: new Set(bindings), apps: new Set(apps), states: new Set(states), imports: new Map(imports), paths: new Set(paths), numeric: new Set(numeric) });
      const restore = (environment: Environment): void => {
        bindings = new Set(environment.bindings); apps = new Set(environment.apps); states = new Set(environment.states);
        imports = new Map(environment.imports); paths = new Set(environment.paths); numeric = new Set(environment.numeric);
      };
      const intersect = <T>(base: Set<T>, left: Set<T>, right: Set<T>) => new Set([...base].filter(value => left.has(value) && right.has(value)));
      // An if branch or a loop may not run. Only authority held before it and
      // retained by every checked path can survive after it.
      const join = (base: Environment, left: Environment, right: Environment): void => {
        bindings = new Set(base.bindings);
        apps = intersect(base.apps, left.apps, right.apps);
        states = intersect(base.states, left.states, right.states);
        paths = intersect(base.paths, left.paths, right.paths);
        numeric = intersect(base.numeric, left.numeric, right.numeric);
        imports = new Map([...base.imports].filter(([name, kind]) => left.imports.get(name) === kind && right.imports.get(name) === kind));
      };
      const declare = (name: string) => scopes.at(-1)?.add(name);
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
      const numberValue = (node: any): boolean => {
        if (node?.type === "Literal") return typeof node.value === "number" && Number.isFinite(node.value);
        if (node?.type === "Identifier") return numeric.has(node.name);
        if (node?.type === "UnaryExpression") return ["-", "+"].includes(node.operator) && numberValue(node.argument);
        return node?.type === "BinaryExpression" && ["+", "-", "*", "/", "%", "**", "&", "|", "^", "<<", ">>", ">>>"].includes(node.operator) && numberValue(node.left) && numberValue(node.right);
      };
      const value = (node: any): boolean => {
        if (!node) return false;
        if (node.type === "Literal") return !node.regex;
        if (node.type === "Identifier") return bindings.has(node.name) || node.name === "undefined";
        if (node.type === "AwaitExpression") return value(node.argument);
        if (node.type === "UnaryExpression") return ["-", "+", "!"].includes(node.operator) && value(node.argument);
        // Agents calculate coordinates and derive text from observations in
        // their real REPL. Expressions do not introduce a new capability:
        // inspect every operand, including branches JavaScript may skip.
        if (node.type === "BinaryExpression") return ["+", "-", "*", "/", "%", "**", "<", "<=", ">", ">=", "==", "!=", "===", "!==", "&", "|", "^", "<<", ">>", ">>>"].includes(node.operator) && value(node.left) && value(node.right);
        if (node.type === "LogicalExpression") return ["&&", "||", "??"].includes(node.operator) && value(node.left) && value(node.right);
        if (node.type === "ConditionalExpression") return value(node.test) && value(node.consequent) && value(node.alternate);
        if (node.type === "TemplateLiteral") return node.expressions.every(value);
        if (node.type === "ArrayExpression") return node.elements.every(value);
        if (node.type === "ObjectExpression") return node.properties.every((p: any) => p.type === "Property" && p.kind === "init" && !p.computed && !p.method && !forbidden.has(p.key.name ?? p.key.value) && value(p.value));
        if (node.type === "MemberExpression") {
          // Linux screenshots are returned as an array of image values. This
          // admits image[0].bytes and ordinary data[i][0], but never a
          // computed call target. Numeric indexes cannot synthesize a hidden
          // property name or a new desktop capability.
          if (node.computed) return value(node.object) && numberValue(node.property);
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
          // Ordinary extra options must reach the public SDK's own behavior.
          // They cannot change the literal authorized app selector; `value`
          // above has already rejected executable/property-mutating options.
          if (member(node.callee, "cua", "getApp")) return [1, 2].includes(node.arguments.length) &&
            node.arguments[0].type === "Literal" && this.scope.appSelectors.includes(node.arguments[0].value) &&
            (node.arguments.length === 1 || node.arguments[1].type === "ObjectExpression");
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
      const update = (node: any): boolean => {
        if (node?.type !== "UpdateExpression" || !["++", "--"].includes(node.operator) || node.argument?.type !== "Identifier") return false;
        const name = node.argument.name;
        if (!bindings.has(name) || apps.has(name) || imports.has(name) || !numeric.has(name)) return false;
        states.delete(name); paths.delete(name);
        return true;
      };
      const declaration = (statement: any, allowUninitializedConst = false): boolean => {
        if (scopes.length && statement.kind === "var") return false;
        for (const entry of statement.declarations) {
          const name = entry.id?.name;
          if (this.scope.backend === "native") {
            const kind = imported(entry.init, "node:fs/promises") ? "fs" : imported(entry.init, "node:url") ? "url" : null;
            if (kind) {
              if (entry.id.type === "Identifier" && name && !forbidden.has(name) && name !== "app") {
                imports.set(name, kind); bindings.add(name); states.delete(name); paths.delete(name); numeric.delete(name); declare(name); continue;
              }
              if (entry.id.type !== "ObjectPattern" || entry.id.properties.length !== 1) return false;
              const property = entry.id.properties[0];
              const exported = kind === "fs" ? "readFile" : "fileURLToPath";
              const alias = property.value?.name;
              if (property.type !== "Property" || property.computed || property.key?.name !== exported || property.value?.type !== "Identifier" || !alias || forbidden.has(alias) || alias === "app") return false;
              imports.set(alias, exported); bindings.add(alias); states.delete(alias); paths.delete(alias); numeric.delete(alias); declare(alias); continue;
            }
          }
          if (entry.id?.type !== "Identifier" || !name || forbidden.has(name) || imports.has(name)) return false;
          if (entry.init === null) {
            if (statement.kind === "const" && !allowUninitializedConst) return false;
            bindings.add(name); apps.delete(name); states.delete(name); paths.delete(name); numeric.delete(name); declare(name); continue;
          }
          if (!value(entry.init)) return false;
          const appInit = scopedApp(entry.init);
          if ((name === "app" || apps.has(name)) && !appInit) return false;
          // Only a new binding or an already-scoped app may receive app
          // authority. Failed assignments must not promote older data.
          if (appInit && bindings.has(name) && !apps.has(name)) return false;
          if (appInit) apps.add(name);
          const isPath = screenshotPath(entry.init);
          bindings.add(name); paths.delete(name); if (isPath) paths.add(name);
          states.delete(name); if (member(entry.init?.argument?.callee, "sky", "get_app_state")) states.add(name);
          if (numberValue(entry.init)) numeric.add(name); else numeric.delete(name);
          declare(name);
        }
        return true;
      };
      const expression = (node: any): boolean => {
        if (this.scope.backend === "native" && node.type === "AssignmentExpression" && node.operator === "=" && member(node.left, "globalThis", "sky") && importedSky(node.right)) return true;
        if (node.type === "UpdateExpression") return update(node);
        if (node.type === "AssignmentExpression" && node.operator === "=" && node.left.type === "Identifier") {
          const name = node.left.name;
          if (!bindings.has(name) || forbidden.has(name) || imports.has(name) || !value(node.right)) return false;
          // Rebinding an existing app to the same authorized capability is
          // normal recovery. A failed assignment leaves only that older,
          // already-scoped app behind. Never promote an older data binding.
          if (apps.has(name)) return scopedApp(node.right);
          if (name === "app" || scopedApp(node.right)) return false;
          const isPath = screenshotPath(node.right);
          paths.delete(name); if (isPath) paths.add(name);
          states.delete(name); if (member(node.right?.argument?.callee, "sky", "get_app_state")) states.add(name);
          if (numberValue(node.right)) numeric.add(name); else numeric.delete(name);
          return true;
        }
        return value(node);
      };
      const block = (statement: any): boolean => {
        const before = snapshot();
        scopes.push(new Set());
        const accepted = statements(statement.body);
        const locals = scopes.pop()!;
        if (!accepted) return false;
        const after = snapshot();
        for (const name of locals) {
          const restoreBinding = <T>(set: Set<T>, prior: Set<T>, value: T) => prior.has(value) ? set.add(value) : set.delete(value);
          restoreBinding(after.bindings, before.bindings, name);
          restoreBinding(after.apps, before.apps, name);
          restoreBinding(after.states, before.states, name);
          restoreBinding(after.paths, before.paths, name);
          restoreBinding(after.numeric, before.numeric, name);
          const priorImport = before.imports.get(name);
          if (priorImport) after.imports.set(name, priorImport); else after.imports.delete(name);
        }
        restore(after);
        return true;
      };
      const branch = (statement: any): Environment | null => {
        if (statement.type === "BlockStatement") return block(statement) ? snapshot() : null;
        return statementNode(statement) ? snapshot() : null;
      };
      const sameSet = <T>(left: Set<T>, right: Set<T>) => left.size === right.size && [...left].every(value => right.has(value));
      const sameMap = <K, V>(left: Map<K, V>, right: Map<K, V>) => left.size === right.size && [...left].every(([key, value]) => right.get(key) === value);
      const sameEnvironment = (left: Environment, right: Environment) =>
        sameSet(left.bindings, right.bindings) && sameSet(left.apps, right.apps) && sameSet(left.states, right.states) &&
        sameMap(left.imports, right.imports) && sameSet(left.paths, right.paths) && sameSet(left.numeric, right.numeric);
      // Re-run each loop transfer from a descending invariant until it reaches
      // a fixed point. This abstracts every later iteration without imposing a
      // runtime iteration limit: each capability set can only lose members.
      const loopFixedPoint = (entry: Environment, transfer: () => boolean): Environment | null => {
        let invariant = entry;
        for (;;) {
          restore(invariant);
          if (!transfer()) return null;
          const after = snapshot();
          join(invariant, after, invariant);
          const next = snapshot();
          if (sameEnvironment(invariant, next)) return next;
          invariant = next;
        }
      };
      const statementNode = (statement: any): boolean => {
        if (statement.type === "EmptyStatement") return true;
        if (statement.type === "VariableDeclaration") return declaration(statement);
        if (statement.type === "ExpressionStatement") return expression(statement.expression);
        if (statement.type === "BlockStatement") return block(statement);
        if (statement.type === "IfStatement") {
          if (!value(statement.test)) return false;
          const base = snapshot();
          const consequent = branch(statement.consequent); if (!consequent) return false;
          restore(base);
          const alternate = statement.alternate ? branch(statement.alternate) : snapshot(); if (!alternate) return false;
          join(base, consequent, alternate);
          return true;
        }
        if (statement.type === "WhileStatement") {
          const base = snapshot();
          const fixed = loopFixedPoint(base, () => value(statement.test) && branch(statement.body) !== null);
          if (!fixed) return false;
          join(base, fixed, base);
          return true;
        }
        if (statement.type === "ForStatement") {
          if (!statement.init || !statement.test || !statement.update) return false;
          const base = snapshot(); scopes.push(new Set());
          const initialized = statement.init.type === "VariableDeclaration" ? declaration(statement.init) : expression(statement.init);
          if (!initialized) return false;
          const entry = snapshot();
          const fixed = loopFixedPoint(entry, () => value(statement.test) && branch(statement.body) !== null && expression(statement.update));
          if (!fixed) return false;
          scopes.pop(); join(base, fixed, base);
          return true;
        }
        if (statement.type === "ForOfStatement") {
          if (!value(statement.right)) return false;
          const base = snapshot(); scopes.push(new Set());
          const initialized = statement.left?.type === "VariableDeclaration" && statement.left.declarations.length === 1 && declaration(statement.left, true);
          if (!initialized) return false;
          const entry = snapshot();
          const fixed = loopFixedPoint(entry, () => branch(statement.body) !== null);
          if (!fixed) return false;
          scopes.pop(); join(base, fixed, base);
          return true;
        }
        return false;
      };
      const statements = (body: any[]): boolean => body.every(statementNode);
      if (!statements(ast.body)) return false;
      this.bindings = bindings;
      this.appBindings = apps;
      this.stateBindings = states;
      this.screenshotImports = imports;
      this.screenshotPaths = paths;
      this.numericBindings = numeric;
      return ast.body.length > 0;
    } catch { return false; }
  }
}

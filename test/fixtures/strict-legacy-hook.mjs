import { createHook } from "node:async_hooks";
createHook({ init() {} }).enable();

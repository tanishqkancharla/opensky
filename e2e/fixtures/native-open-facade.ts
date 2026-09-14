import type { PublicSdk as OpenSky } from "./sdk.js";

/** Separate facade for lifecycle observation; never writes to the real SDK. */
export function lifecycleFacade(real: OpenSky, observe: { open(args: Parameters<OpenSky["open_target"]>): ReturnType<OpenSky["open_target"]>; close(args: Parameters<OpenSky["close_target"]>): ReturnType<OpenSky["close_target"]> }): OpenSky {
  return {
    target: real.target,
    list_apps: () => real.list_apps(), get_app_state: args => real.get_app_state(args),
    open_target: args => observe.open([args]), navigate: args => real.navigate(args),
    close_target: args => observe.close([args]), bring_to_front: args => real.bring_to_front(args),
    click: args => real.click(args), drag: args => real.drag(args), paste: args => real.paste(args),
    perform_secondary_action: args => real.perform_secondary_action(args), press_key: args => real.press_key(args),
    scroll: args => real.scroll(args), select_text: args => real.select_text(args), set_value: args => real.set_value(args),
    type_text: args => real.type_text(args), close: () => real.close(),
  };
}

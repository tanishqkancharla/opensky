export function finishNativeOpen<T>(result: T, completed: boolean, actionError: unknown, cleanupError: unknown): T {
  if (actionError && cleanupError) throw new AggregateError([actionError, cleanupError], "Native open action and cleanup failed");
  if (cleanupError) throw cleanupError;
  if (actionError) throw actionError;
  if (!completed) throw new Error("Native open fixture completed without a result");
  return result;
}

/** One task prompt for both Linux interfaces; API help belongs to tool documentation. */
export function matchedLinuxPrompt(input: {
  backend: "native" | "opensky"; taskInstruction: string; appName: string; inputFile: string;
}): string {
  const interfaceName = input.backend === "native" ? "the Computer use plugin" : "OpenSky";
  return `Use ${interfaceName} in the open ${input.appName} document: ${input.taskInstruction}\nSave changes to ${input.inputFile} in its existing format.`;
}

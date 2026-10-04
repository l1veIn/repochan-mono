export type NpmInvocation = { command: string; args: string[] };

/** Node subprocesses require the command processor for Windows npm.cmd shims. */
export function resolveNpmInvocation(
  args: string[],
  platform: NodeJS.Platform = process.platform,
  comSpec: string | undefined = process.env.ComSpec,
): NpmInvocation {
  return platform === "win32"
    ? { command: comSpec || "cmd.exe", args: ["/d", "/s", "/c", "npm", ...args] }
    : { command: "npm", args: [...args] };
}

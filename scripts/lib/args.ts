/** The value after a command-line option, e.g. option(args, '--key') for "--key file.json". */
export function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

/** Arguments that are neither options nor option values. */
export function positional(args: string[], optionsWithValues: string[] = []): string[] {
  return args.filter((a, i) => !a.startsWith('--') && !optionsWithValues.includes(args[i - 1]));
}

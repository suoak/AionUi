/** Stub handler for github-workspace.getfile — wire in host later. */
export async function run(input) {
  return { ok: true, tool: 'get-file', input };
}

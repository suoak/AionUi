/** Stub handler for github-workspace.listprs — wire in host later. */
export async function run(input) {
  return { ok: true, tool: 'list-prs', input };
}

async function waitFor(url: string, label: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  let lastError: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`${label} HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Health gate failed for ${label} (${url}): ${String(lastError)}`);
}

/**
 * Shell health gates follow the selected projects so the D stack can run without shell A (and vice versa):
 * Shell D (and remote-events) is opt-in: gated only with `--project shell-d` or when SHELL_D_URL is set.
 * Shell A is gated unless only `shell-d` is selected.
 */
function selectedProjects(): string[] {
  const out: string[] = [];
  process.argv.forEach((arg, i, all) => {
    if (arg === "--project" || arg === "-p") out.push(all[i + 1] ?? "");
    else if (arg.startsWith("--project=")) out.push(arg.slice("--project=".length));
  });
  return out;
}

export default async function globalSetup(): Promise<void> {
  const shellA = process.env.SHELL_A_URL ?? "http://localhost:8090";
  const shellD = process.env.SHELL_D_URL ?? "http://localhost:8093";
  const projects = selectedProjects();
  const wantsD = projects.includes("shell-d") || Boolean(process.env.SHELL_D_URL);
  const wantsA = projects.length === 0 || projects.some((p) => p !== "shell-d");
  await waitFor("http://127.0.0.1:4010/health", "mock-api");
  await waitFor("http://127.0.0.1:5001/mf-manifest.json", "remote-react");
  await waitFor("http://127.0.0.1:5002/mf-manifest.json", "remote-vue");
  if (wantsA) await waitFor(shellA, "shell-injected");
  if (wantsD) {
    await waitFor("http://127.0.0.1:5003/mf-manifest.json", "remote-events");
    await waitFor(shellD, "shell-events");
  }
}

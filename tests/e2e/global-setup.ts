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

export default async function globalSetup(): Promise<void> {
  const shellA = process.env.SHELL_A_URL ?? "http://localhost:8090";
  await waitFor("http://127.0.0.1:4010/health", "mock-api");
  await waitFor("http://127.0.0.1:5001/mf-manifest.json", "remote-react");
  await waitFor("http://127.0.0.1:5002/mf-manifest.json", "remote-vue");
  await waitFor(shellA, "shell-injected");
}

const MOCK_API_CONTROLS_URL = "http://127.0.0.1:4010/__controls";

export class MockApiControls {
  private async post(path: string, body?: unknown): Promise<void> {
    const response = await fetch(`${MOCK_API_CONTROLS_URL}/${path}`, {
      method: "POST",
      ...(body === undefined ? {} : {
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    });
    if (!response.ok) {
      throw new Error(`Mock API control ${path} failed with HTTP ${response.status}`);
    }
  }

  delay(milliseconds: number): Promise<void> {
    return this.post("delay", { milliseconds });
  }

  failNext(operation?: string): Promise<void> {
    return this.post("fail-next", operation === undefined ? {} : { operation });
  }

  cleanupFail(): Promise<void> {
    return this.post("cleanup-fail");
  }

  reset(): Promise<void> {
    return this.post("reset");
  }
}

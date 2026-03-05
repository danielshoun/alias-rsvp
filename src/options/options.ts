const domainInput = document.getElementById("aliasDomain") as HTMLInputElement;
const saveBtn = document.getElementById("save") as HTMLButtonElement;
const statusEl = document.getElementById("status")!;

async function loadConfig(): Promise<void> {
  const stored = await browser.storage.local.get("config");
  const config = stored.config as { aliasDomain?: string } | undefined;
  if (config?.aliasDomain) {
    domainInput.value = config.aliasDomain;
  }
}

saveBtn.addEventListener("click", async () => {
  const domain = domainInput.value.trim().toLowerCase();
  if (!domain) {
    statusEl.textContent = "Domain cannot be empty.";
    statusEl.style.color = "#991b1b";
    return;
  }

  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    statusEl.textContent = "Please enter a valid domain (e.g. example.com).";
    statusEl.style.color = "#991b1b";
    return;
  }

  const stored = await browser.storage.local.get("config");
  const config = (stored.config as Record<string, unknown>) || {};
  config.aliasDomain = domain;
  await browser.storage.local.set({ config });

  domainInput.value = domain;
  statusEl.textContent = "Saved!";
  statusEl.style.color = "#166534";
});

loadConfig();

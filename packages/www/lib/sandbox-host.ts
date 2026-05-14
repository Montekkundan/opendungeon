export interface SandboxHostPlan {
  commands: {
    install: string;
    join: string;
    launch: string;
  };
  docs: {
    installPackages: string;
    sdkReference: string;
    snapshots: string;
  };
  guardrails: string[];
  metadata: {
    billingOwner: string;
    lifecycle: string[];
    port: number;
    provider: "vercel-sandbox";
    status: "planned";
  };
  port: number;
  provider: "vercel-sandbox";
  status: "planned";
  steps: string[];
  summary: string;
}

interface SandboxHostPlanInput {
  lobbyId: string;
  mode: "coop" | "race";
  seed: number;
}

const SANDBOX_PORT = 3737;

export function buildSandboxHostPlan({
  lobbyId,
  mode,
  seed,
}: SandboxHostPlanInput): SandboxHostPlan {
  const launch = [
    "opendungeon-host",
    "--host 0.0.0.0",
    '--public-url "$OPENDUNGEON_PUBLIC_URL"',
    `--mode ${mode}`,
    `--seed ${seed}`,
    `--port ${SANDBOX_PORT}`,
  ].join(" ");

  return {
    commands: {
      install: "bun add -g @montekkundan/opendungeon",
      join: "opendungeon join https://SANDBOX_PORT_DOMAIN_FROM_WEBSITE",
      launch,
    },
    docs: {
      installPackages:
        "https://vercel.com/kb/guide/how-to-install-system-packages-in-vercel-sandbox",
      sdkReference: "https://vercel.com/docs/vercel-sandbox/sdk-reference",
      snapshots:
        "https://vercel.com/kb/guide/how-to-use-snapshots-for-faster-sandbox-startup",
    },
    guardrails: [
      "The host player must connect their own Vercel account or team before provisioning.",
      "The website must show runtime, billing, and cleanup warnings before creating a sandbox.",
      "The sandbox must expose port 3737 and store the resulting public URL before players join.",
      "The host must stop or expire the sandbox and record cleanup status in Supabase.",
      "LAN, VPS, and Docker hosting stay supported while Sandbox hosting is experimental.",
    ],
    metadata: {
      billingOwner: "host-vercel-account",
      lifecycle: [
        "connect-vercel-account",
        "create-or-restore-sandbox",
        "install-or-use-snapshot",
        "run-opendungeon-host-detached",
        "store-public-url-in-supabase",
        "stop-sandbox-on-lobby-expiry",
      ],
      port: SANDBOX_PORT,
      provider: "vercel-sandbox",
      status: "planned",
    },
    port: SANDBOX_PORT,
    provider: "vercel-sandbox",
    status: "planned",
    steps: [
      "Sign in with Supabase so the lobby has an owner-scoped world row.",
      "Connect the host player's Vercel account and choose the team that should own sandbox usage.",
      "Create a Sandbox with node24 and port 3737 exposed, preferably from a prepared opendungeon snapshot.",
      "Run the host command detached, resolve sandbox.domain(3737), and save that public URL on the lobby.",
      "Let players join the saved URL, then stop the sandbox and mark the lobby closed when play ends.",
    ],
    summary: `Planned user-owned Sandbox host plan for ${lobbyId}. The website stores the intent now; live provisioning still needs Vercel account linking, lifecycle cleanup, and billing guardrails.`,
  };
}

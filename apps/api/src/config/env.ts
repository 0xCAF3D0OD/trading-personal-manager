import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? true : !['0', 'false', 'no', 'off'].includes(v.toLowerCase())));

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined));

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_PATH: z.string().default('./data/app.db'),
  LOG_LEVEL: z.string().default('info'),
  CORS_ORIGIN: optionalString,

  SOLANA_RPC_URL: z.string().url().default('https://api.mainnet-beta.solana.com'),
  HELIUS_API_KEY: optionalString,
  HELIUS_MAX_HOLDER_PAGES: z.coerce.number().int().positive().default(200),

  SOLSCAN_API_KEY: optionalString,
  SOLSCAN_BASE_URL: z.string().url().default('https://pro-api.solscan.io/v2.0'),
  SOLSCAN_MONTHLY_CU_BUDGET: z.coerce.number().positive().default(1_000_000),

  GECKOTERMINAL_BASE_URL: z.string().url().default('https://api.geckoterminal.com/api/v2'),
  COINGECKO_ONCHAIN_BASE_URL: z.string().url().default('https://api.coingecko.com/api/v3/onchain'),
  COINGECKO_DEMO_API_KEY: optionalString,
  DEXSCREENER_BASE_URL: z.string().url().default('https://api.dexscreener.com'),
  JUPITER_PRICE_URL: z.string().url().default('https://lite-api.jup.ag/price/v3'),
  JUPITER_QUOTE_URL: z.string().url().default('https://lite-api.jup.ag/swap/v1'),
  RUGCHECK_BASE_URL: z.string().url().default('https://api.rugcheck.xyz/v1'),

  CRON_MARKET_SNAPSHOT: z.string().default('*/15 * * * *'),
  CRON_HOLDER_SNAPSHOT: z.string().default('0 6 * * *'),
  CRON_ALERT_EVAL: z.string().default('* * * * *'),
  JOBS_ENABLED: bool,

  NTFY_URL: optionalString,
  NTFY_TOPIC: optionalString,
  NTFY_TOKEN: optionalString,
  TELEGRAM_BOT_TOKEN: optionalString,
  TELEGRAM_CHAT_ID: optionalString,
  DISCORD_WEBHOOK_URL: optionalString,

  RENDERER_URL: optionalString,
  WATCH_USER_AGENT_CONTACT: optionalString,
  CRYPTOPANIC_API_KEY: optionalString,
  GITHUB_TOKEN: optionalString,
  X_BEARER_TOKEN: optionalString,

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),
  RATE_LIMIT_EXPENSIVE_MAX: z.coerce.number().int().positive().default(10),
});

export type Env = z.infer<typeof EnvSchema> & {
  heliusApiKey: string | undefined;
  isHelius: boolean;
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuration invalide :\n${issues}`);
  }
  const env = parsed.data;
  const isHelius = /helius/i.test(env.SOLANA_RPC_URL);
  let heliusApiKey = env.HELIUS_API_KEY;
  if (!heliusApiKey && isHelius) {
    try {
      heliusApiKey = new URL(env.SOLANA_RPC_URL).searchParams.get('api-key') ?? undefined;
    } catch {
      heliusApiKey = undefined;
    }
  }
  for (const k of ['SOLSCAN_API_KEY', 'HELIUS_API_KEY', 'TELEGRAM_BOT_TOKEN', 'NTFY_TOKEN', 'CRYPTOPANIC_API_KEY', 'GITHUB_TOKEN', 'X_BEARER_TOKEN', 'COINGECKO_DEMO_API_KEY']) {
    if (source[`VITE_${k}`]) {
      throw new Error(`VITE_${k} est défini : les variables VITE_* sont publiques, déplacez ce secret.`);
    }
  }
  return { ...env, heliusApiKey, isHelius };
}

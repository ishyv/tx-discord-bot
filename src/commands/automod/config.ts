import { defineConfig, z } from "@/configuration/definitions";
import { ConfigurableModule } from "@/configuration/constants";

export const automodLinkSpamConfig = defineConfig(
  ConfigurableModule.AutomodLinkSpam,
  z.object({
    enabled: z.boolean().default(false),
    maxLinks: z.number().int().min(1).default(4),
    windowSeconds: z.number().int().min(1).default(10),
    timeoutSeconds: z.number().int().min(1).default(300),
    action: z.enum(["timeout", "mute", "delete", "report"]).default("timeout"),
    reportChannelId: z.string().nullable().default(null),
  }),
  { path: "automod.linkSpam" },
);

export const automodDomainWhitelistConfig = defineConfig(
  ConfigurableModule.AutomodDomainWhitelist,
  z.object({
    enabled: z.boolean().default(false),
    domains: z.array(z.string()).default([]),
  }),
  { path: "automod.domainWhitelist" },
);

export const automodShortenersConfig = defineConfig(
  ConfigurableModule.AutomodShorteners,
  z.object({
    enabled: z.boolean().default(false),
    resolveFinalUrl: z.boolean().default(false),
    allowedShorteners: z.array(z.string()).default([
      "bit.ly",
      "t.co",
      "tinyurl.com",
      "cutt.ly",
      "is.gd",
      "rebrand.ly",
      "goo.gl",
    ]),
  }),
  { path: "automod.shorteners" },
);

declare module "@/configuration/definitions" {
  export interface ConfigDefinitions {
    [ConfigurableModule.AutomodLinkSpam]: z.infer<typeof automodLinkSpamConfig>;
    [ConfigurableModule.AutomodDomainWhitelist]: z.infer<
      typeof automodDomainWhitelistConfig
    >;
    [ConfigurableModule.AutomodShorteners]: z.infer<
      typeof automodShortenersConfig
    >;
  }
}

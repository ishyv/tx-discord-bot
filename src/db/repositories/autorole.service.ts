import { AutoroleService } from "@/modules/autorole";

export const grantByRule = async (
  options: Parameters<typeof AutoroleService.grantByRule>[0],
) => {
  const res = await AutoroleService.grantByRule(options);
  if (res.isErr()) {
    throw res.error;
  }
  return res.unwrap();
};

export const revokeByRule = (
  options: Parameters<typeof AutoroleService.revokeByRule>[0],
) => AutoroleService.revokeByRule(options);

export const purgeRule = (
  client: Parameters<typeof AutoroleService.purgeRule>[0],
  guildId: string,
  ruleName: string,
) => AutoroleService.purgeRule(client, guildId, ruleName);

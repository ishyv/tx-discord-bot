/**
 * Role Dashboard Command.
 *
 * Purpose: Visual dashboard for managing moderated roles.
 */
import type { GuildCommandContext } from "seyfert";
import {
  ActionRow,
  Declare,
  Embed,
  Modal,
  RoleSelectMenu,
  StringSelectMenu,
  StringSelectOption,
  SubCommand,
  TextInput,
} from "seyfert";
import { Button, UI } from "@/modules/ui";
import { ButtonStyle, MessageFlags, TextInputStyle } from "seyfert/lib/types";

import { GuildStore } from "@/db/repositories/guilds";
import { GuildRolesRepo } from "@/db/repositories/guild-roles";
import { DEFAULT_MODERATION_ACTIONS } from "@/modules/guild-roles"; // constants only
import type {
  RoleCommandOverride,
  RoleLimitRecord,
  LimitWindow,
} from "@/db/schemas/guild";

type DashboardRole = {
  key: string;
  label: string;
  discordRoleId: string | null;
  reach: Record<string, RoleCommandOverride>;
  limits: Record<string, RoleLimitRecord | undefined>;
};

interface DashboardState extends Record<string, unknown> {
  selectedRoleIds: string[];
  focusedAction: string;
  feedback: string | null;
  roles: DashboardRole[];
}

const FEEDBACK_NONE = "Select one or more roles to get started.";

const normKey = (k: string) =>
  k
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

function secondsToTimeString(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}

function formatOverrideLabel(
  override: RoleCommandOverride | undefined,
): string {
  switch (override) {
    case "allow":
      return "Allow";
    case "deny":
      return "Deny";
    default:
      return "Inherit";
  }
}

// Accepts empty -> “no window”, “0*” -> “no window”, only errors on non-empty invalid strings
function normalizeWindowInput(
  input: string | undefined,
): LimitWindow | null | "empty" {
  if (input == null) return "empty";
  const normalized = input.trim().toLowerCase();
  if (!normalized) return "empty";
  if (normalized.startsWith("0")) return null; // interpret as no window
  if (!/^(\d+)(m|h|d)$/.test(normalized)) return null; // invalid
  return normalized as LimitWindow;
}

function windowToSeconds(window: LimitWindow): number {
  const match = window.match(/^(\d+)(m|h|d)$/)!;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  return unit === "m"
    ? value * 60
    : unit === "h"
      ? value * 3600
      : value * 86400;
}

function formatLimit(limit: RoleLimitRecord | undefined): string {
  if (!limit || !Number.isFinite(limit.limit) || limit.limit <= 0) {
    return "No limit configured";
  }
  const count = Math.max(0, Math.floor(limit.limit));
  const windowLabel = limit.window
    ? secondsToTimeString(windowToSeconds(limit.window))
    : "no fixed window";
  return `${count} use(s) - ${windowLabel}`;
}

function buildRoleSummary(role: DashboardRole): string {
  const lines = DEFAULT_MODERATION_ACTIONS.map((action) => {
    const override = role.reach[action.key] ?? "inherit";
    const limit = role.limits[action.key];
    return `- **${action.label}** -> ${formatOverrideLabel(override)} - ${formatLimit(limit)}`;
  });
  return lines.join("\n");
}

function findRolesByDiscordIds(
  roleIds: readonly string[],
  roles: DashboardRole[],
): DashboardRole[] {
  const idSet = new Set(roleIds);
  return roles.filter(
    (role) => role.discordRoleId && idSet.has(role.discordRoleId),
  );
}

// Build dashboard roles straight from repo.readRoles()
async function fetchDashboardRoles(guildId: string): Promise<DashboardRole[]> {
  const res = await GuildRolesRepo.read(guildId);
  if (res.isErr()) return [];
  const rolesObj = res.unwrap();
  const entries = Object.entries(rolesObj ?? {});
  return entries.map(([key, rec]) => {
    const reach: Record<string, RoleCommandOverride> = {};
    for (const [k, v] of Object.entries(rec.reach ?? {})) reach[normKey(k)] = v;
    const limits: Record<string, RoleLimitRecord> = {};
    for (const [k, v] of Object.entries(rec.limits ?? {}))
      limits[normKey(k)] = v as RoleLimitRecord;
    const discordRoleId = rec.discordRoleId ?? null;
    const label: string = rec.label ?? key;
    return { key, label, discordRoleId, reach, limits };
  });
}

@Declare({
  name: "dashboard",
  description: "Visual dashboard to manage moderated roles",
})
export default class RolesDashboardCommand extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.write({
        content:
          "[!] This command can only be executed within a server.",
      });
      return;
    }

    await GuildStore.ensure(guildId);

    const actions = DEFAULT_MODERATION_ACTIONS;
    const initialRoles = await fetchDashboardRoles(guildId);

    const ui = new UI<DashboardState>(
      {
        selectedRoleIds: [],
        focusedAction: actions[0]?.key ?? "",
        feedback: initialRoles.length
          ? FEEDBACK_NONE
          : "No roles configured yet.",
        roles: initialRoles,
      },
      (state) => {
        const selectedIds = state.selectedRoleIds;
        const selectedRoles = findRolesByDiscordIds(selectedIds, state.roles);
        const hasSelection = selectedRoles.length > 0;
        const actionKey = state.focusedAction || actions[0]?.key || "";
        const activeAction =
          actions.find((item) => item.key === actionKey) ?? actions[0];

        const embed = new Embed({
          title: "Role Control Panel",
          color: 0x5865f2,
          description: [
            "1. Choose one or more roles from the top menu.",
            "2. Select the moderation action you want to manage.",
            "3. Use the buttons to allow, deny, or adjust usage limits.",
            "",
            state.feedback ?? FEEDBACK_NONE,
          ].join("\n"),
        });

        if (state.roles.length) {
          embed.addFields({
            name: "Configured Roles",
            value: state.roles
              .map((role) =>
                role.discordRoleId
                  ? `- ${role.label} (<@&${role.discordRoleId}>)`
                  : `- ${role.label} (no Discord role assigned)`,
              )
              .join("\n"),
          });
        } else {
          embed.addFields({
            name: "No Configurations",
            value:
              "Use `/roles set` to register a managed role before using the dashboard.",
          });
        }

        if (selectedRoles.length) {
          for (const role of selectedRoles) {
            embed.addFields({
              name: `${role.label}${role.discordRoleId ? ` - <@&${role.discordRoleId}>` : ""}`,
              value: buildRoleSummary(role),
              inline: false,
            });
          }
        }

        const roleSelect = new RoleSelectMenu()
          .setPlaceholder("Select roles to manage")
          .setValuesLength({ min: 1, max: 10 })
          .setDisabled(state.roles.length === 0)
          .onSelect("roles_dashboard_roles", async (menuCtx) => {
            await menuCtx.deferUpdate();
            const values = menuCtx.interaction.values ?? [];
            const knownRoles = findRolesByDiscordIds(values, state.roles);
            const missingIds = values.filter(
              (value) =>
                !knownRoles.some((role) => role.discordRoleId === value),
            );

            state.selectedRoleIds = values;

            if (!values.length) {
              state.feedback = FEEDBACK_NONE;
            } else if (missingIds.length) {
              const mentions = missingIds.map((id) => `<@&${id}>`).join(", ");
              state.feedback = [
                "Some selected roles are not configured in the bot:",
                mentions,
                "Use `/roles set` to link them before applying changes.",
              ].join("\n");
            } else {
              state.feedback =
                values.length === 1
                  ? "Selected role ready to edit its permissions."
                  : "Selected roles ready to apply changes in bulk.";
            }
          });

        if (selectedIds.length) {
          roleSelect.setDefaultRoles(selectedIds);
        }

        const actionSelect = new StringSelectMenu()
          .setPlaceholder("Moderation Action")
          .setValuesLength({ min: 1, max: 1 })
          .onSelect("roles_dashboard_action", async (menuCtx) => {
            await menuCtx.deferUpdate();
            const value = menuCtx.interaction.values?.[0];
            if (value) {
              state.focusedAction = value;
              state.feedback = `Action selected: ${actions.find((item) => item.key === value)?.label ?? value
                }.`;
            }
          });

        for (const action of actions) {
          const option = new StringSelectOption()
            .setLabel(action.label)
            .setValue(action.key)
            .setDescription(
              `Manage permissions and limits for ${action.label}`,
            );
          if (action.key === activeAction?.key) option.setDefault(true);
          actionSelect.addOption(option);
        }

        const controlsDisabled = !hasSelection || !activeAction;

        const applyOverride = (
          id: string,
          label: string,
          style: ButtonStyle,
          override: RoleCommandOverride,
        ) =>
          new Button()
            .setLabel(label)
            .setStyle(style)
            .setDisabled(controlsDisabled)
            .onClick(id, async (buttonCtx) => {
              const targetRoles = findRolesByDiscordIds(
                state.selectedRoleIds,
                state.roles,
              );
              if (!targetRoles.length || !activeAction) {
                await buttonCtx.write({
                  content:
                    "Select at least one role and one action to continue.",
                  flags: MessageFlags.Ephemeral,
                });
                return;
              }

              try {
                for (const role of targetRoles) {
                  await GuildRolesRepo.setOverride(
                    guildId,
                    role.key,
                    activeAction.key,
                    override,
                  );
                }
                state.roles = await fetchDashboardRoles(guildId);
                state.feedback = `Override updated to ${formatOverrideLabel(override)} for ${targetRoles.length} role(s) in ${activeAction.label}.`;
              } catch (error) {
                console.error("roles dashboard override", error);
                state.feedback =
                  "Could not update the override. Try again.";
              }
            });

        const allowButton = applyOverride(
          "roles_dashboard_allow",
          "Allow",
          ButtonStyle.Success,
          "allow",
        );
        const denyButton = applyOverride(
          "roles_dashboard_deny",
          "Deny",
          ButtonStyle.Danger,
          "deny",
        );
        const inheritButton = applyOverride(
          "roles_dashboard_inherit",
          "Inherit Discord",
          ButtonStyle.Secondary,
          "inherit",
        );

        const action =
          actions.find((item) => item.key === state.focusedAction) ??
          actions[0];

        const limitInput = new TextInput()
          .setCustomId("limit_count")
          .setLabel("Maximum number of uses")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Example: 5 (use 0 to remove the limit)")
          .setRequired(true);

        const windowInput = new TextInput()
          .setCustomId("limit_window")
          .setLabel("Time window")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("10m, 1h, 6h, 24h or 7d. Leave empty for no window.")
          .setRequired(false);

        const limitModal = new Modal()
          .setCustomId("roles_dashboard_limit_modal")
          .setTitle(`Limit for ${action?.label ?? "action"}`)
          .addComponents(
            new ActionRow<TextInput>().setComponents([limitInput]),
            new ActionRow<TextInput>().setComponents([windowInput]),
          )
          .run(async (modalCtx) => {
            const refreshedRoles = findRolesByDiscordIds(
              state.selectedRoleIds,
              state.roles,
            );
            const refreshedAction =
              actions.find((i) => i.key === state.focusedAction) ?? actions[0];

            if (!refreshedRoles.length || !refreshedAction) {
              await modalCtx.write({
                content:
                  "Select at least one role and a valid action before configuring limits.",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            const rawLimit = modalCtx.getInputValue("limit_count") ?? "";
            const rawWindow = modalCtx.getInputValue("limit_window") ?? "";

            const limitNumber = Number(rawLimit.trim());
            if (!Number.isFinite(limitNumber) || limitNumber < 0) {
              await modalCtx.write({
                content:
                  "Enter a valid number (0 or greater) for the usage limit.",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            // Allow empty string -> no window; non-empty invalid -> error; “0*” -> no window
            const nw = normalizeWindowInput(rawWindow);
            if (nw === null && rawWindow.trim()) {
              await modalCtx.write({
                content:
                  "Invalid window. Use a valid format: 10m, 1h, 6h, 24h or 7d.",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }
            const windowValue: LimitWindow | null =
              nw === "empty" ? null : (nw as LimitWindow | null);
            const windowSeconds = windowValue
              ? windowToSeconds(windowValue)
              : null;

            try {
              if (limitNumber === 0) {
                for (const role of refreshedRoles) {
                  await GuildRolesRepo.write(guildId, (roles) => {
                    if (!roles[role.key]) return roles;
                    const action = refreshedAction.key
                      .toLowerCase()
                      .replace(/[\s-]+/g, "_");
                    if ((roles[role.key] as any).limits) {
                      delete (roles[role.key] as any).limits[action];
                    }
                    return roles;
                  });
                }
                state.feedback = `Limits for ${refreshedAction.label} were removed for ${refreshedRoles.length} role(s).`;
              } else {
                const limitRecord: RoleLimitRecord = {
                  limit: Math.max(0, Math.floor(limitNumber)),
                  window: windowValue ?? undefined, // your schema tolerates undefined/null
                  windowSeconds: windowSeconds ?? undefined,
                } as any;

                for (const role of refreshedRoles) {
                  await GuildRolesRepo.setLimit(
                    guildId,
                    role.key,
                    refreshedAction.key,
                    limitRecord,
                  );
                }
                state.feedback = `Limit updated for ${refreshedAction.label}: ${limitRecord.limit} use(s) ${limitRecord.window
                  ? secondsToTimeString(windowSeconds!)
                  : "no window"
                  } (${refreshedRoles.length} role(s)).`;
              }

              state.roles = await fetchDashboardRoles(guildId);
              await modalCtx.write({
                content: "Limit updated successfully.",
                flags: MessageFlags.Ephemeral,
              });
            } catch (error) {
              console.error("roles dashboard limit", error);
              state.feedback =
                "Could not save the limit. Try again.";
              await modalCtx.write({
                content: "An error occurred while saving the limit.",
                flags: MessageFlags.Ephemeral,
              });
            }
          });

        const configureLimitButton = new Button()
          .setLabel("Configure limit")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(controlsDisabled)
          .opens(limitModal);

        const clearLimitButton = new Button()
          .setLabel("Remove limit")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(controlsDisabled)
          .onClick("roles_dashboard_clear_limit", async (buttonCtx) => {
            const targetRoles = findRolesByDiscordIds(
              state.selectedRoleIds,
              state.roles,
            );
            const a =
              actions.find((i) => i.key === state.focusedAction) ?? actions[0];

            if (!targetRoles.length || !a) {
              await buttonCtx.write({
                content:
                  "Select at least one role and one action to remove the limit.",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            try {
              for (const role of targetRoles) {
                await GuildRolesRepo.write(guildId, (roles) => {
                  if (!roles[role.key]) return roles;
                  const action = a.key.toLowerCase().replace(/[\s-]+/g, "_");
                  if ((roles[role.key] as any).limits) {
                    delete (roles[role.key] as any).limits[action];
                  }
                  return roles;
                });
              }
              state.roles = await fetchDashboardRoles(guildId);
              state.feedback = `Limit removed for ${a.label} in ${targetRoles.length} role(s).`;
            } catch (error) {
              console.error("roles dashboard clear limit", error);
              state.feedback =
                "Could not remove the limit. Try again.";
            }
          });

        return {
          embeds: [embed],
          components: [
            new ActionRow().addComponents(roleSelect),
            new ActionRow().addComponents(actionSelect),
            new ActionRow().addComponents(
              allowButton,
              denyButton,
              inheritButton,
              configureLimitButton,
              clearLimitButton,
            ),
          ],
        };
      },
      async (msg) => {
        await ctx.editOrReply(msg);
      },
    );

    await ui.send();
  }
}

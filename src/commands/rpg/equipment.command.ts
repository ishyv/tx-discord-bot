/**
 * RPG Equipment Subcommand.
 *
 * Purpose: Unified equipment management for equip/unequip in one interaction UI.
 * Context: Slot picker -> slot actions (unequip/equip) -> item details.
 */
import {
  ActionRow,
  Declare,
  Embed,
  StringSelectMenu,
  StringSelectOption,
  SubCommand,
  type GuildCommandContext,
} from "seyfert";
import { Button, UI } from "@/modules/ui";
import { HelpDoc, HelpCategory } from "@/modules/help";
import { ButtonStyle, MessageFlags } from "seyfert/lib/types";
import { rpgEquipmentService } from "@/modules/rpg/equipment/service";
import { rpgProfileRepo } from "@/modules/rpg/profile/repository";
import { normalizeModernInventory } from "@/modules/inventory/inventory";
import { buildInventoryView } from "@/modules/inventory/instances";
import { getItemDefinition, getToolMaxDurability } from "@/modules/inventory/items";
import { EQUIPMENT_SLOTS } from "@/modules/rpg/config";
import type { EquipmentSlot, Loadout } from "@/db/schemas/rpg-profile";
import { UIColors } from "@/modules/ui/design-system";
import { UserStore } from "@/db/repositories/users";
import { renderProgressBar } from "@/modules/economy/account/formatting";

type Screen = "slot_picker" | "slot_actions" | "item_view";

type MenuOption = {
  label: string;
  value: string;
  description?: string;
  isDefault?: boolean;
};

type EquipmentUIState = {
  screen: Screen;
  notice: string | null;
  loadout: Loadout;
  selectedSlot: EquipmentSlot | null;
  actionOptions: MenuOption[];
  eligibleCount: number;
};

type EquippedData = {
  itemId: string;
  instanceId?: string;
  durability?: number;
};

type SlotData = {
  loadout: Loadout;
  actionOptions: MenuOption[];
  eligibleCount: number;
  equipped: EquippedData | null;
  error?: string;
};

const SLOT_EMOJIS: Record<EquipmentSlot, string> = {
  weapon: "⚔️",
  shield: "🛡️",
  helmet: "⛑️",
  chest: "👕",
  pants: "👖",
  boots: "👢",
  ring: "💍",
  necklace: "📿",
};

function slotLabel(slot: EquipmentSlot): string {
  return slot.charAt(0).toUpperCase() + slot.slice(1);
}

function compact(value: string, max = 95): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function getEquippedData(value: Loadout[EquipmentSlot]): EquippedData | null {
  if (!value) return null;
  if (typeof value === "string") return { itemId: value };
  return {
    itemId: value.itemId,
    instanceId: value.instanceId,
    durability: value.durability,
  };
}

function canEquipToSlot(
  slot: EquipmentSlot,
  itemDef: ReturnType<typeof getItemDefinition>,
): boolean {
  if (!itemDef) return false;
  return itemDef.rpgSlot === slot || (slot === "weapon" && itemDef.rpgSlot === "tool");
}

function slotMenuOptions(
  loadout: Loadout,
  selectedSlot: EquipmentSlot | null,
): StringSelectOption[] {
  return EQUIPMENT_SLOTS.map((slot) => {
    const equipped = getEquippedData(loadout[slot]);
    const equippedName = equipped
      ? getItemDefinition(equipped.itemId)?.name ?? equipped.itemId
      : "Empty slot";

    const option = new StringSelectOption()
      .setLabel(slotLabel(slot))
      .setValue(slot)
      .setDescription(compact(`Current: ${equippedName}`, 100));

    if (selectedSlot === slot) option.setDefault(true);
    return option;
  });
}

function toStringSelectOptions(options: MenuOption[]): StringSelectOption[] {
  return options.slice(0, 25).map((entry) => {
    const option = new StringSelectOption()
      .setLabel(compact(entry.label, 100))
      .setValue(entry.value);
    if (entry.description) {
      option.setDescription(compact(entry.description, 100));
    }
    if (entry.isDefault) option.setDefault(true);
    return option;
  });
}

function buildSlotPickerEmbed(loadout: Loadout, notice: string | null): Embed {
  const embed = new Embed()
    .setColor(UIColors.info)
    .setTitle("⚔️ RPG Equipment")
    .setDescription(
      notice
        ? `${notice}\n\nSelect a slot to manage equipment.`
        : "Select a slot to manage equipment.",
    );

  for (const slot of EQUIPMENT_SLOTS) {
    const equipped = getEquippedData(loadout[slot]);
    const emoji = SLOT_EMOJIS[slot] || "📦";

    if (!equipped) {
      embed.addFields({
        name: `${emoji} ${slotLabel(slot)}`,
        value: "*Empty*",
        inline: false,
      });
      continue;
    }

    const def = getItemDefinition(equipped.itemId);
    let details = "";
    if (equipped.durability !== undefined) {
      const maxDurability = (def && getToolMaxDurability(def)) || 100;
      const percent = (equipped.durability / maxDurability) * 100;
      details = ` ${renderProgressBar(percent, 5)} \`${equipped.durability}\``;
    }

    embed.addFields({
      name: `${emoji} ${slotLabel(slot)}`,
      value: `${def?.emoji ?? "📦"} **${def?.name ?? equipped.itemId}**${details}`,
      inline: false,
    });
  }

  return embed;
}

function buildSlotActionsEmbed(
  slot: EquipmentSlot,
  loadout: Loadout,
  eligibleCount: number,
  notice: string | null,
): Embed {
  const equipped = getEquippedData(loadout[slot]);
  const def = equipped ? getItemDefinition(equipped.itemId) : null;

  return new Embed()
    .setColor(UIColors.amethyst)
    .setTitle(`⚔️ ${slotLabel(slot)} Slot`)
    .setDescription(
      [
        notice,
        equipped
          ? `Currently equipped: ${def?.emoji ?? "📦"} **${def?.name ?? equipped.itemId}**`
          : "Currently equipped: *Nothing*",
        `Eligible inventory items: **${eligibleCount}**`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
}

function buildItemDetailsEmbed(slot: EquipmentSlot, loadout: Loadout): Embed {
  const equipped = getEquippedData(loadout[slot]);
  if (!equipped) {
    return new Embed()
      .setColor(UIColors.warning)
      .setTitle("No Item Equipped")
      .setDescription(`Nothing is equipped in **${slotLabel(slot)}**.`);
  }

  const def = getItemDefinition(equipped.itemId);
  const maxDurability = def ? getToolMaxDurability(def) || 100 : 100;
  const durabilityText =
    equipped.durability !== undefined
      ? `${equipped.durability}/${maxDurability}`
      : "Not tracked";

  const statLines = Object.entries(def?.stats ?? {})
    .filter(([, value]) => value !== undefined && value !== 0)
    .map(([name, value]) => `• ${name}: +${value}`);

  const embed = new Embed()
    .setColor(UIColors.info)
    .setTitle(`${def?.emoji ?? "📦"} ${def?.name ?? equipped.itemId}`)
    .setDescription(def?.description ?? "No description available.")
    .addFields(
      {
        name: "Slot",
        value: slotLabel(slot),
        inline: true,
      },
      {
        name: "Durability",
        value: durabilityText,
        inline: true,
      },
      {
        name: "Item ID",
        value: `\`${equipped.itemId}\``,
        inline: false,
      },
    );

  if (statLines.length > 0) {
    embed.addFields({
      name: "Stats",
      value: statLines.join("\n"),
      inline: false,
    });
  }

  return embed;
}

async function loadProfile(userId: string) {
  const profileResult = await rpgProfileRepo.findById(userId);
  if (profileResult.isErr() || !profileResult.unwrap()) {
    return null;
  }
  return profileResult.unwrap()!;
}

async function loadSlotData(userId: string, slot: EquipmentSlot): Promise<SlotData> {
  const profile = await loadProfile(userId);
  if (!profile) {
    return {
      loadout: {
        weapon: null,
        shield: null,
        helmet: null,
        chest: null,
        pants: null,
        boots: null,
        ring: null,
        necklace: null,
      },
      actionOptions: [{ label: "Unequip", value: "unequip", description: "Slot is empty" }],
      eligibleCount: 0,
      equipped: null,
      error: "❌ RPG profile not found.",
    };
  }

  const userResult = await UserStore.get(userId);
  if (userResult.isErr() || !userResult.unwrap()) {
    const equipped = getEquippedData(profile.loadout[slot]);
    return {
      loadout: profile.loadout,
      actionOptions: [
        {
          label: "Unequip",
          value: "unequip",
          description: equipped ? "Remove equipped item" : "Slot is already empty",
        },
      ],
      eligibleCount: 0,
      equipped,
      error: "❌ Could not load your inventory.",
    };
  }

  const inventory = normalizeModernInventory(userResult.unwrap()!.inventory);
  const view = buildInventoryView(inventory);
  const equipped = getEquippedData(profile.loadout[slot]);
  const equippedDef = equipped ? getItemDefinition(equipped.itemId) : null;

  const options: MenuOption[] = [
    {
      label: "Unequip",
      value: "unequip",
      description: equipped
        ? `Remove ${compact(equippedDef?.name ?? equipped.itemId, 90)}`
        : "Slot is already empty",
    },
  ];

  let eligibleCount = 0;
  for (const entry of view) {
    const def = getItemDefinition(entry.itemId);
    if (!canEquipToSlot(slot, def)) continue;
    eligibleCount += 1;

    const itemName = def?.name ?? entry.itemId;
    const maxDurability = def ? getToolMaxDurability(def) || 100 : 100;

    if (entry.isInstanceBased && entry.instances) {
      for (const instance of entry.instances) {
        if (options.length >= 25) break;
        options.push({
          label: `${itemName} #${instance.instanceId.slice(-6)}`,
          value: `equip:${entry.itemId}:${instance.instanceId}`,
          description: `Durability: ${instance.durability}/${maxDurability}`,
        });
      }
    } else {
      if (options.length >= 25) break;
      options.push({
        label: itemName,
        value: `equip:${entry.itemId}`,
        description: `Quantity: ${entry.quantity}`,
      });
    }

    if (options.length >= 25) break;
  }

  return {
    loadout: profile.loadout,
    actionOptions: options,
    eligibleCount,
    equipped,
  };
}

function actionErrorMessage(error: { code?: string; message: string }, slot: EquipmentSlot): string {
  const messages: Record<string, string> = {
    IN_COMBAT: "❌ You cannot change equipment while in combat!",
    ITEM_NOT_IN_INVENTORY: "❌ Item not found in your inventory.",
    INVALID_EQUIPMENT_SLOT: "❌ This item cannot be equipped to that slot.",
    SLOT_EMPTY: `❌ Nothing equipped in ${slot}.`,
    UPDATE_FAILED: "❌ Failed to update equipment.",
  };

  return messages[error.code ?? ""] ?? `❌ ${error.message}`;
}

@HelpDoc({
  command: "rpg equipment",
  category: HelpCategory.RPG,
  description: "Manage your RPG equipment slots — equip and unequip weapons, armor, and tools",
  usage: "/rpg equipment",
  notes: "Cannot change equipment while in combat.",
})
@Declare({
  name: "equipment",
  description: "⚔️ Manage RPG equipment slots, equip items, and unequip",
})
export default class RpgEquipmentSubcommand extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const userId = ctx.author.id;
    const profile = await loadProfile(userId);

    if (!profile) {
      await ctx.write({
        content: "❌ You need an RPG profile first! Use `/rpg profile` to create one.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (profile.isFighting) {
      await ctx.write({
        content: "❌ You cannot change equipment while in combat!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await ctx.deferReply(true);

    const ui = new UI<EquipmentUIState>(
      {
        screen: "slot_picker",
        notice: null,
        loadout: profile.loadout,
        selectedSlot: null,
        actionOptions: [],
        eligibleCount: 0,
      },
      (state) => {
        const rows: ActionRow<any>[] = [];

        if (state.screen === "slot_picker") {
          const slotMenu = new StringSelectMenu()
            .setPlaceholder("Select a slot...")
            .setValuesLength({ min: 1, max: 1 })
            .setOptions(slotMenuOptions(state.loadout, state.selectedSlot))
            .onSelect("rpg_equipment_slot_select", async (menuCtx) => {
              const slot = menuCtx.interaction.values?.[0] as EquipmentSlot | undefined;
              if (!slot || !EQUIPMENT_SLOTS.includes(slot)) return;

              const data = await loadSlotData(userId, slot);
              state.selectedSlot = slot;
              state.loadout = data.loadout;
              state.actionOptions = data.actionOptions;
              state.eligibleCount = data.eligibleCount;
              state.notice = data.error ?? null;
              state.screen = "slot_actions";
            });

          rows.push(new ActionRow<StringSelectMenu>().addComponents(slotMenu));

          return {
            embeds: [buildSlotPickerEmbed(state.loadout, state.notice)],
            components: rows,
            flags: MessageFlags.Ephemeral,
          };
        }

        if (state.screen === "slot_actions" && state.selectedSlot) {
          const slot = state.selectedSlot;
          const equipped = getEquippedData(state.loadout[slot]);
          const equippedName = equipped
            ? getItemDefinition(equipped.itemId)?.name ?? equipped.itemId
            : "Equipped Item";

          const actionMenu = new StringSelectMenu()
            .setPlaceholder("Unequip or equip an item...")
            .setValuesLength({ min: 1, max: 1 })
            .setOptions(toStringSelectOptions(state.actionOptions))
            .onSelect("rpg_equipment_action_select", async (menuCtx) => {
              const selected = menuCtx.interaction.values?.[0];
              if (!selected || !state.selectedSlot) return;

              const activeSlot = state.selectedSlot;

              if (selected === "unequip") {
                const currentEquipped = getEquippedData(state.loadout[activeSlot]);
                if (!currentEquipped) {
                  state.notice = "ℹ️ Slot is already empty.";
                  return;
                }

                const unequipResult = await rpgEquipmentService.unequip(
                  userId,
                  userId,
                  activeSlot,
                );
                if (unequipResult.isErr()) {
                  state.notice = actionErrorMessage(
                    unequipResult.error as { code?: string; message: string },
                    activeSlot,
                  );
                } else {
                  const removedName =
                    getItemDefinition(currentEquipped.itemId)?.name ??
                    currentEquipped.itemId;
                  state.notice = `✅ Unequipped **${removedName}**.`;
                }

                const refreshed = await loadSlotData(userId, activeSlot);
                state.loadout = refreshed.loadout;
                state.actionOptions = refreshed.actionOptions;
                state.eligibleCount = refreshed.eligibleCount;
                if (refreshed.error) {
                  state.notice = refreshed.error;
                }
                return;
              }

              if (!selected.startsWith("equip:")) {
                state.notice = "❌ Invalid selection.";
                return;
              }

              const payload = selected.slice("equip:".length);
              const [itemId, instanceId] = payload.split(":");
              if (!itemId) {
                state.notice = "❌ Invalid item selection.";
                return;
              }

              const equipResult = await rpgEquipmentService.equip({
                userId,
                actorId: userId,
                slot: activeSlot,
                itemId,
                instanceId,
              });

              if (equipResult.isErr()) {
                state.notice = actionErrorMessage(
                  equipResult.error as { code?: string; message: string },
                  activeSlot,
                );
              } else {
                const itemName = getItemDefinition(itemId)?.name ?? itemId;
                state.notice = `✅ Equipped **${itemName}**.`;
              }

              const refreshed = await loadSlotData(userId, activeSlot);
              state.loadout = refreshed.loadout;
              state.actionOptions = refreshed.actionOptions;
              state.eligibleCount = refreshed.eligibleCount;
              if (refreshed.error) {
                state.notice = refreshed.error;
              }
            });

          const backButton = new Button()
            .setLabel("Go Back")
            .setStyle(ButtonStyle.Secondary)
            .onClick("rpg_equipment_back_to_slots", async () => {
              const refreshedProfile = await loadProfile(userId);
              if (!refreshedProfile) {
                state.notice = "❌ RPG profile not found.";
                return;
              }
              state.loadout = refreshedProfile.loadout;
              state.selectedSlot = null;
              state.notice = null;
              state.screen = "slot_picker";
            });

          const viewButton = new Button()
            .setLabel(compact(`View ${equippedName}`, 80))
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!equipped)
            .onClick("rpg_equipment_view_item", async () => {
              if (!state.selectedSlot) return;
              const refreshedProfile = await loadProfile(userId);
              if (!refreshedProfile) {
                state.notice = "❌ RPG profile not found.";
                return;
              }
              state.loadout = refreshedProfile.loadout;
              if (!getEquippedData(refreshedProfile.loadout[state.selectedSlot])) {
                state.notice = "❌ Nothing is equipped in this slot.";
                return;
              }
              state.screen = "item_view";
            });

          rows.push(new ActionRow<StringSelectMenu>().addComponents(actionMenu));
          rows.push(new ActionRow<Button>().addComponents(backButton, viewButton));

          return {
            embeds: [
              buildSlotActionsEmbed(
                slot,
                state.loadout,
                state.eligibleCount,
                state.notice,
              ),
            ],
            components: rows,
            flags: MessageFlags.Ephemeral,
          };
        }

        if (state.screen === "item_view" && state.selectedSlot) {
          const slot = state.selectedSlot;

          const backToSlot = new Button()
            .setLabel(`Back To ${slotLabel(slot)}`)
            .setStyle(ButtonStyle.Primary)
            .onClick("rpg_equipment_back_to_slot", async () => {
              if (!state.selectedSlot) return;
              const refreshed = await loadSlotData(userId, state.selectedSlot);
              state.loadout = refreshed.loadout;
              state.actionOptions = refreshed.actionOptions;
              state.eligibleCount = refreshed.eligibleCount;
              state.notice = refreshed.error ?? null;
              state.screen = "slot_actions";
            });

          const goBack = new Button()
            .setLabel("Go Back")
            .setStyle(ButtonStyle.Secondary)
            .onClick("rpg_equipment_back_to_slots_from_view", async () => {
              const refreshedProfile = await loadProfile(userId);
              if (!refreshedProfile) {
                state.notice = "❌ RPG profile not found.";
                return;
              }
              state.loadout = refreshedProfile.loadout;
              state.selectedSlot = null;
              state.notice = null;
              state.screen = "slot_picker";
            });

          rows.push(new ActionRow<Button>().addComponents(goBack, backToSlot));

          return {
            embeds: [buildItemDetailsEmbed(slot, state.loadout)],
            components: rows,
            flags: MessageFlags.Ephemeral,
          };
        }

        return {
          embeds: [buildSlotPickerEmbed(state.loadout, state.notice)],
          components: rows,
          flags: MessageFlags.Ephemeral,
        };
      },
      (msg) => ctx.editOrReply(msg),
    );

    await ui.send();
  }
}


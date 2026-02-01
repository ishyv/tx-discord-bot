/**
 * Currency Mutation Service.
 *
 * Purpose: Mod-only currency adjustments with audit logging.
 * Encaje: Service layer for write operations, wraps atomic updates.
 * Dependencies:
 * - UserStore for atomic $inc operations
 * - EconomyAccountRepo for account lifecycle
 * - EconomyAuditRepo for audit logging
 * - CurrencyRegistry for currency validation
 *
 * Invariants:
 * - All adjustments are atomic (Mongo $inc).
 * - Actor must have ManageGuild permission (mod-only).
 * - Target account must exist and not be blocked/banned.
 * - All operations are audited.
 * - Negative deltas allowed (debt permitted for mods).
 */

import { UserStore, incrementReputation } from "@/db/repositories/users";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { UserId } from "@/db/types";

import type { CurrencyId, CurrencyInventory } from "../currency";
import { economyAccountRepo } from "../account/repository";
import { economyAuditRepo } from "../audit/repository";
import {
  CurrencyMutationError,
  type AdjustCurrencyBalanceInput,
  type AdjustCurrencyBalanceResult,
} from "./types";
import { validateCurrencyIdDetailed } from "./validation";

/** Check if user has moderator permissions in context. */
async function checkActorPermission(
  actorId: UserId,
  guildId: string | undefined,
  checkAdmin: (actorId: UserId, guildId?: string) => Promise<boolean>,
): Promise<Result<void, CurrencyMutationError>> {
  const hasPermission = await checkAdmin(actorId, guildId);

  if (!hasPermission) {
    return ErrResult(
      new CurrencyMutationError(
        "INSUFFICIENT_PERMISSIONS",
        "No tienes permisos para realizar esta acción.",
      ),
    );
  }

  return OkResult(undefined);
}

/** Validate and sanitize currency ID.
 * Returns sanitized canonical ID or error.
 */
function validateAndSanitizeCurrencyId(
  rawCurrencyId: string,
): Result<CurrencyId, CurrencyMutationError> {
  const validation = validateCurrencyIdDetailed(rawCurrencyId);

  if (!validation.valid) {
    return ErrResult(
      new CurrencyMutationError("CURRENCY_NOT_FOUND", validation.reason),
    );
  }

  return OkResult(validation.canonicalId);
}

/** Get current balance for a currency. */
function getCurrentBalance(
  currency: CurrencyInventory,
  currencyId: CurrencyId,
): unknown {
  return currency[currencyId] ?? 0;
}

type TransferValidation = {
  readonly senderId: UserId;
  readonly recipientId: UserId;
  readonly guildId?: string;
  readonly currencyId: CurrencyId;
  readonly amount: number;
  readonly reason?: string;
  readonly correlationId?: string;
};

type TransferExecution = {
  readonly transferId: string;
  readonly senderId: UserId;
  readonly recipientId: UserId;
  readonly currencyId: CurrencyId;
  readonly amount: number;
  readonly senderBefore: unknown;
  readonly senderAfter: unknown;
  readonly recipientBefore: unknown;
  readonly recipientAfter: unknown;
};

function validateTransferInput(
  input: import("./types").TransferCurrencyInput,
): Result<TransferValidation, CurrencyMutationError> {
  const {
    senderId,
    recipientId,
    guildId,
    currencyId: rawCurrencyId,
    amount,
    reason,
    correlationId,
  } = input;

  const currencyCheck = validateAndSanitizeCurrencyId(rawCurrencyId);
  if (currencyCheck.isErr()) {
    return ErrResult(currencyCheck.error);
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return ErrResult(
      new CurrencyMutationError(
        "INVALID_AMOUNT",
        "La cantidad debe ser un número positivo.",
      ),
    );
  }

  if (senderId === recipientId) {
    return ErrResult(
      new CurrencyMutationError(
        "SELF_TRANSFER",
        "No puedes transferirte a ti mismo.",
      ),
    );
  }

  return OkResult({
    senderId,
    recipientId,
    guildId,
    currencyId: currencyCheck.unwrap(),
    amount,
    reason,
    correlationId,
  });
}

function computeTaxAndNet(amount: number): { tax: number; netAmount: number } {
  return { tax: 0, netAmount: amount };
}

async function executeTransferTransaction(
  input: TransferValidation,
): Promise<Result<TransferExecution, CurrencyMutationError>> {
  const { senderId, recipientId, currencyId, amount, correlationId } = input;

  const [senderEnsure, recipientEnsure] = await Promise.all([
    economyAccountRepo.ensure(senderId),
    economyAccountRepo.ensure(recipientId),
  ]);

  if (senderEnsure.isErr()) {
    return ErrResult(
      new CurrencyMutationError(
        "ACTOR_BLOCKED",
        "No se pudo acceder a tu cuenta.",
      ),
    );
  }
  if (recipientEnsure.isErr()) {
    return ErrResult(
      new CurrencyMutationError(
        "TARGET_NOT_FOUND",
        "No se pudo acceder a la cuenta del destinatario.",
      ),
    );
  }

  const senderAccount = senderEnsure.unwrap().account;
  const recipientAccount = recipientEnsure.unwrap().account;

  if (senderAccount.status === "banned") {
    return ErrResult(
      new CurrencyMutationError(
        "ACTOR_BANNED",
        "Tu cuenta tiene restricciones permanentes.",
      ),
    );
  }
  if (senderAccount.status === "blocked") {
    return ErrResult(
      new CurrencyMutationError(
        "ACTOR_BLOCKED",
        "Tu cuenta tiene restricciones temporales.",
      ),
    );
  }
  if (recipientAccount.status === "banned") {
    return ErrResult(
      new CurrencyMutationError(
        "TARGET_BANNED",
        "La cuenta del destinatario tiene restricciones permanentes.",
      ),
    );
  }
  if (recipientAccount.status === "blocked") {
    return ErrResult(
      new CurrencyMutationError(
        "TARGET_BLOCKED",
        "La cuenta del destinatario tiene restricciones temporales.",
      ),
    );
  }

  const [senderUser, recipientUser] = await Promise.all([
    UserStore.get(senderId),
    UserStore.get(recipientId),
  ]);

  if (senderUser.isErr() || !senderUser.unwrap()) {
    return ErrResult(
      new CurrencyMutationError(
        "ACTOR_BLOCKED",
        "No se pudo acceder a tu cuenta.",
      ),
    );
  }
  if (recipientUser.isErr() || !recipientUser.unwrap()) {
    return ErrResult(
      new CurrencyMutationError(
        "TARGET_NOT_FOUND",
        "Destinatario no encontrado.",
      ),
    );
  }

  const senderCurrency = (senderUser.unwrap()!.currency ??
    {}) as CurrencyInventory;
  const recipientCurrency = (recipientUser.unwrap()!.currency ??
    {}) as CurrencyInventory;

  const senderBefore = getCurrentBalance(senderCurrency, currencyId) as number;
  const recipientBefore = getCurrentBalance(
    recipientCurrency,
    currencyId,
  ) as number;

  const isSimpleCurrency =
    typeof (senderCurrency[currencyId] ?? 0) === "number";
  if (isSimpleCurrency && senderBefore < amount) {
    return ErrResult(
      new CurrencyMutationError(
        "INSUFFICIENT_FUNDS",
        "No tienes suficientes fondos para esta transferencia.",
      ),
    );
  }

  const transferId =
    correlationId ??
    `xfer_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  const { netAmount } = computeTaxAndNet(amount);

  let senderAfter: unknown;
  let recipientAfter: unknown;

  if (isSimpleCurrency) {
    const col = await UserStore.collection();
    const now = new Date();

    try {
      const senderResult = await col.findOneAndUpdate(
        { _id: senderId } as any,
        {
          $inc: { [`currency.${currencyId}`]: -netAmount } as any,
          $set: { updatedAt: now } as any,
        },
        { returnDocument: "after" },
      );

      if (!senderResult) {
        return ErrResult(
          new CurrencyMutationError(
            "UPDATE_FAILED",
            "No se pudo actualizar el balance del remitente.",
          ),
        );
      }

      const recipientResult = await col.findOneAndUpdate(
        { _id: recipientId } as any,
        {
          $inc: { [`currency.${currencyId}`]: netAmount } as any,
          $set: { updatedAt: now } as any,
        },
        { returnDocument: "after" },
      );

      if (!recipientResult) {
        await col.updateOne({ _id: senderId } as any, {
          $inc: { [`currency.${currencyId}`]: netAmount } as any,
        });
        return ErrResult(
          new CurrencyMutationError(
            "UPDATE_FAILED",
            "Error en la transferencia. Intenta nuevamente.",
          ),
        );
      }

      senderAfter = getCurrentBalance(
        ((senderResult as any).currency ?? {}) as CurrencyInventory,
        currencyId,
      );
      recipientAfter = getCurrentBalance(
        ((recipientResult as any).currency ?? {}) as CurrencyInventory,
        currencyId,
      );
    } catch (e) {
      return ErrResult(
        new CurrencyMutationError(
          "UPDATE_FAILED",
          "Error de base de datos durante la transferencia.",
        ),
      );
    }
  } else {
    const { currencyTransaction } = await import("../transactions");

    const senderTx = await currencyTransaction(senderId, {
      costs: [
        {
          currencyId,
          value: { hand: netAmount, bank: 0, use_total_on_subtract: false },
        },
      ],
      allowDebt: false,
    });

    if (senderTx.isErr()) {
      return ErrResult(
        new CurrencyMutationError(
          "INSUFFICIENT_FUNDS",
          "No tienes suficientes fondos para esta transferencia.",
        ),
      );
    }

    const recipientTx = await currencyTransaction(recipientId, {
      rewards: [
        {
          currencyId,
          value: { hand: netAmount, bank: 0, use_total_on_subtract: false },
        },
      ],
    });

    if (recipientTx.isErr()) {
      await currencyTransaction(senderId, {
        rewards: [
          {
            currencyId,
            value: { hand: netAmount, bank: 0, use_total_on_subtract: false },
          },
        ],
      });
      return ErrResult(
        new CurrencyMutationError(
          "UPDATE_FAILED",
          "Error en la transferencia. Intenta nuevamente.",
        ),
      );
    }

    senderAfter = senderTx.unwrap()[currencyId];
    recipientAfter = recipientTx.unwrap()[currencyId];
  }

  return OkResult({
    transferId,
    senderId,
    recipientId,
    currencyId,
    amount: netAmount,
    senderBefore,
    senderAfter,
    recipientBefore,
    recipientAfter,
  });
}

async function writeAudit(
  input: TransferValidation,
  result: TransferExecution,
): Promise<void> {
  const { guildId, reason, currencyId } = input;
  const {
    transferId,
    senderId,
    recipientId,
    amount,
    senderBefore,
    senderAfter,
    recipientBefore,
    recipientAfter,
  } = result;

  const senderAudit = await economyAuditRepo.create({
    operationType: "currency_transfer",
    actorId: senderId,
    targetId: recipientId,
    guildId,
    source: "transfer",
    reason,
    currencyData: {
      currencyId,
      delta: -amount,
      beforeBalance: senderBefore,
      afterBalance: senderAfter,
    },
    metadata: {
      transferId,
      correlationId: transferId,
      direction: "outgoing",
    },
  });

  if (senderAudit.isErr()) {
    console.error(
      "[CurrencyMutationService] Failed to create sender audit entry:",
      senderAudit.error,
    );
  }

  const recipientAudit = await economyAuditRepo.create({
    operationType: "currency_transfer",
    actorId: senderId,
    targetId: recipientId,
    guildId,
    source: "transfer",
    reason,
    currencyData: {
      currencyId,
      delta: amount,
      beforeBalance: recipientBefore,
      afterBalance: recipientAfter,
    },
    metadata: {
      transferId,
      correlationId: transferId,
      direction: "incoming",
    },
  });

  if (recipientAudit.isErr()) {
    console.error(
      "[CurrencyMutationService] Failed to create recipient audit entry:",
      recipientAudit.error,
    );
  }
}

function buildResponse(
  result: TransferExecution,
  timestamp: Date,
): Result<import("./types").TransferCurrencyResult, CurrencyMutationError> {
  return OkResult({
    transferId: result.transferId,
    senderId: result.senderId,
    recipientId: result.recipientId,
    currencyId: result.currencyId,
    amount: result.amount,
    senderBefore: result.senderBefore,
    senderAfter: result.senderAfter,
    recipientBefore: result.recipientBefore,
    recipientAfter: result.recipientAfter,
    timestamp,
  });
}

export interface CurrencyMutationService {
  /**
   * Adjust currency balance (mod-only, supports negative delta).
   *
   * Steps:
   * 1. Validate actor permissions
   * 2. Validate currency exists
   * 3. Ensure target account exists
   * 4. Gate on target status (blocked/banned)
   * 5. Get current balance
   * 6. Perform atomic $inc update
   * 7. Create audit log entry
   * 8. Return result with before/after
   */
  adjustCurrencyBalance(
    input: AdjustCurrencyBalanceInput,
    checkAdmin: (actorId: UserId, guildId?: string) => Promise<boolean>,
  ): Promise<Result<AdjustCurrencyBalanceResult, CurrencyMutationError>>;

  /**
   * Transfer currency between users (user-to-user).
   *
   * Steps:
   * 1. Validate currency exists
   * 2. Validate amount is positive
   * 3. Ensure both accounts exist
   * 4. Gate on both account statuses
   * 5. Check sender has sufficient funds
   * 6. Atomically decrement sender and increment recipient
   * 7. Create audit log entry with correlation ID
   * 8. Return result with both before/after balances
   */
  transferCurrency(
    input: import("./types").TransferCurrencyInput,
  ): Promise<
    Result<import("./types").TransferCurrencyResult, CurrencyMutationError>
  >;
}

class CurrencyMutationServiceImpl implements CurrencyMutationService {
  async adjustCurrencyBalance(
    input: AdjustCurrencyBalanceInput,
    checkAdmin: (actorId: UserId, guildId?: string) => Promise<boolean>,
  ): Promise<Result<AdjustCurrencyBalanceResult, CurrencyMutationError>> {
    const {
      actorId,
      targetId,
      guildId,
      currencyId: rawCurrencyId,
      delta,
      reason,
    } = input;

    // Step 1: Check actor permissions
    const permCheck = await checkActorPermission(actorId, guildId, checkAdmin);
    if (permCheck.isErr()) {
      return ErrResult(permCheck.error);
    }

    // Step 2: Validate and sanitize currency ID (security: prevents MongoDB injection)
    const currencyCheck = validateAndSanitizeCurrencyId(rawCurrencyId);
    if (currencyCheck.isErr()) {
      return ErrResult(currencyCheck.error);
    }
    const currencyId = currencyCheck.unwrap();

    // Step 3: Ensure target account exists
    const ensureResult = await economyAccountRepo.ensure(targetId);
    if (ensureResult.isErr()) {
      return ErrResult(
        new CurrencyMutationError(
          "TARGET_NOT_FOUND",
          "No se pudo acceder a la cuenta del objetivo.",
        ),
      );
    }
    const { account: targetAccount } = ensureResult.unwrap();

    // Step 4: Gate on target status
    if (targetAccount.status === "banned") {
      return ErrResult(
        new CurrencyMutationError(
          "TARGET_BANNED",
          "La cuenta del objetivo tiene restricciones permanentes.",
        ),
      );
    }
    if (targetAccount.status === "blocked") {
      return ErrResult(
        new CurrencyMutationError(
          "TARGET_BLOCKED",
          "La cuenta del objetivo tiene restricciones temporales.",
        ),
      );
    }

    // Step 5: Get current balance
    const userResult = await UserStore.get(targetId);
    if (userResult.isErr()) {
      return ErrResult(
        new CurrencyMutationError("TARGET_NOT_FOUND", "Usuario no encontrado."),
      );
    }
    const user = userResult.unwrap();
    if (!user) {
      return ErrResult(
        new CurrencyMutationError("TARGET_NOT_FOUND", "Usuario no existe."),
      );
    }

    const currency = (user.currency ?? {}) as CurrencyInventory;
    const beforeBalance = getCurrentBalance(currency, currencyId);

    // Step 6: Perform atomic update
    let updateResult: Result<import("@/db/schemas/user").User | null, Error>;

    // Special case: reputation has a specialized helper
    if (currencyId === "rep") {
      const repResult = await incrementReputation(targetId, delta);
      if (repResult.isErr()) {
        return ErrResult(
          new CurrencyMutationError(
            "UPDATE_FAILED",
            "No se pudo actualizar la reputación.",
          ),
        );
      }
      // Re-fetch user to get updated state
      const refreshed = await UserStore.get(targetId);
      if (refreshed.isErr() || !refreshed.unwrap()) {
        return ErrResult(
          new CurrencyMutationError(
            "UPDATE_FAILED",
            "Error al obtener estado actualizado.",
          ),
        );
      }
      updateResult = refreshed;
    } else {
      // For simple numeric currencies, use $inc
      const isSimpleCurrency = typeof (currency[currencyId] ?? 0) === "number";

      if (isSimpleCurrency) {
        // Use direct MongoDB $inc for atomic update
        const col = await UserStore.collection();
        try {
          const now = new Date();
          const mongoResult = await col.findOneAndUpdate(
            { _id: targetId } as any,
            {
              $inc: { [`currency.${currencyId}`]: delta } as any,
              $set: { updatedAt: now } as any,
            },
            { returnDocument: "after" },
          );
          const doc = mongoResult as import("@/db/schemas/user").User | null;
          if (doc) {
            updateResult = OkResult(doc);
          } else {
            return ErrResult(
              new CurrencyMutationError(
                "UPDATE_FAILED",
                "No se pudo actualizar el balance.",
              ),
            );
          }
        } catch (e) {
          return ErrResult(
            new CurrencyMutationError(
              "UPDATE_FAILED",
              "Error de base de datos.",
            ),
          );
        }
      } else {
        // Complex currency (like coins with hand/bank object)
        // Fall back to the existing currencyTransaction system
        const { currencyTransaction } = await import("../transactions");

        const txResult = await currencyTransaction(targetId, {
          rewards:
            delta > 0
              ? [
                  {
                    currencyId,
                    value: {
                      hand: delta,
                      bank: 0,
                      use_total_on_subtract: false,
                    },
                  },
                ]
              : undefined,
          costs:
            delta < 0
              ? [
                  {
                    currencyId,
                    value: {
                      hand: Math.abs(delta),
                      bank: 0,
                      use_total_on_subtract: false,
                    },
                  },
                ]
              : undefined,
          allowDebt: true, // Mods can create debt
        });

        if (txResult.isErr()) {
          return ErrResult(
            new CurrencyMutationError(
              "UPDATE_FAILED",
              "No se pudo actualizar el balance de moneda.",
            ),
          );
        }

        const newCurrency = txResult.unwrap();
        const afterBalance = newCurrency[currencyId];

        // Create audit entry
        const auditResult = await economyAuditRepo.create({
          operationType: "currency_adjust",
          actorId,
          targetId,
          guildId,
          source: "give-currency",
          reason,
          currencyData: {
            currencyId,
            delta,
            beforeBalance,
            afterBalance,
          },
        });

        if (auditResult.isErr()) {
          console.error(
            "[CurrencyMutationService] Failed to create audit entry:",
            auditResult.error,
          );
          // Don't fail the operation if audit fails, but log it
        }

        return OkResult({
          targetId,
          currencyId,
          delta,
          before: beforeBalance,
          after: afterBalance,
          timestamp: new Date(),
        });
      }
    }

    if (updateResult.isErr()) {
      return ErrResult(
        new CurrencyMutationError(
          "UPDATE_FAILED",
          "Error al actualizar el balance.",
        ),
      );
    }

    const updatedUser = updateResult.unwrap();
    if (!updatedUser) {
      return ErrResult(
        new CurrencyMutationError(
          "TARGET_NOT_FOUND",
          "Usuario no encontrado después de actualizar.",
        ),
      );
    }

    // Get after balance
    const afterCurrency = (updatedUser.currency ?? {}) as CurrencyInventory;
    const afterBalance = getCurrentBalance(afterCurrency, currencyId);

    // Step 7: Create audit entry
    const auditResult = await economyAuditRepo.create({
      operationType: "currency_adjust",
      actorId,
      targetId,
      guildId,
      source: "give-currency",
      reason,
      currencyData: {
        currencyId,
        delta,
        beforeBalance,
        afterBalance,
      },
    });

    if (auditResult.isErr()) {
      console.error(
        "[CurrencyMutationService] Failed to create audit entry:",
        auditResult.error,
      );
      // Don't fail the operation if audit fails, but log it
    }

    // Step 8: Return result
    return OkResult({
      targetId,
      currencyId,
      delta,
      before: beforeBalance,
      after: afterBalance,
      timestamp: new Date(),
    });
  }

  async transferCurrency(
    input: import("./types").TransferCurrencyInput,
  ): Promise<
    Result<import("./types").TransferCurrencyResult, CurrencyMutationError>
  > {
    const validation = validateTransferInput(input);
    if (validation.isErr()) {
      return ErrResult(validation.error);
    }

    const execution = await executeTransferTransaction(validation.unwrap());
    if (execution.isErr()) {
      return ErrResult(execution.error);
    }

    const timestamp = new Date();
    await writeAudit(validation.unwrap(), execution.unwrap());

    return buildResponse(execution.unwrap(), timestamp);
  }
}

/** Singleton instance. */
export const currencyMutationService: CurrencyMutationService =
  new CurrencyMutationServiceImpl();

# AI System

This document describes how the bot's artificial intelligence system works: configuration, providers, models, and limits.

## Objectives

- **Abstraction**: Unify multiple providers (Gemini, OpenAI, etc.) under a common interface.
- **Per-Server Configuration**: Allow each guild to choose its preferred provider and model.
- **Traceability**: Maintain useful logs and normalized metadata for each interaction.

## Service Architecture

The AI core resides in `src/services/ai/`.

- **Orchestrator (`index.ts`)**: The main entry point. It resolves server configuration, manages conversation memory, and exposes high-level methods for processing messages or generating content.
- **Adapters**: Each provider has its own adapter (e.g., `gemini.ts`, `openai.ts`) that implements the common interface to translate requests to the corresponding SDK.
- **Response Management (`response.ts`)**: Normalizes responses from different models, managing truncation and completion reasons.
- **Limits and Tracking**: Controls usage frequency (`rateLimiter.ts`) and tracks messages (`messageTracker.ts`) to maintain context.

## Configuration

Configuration is managed through the bot's centralized configuration system:

- **Provider**: The AI engine to use (e.g., `gemini`, `openai`).
- **Model**: The specific model from the provider (e.g., `gemini-1.5-flash`, `gpt-4o`).

Configuration commands allow changing these values in real-time, validating that the model is compatible with the selected provider.

## Continuation Flow

When an AI response is truncated by token limits:

1. The system adds a visual notice and a **continuation button**.
2. Pressing the button sends a new request that includes the necessary previous context to continue the response without duplicating information.
3. The bot can also continue the conversation if a user direct replies to an AI-generated message.

## Integrations

The AI integrates seamlessly at various points in the bot:

- **Mentions**: Natural responses to direct mentions.
- **Auto-response**: Automatic support in specific channels (e.g., forums).
- **Fun commands**: Generation of jokes, stories, or creative content.

## Extensibility

Adding a new provider requires:

1. Creating a new adapter that complies with the `AIProvider` interface.
2. Registering the new provider and its models in the service constants.
3. The orchestrator will automatically detect it and it will be available for configuration.

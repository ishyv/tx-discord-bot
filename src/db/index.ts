// Mongo backend wiring lives here. Import this module when you want to switch
// the data layer to MongoDB without touching business logic.

export * from "./client";
export * from "./models/user";
export * from "./models/guild";
export * from "./models/autorole";

export * as MongoUsersRepo from "./repositories/users";
export * as MongoGuildsRepo from "./repositories/guilds";
export * as MongoAutoroleRepo from "./repositories/autorole";

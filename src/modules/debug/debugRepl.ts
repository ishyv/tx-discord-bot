import net from "node:net";
import repl, { REPLServer } from "node:repl";

export type DebugScope = Record<string, any>;

export interface DebugReplOptions {
    port?: number;
    prompt?: string;
    scope?: DebugScope;
}

export function startDebugRepl(options: DebugReplOptions = {}) {
    // Security: Prevent REPL from starting in production
    if (process.env.NODE_ENV === 'production') {
        console.warn('[debug-repl] REPL is disabled in production for security');
        return null;
    }

    const {
        port = 5001,
        prompt = "debug> ",
        scope = {},
    } = options;

    const server = net.createServer((socket) => {
        const r: REPLServer = repl.start({
            prompt,
            input: socket,
            output: socket,
            terminal: true,
            useGlobal: false,
            ignoreUndefined: true,
        });

        try {
            Object.assign(r.context, scope);
        } catch (err) {
            console.error("[debug-repl] failed to assign scope to REPL context:", err);
        }

        // Add a "list" command
        r.context.list = () => {
            const keys = Object.keys(r.context)
                .filter(k => !k.startsWith("_"))
                .sort();

            socket.write("\nAvailable in scope:\n");
            for (const k of keys) {
                let type = "unknown";
                try {
                    const v = r.context[k];
                    type = typeof v;
                } catch (err) {
                    console.error(`[debug-repl] failed to get type of key ${k}:`, err);
                }

                try {
                    socket.write(`${k}  (${type})\n`);
                } catch (err) {
                    console.error(`[debug-repl] failed to write key ${k} to socket:`, err);
                }
            }
            socket.write("\n");
        };

        // Add "help" command too because you're going to forget
        r.context.help = () => {
            socket.write(`\nCommands:\n`);
            socket.write(`  list   → show variables/functions in scope\n`);
            socket.write(`  help   → this help\n`);
            socket.write(`\n`);
        };

        r.on("exit", () => {
            socket.end();
        });
    });

    server.listen(port, () => {
        console.log(`[debug-repl] listening on port ${port}`);
    });

    return server;
}

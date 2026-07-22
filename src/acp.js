const { spawn: spawnShell } = require("child_process");
const { createInterface } = require("readline");
const { EventEmitter } = require("events");
const fs = require("fs");
const path = require("path");
const { fileURLToPath } = require("url");
const { cliEnv, spawnCli } = require("./platform");

function guessMime(p) {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

/**
 * ACP client for `grok agent --always-approve stdio`.
 * hydrateMode mutes history replay streams during session/load.
 */
class AcpClient extends EventEmitter {
  constructor({ cliPath, cwd, env, log = () => {}, experimentalMemory = false }) {
    super();
    this.cliPath = cliPath;
    this.cwd = cwd;
    this.env = cliEnv(env || process.env);
    this.log = log;
    this.experimentalMemory = experimentalMemory;
    this.proc = null;
    this.rl = null;
    this.nextId = 1;
    this.pending = new Map();
    this.sessionId = null;
    this.started = false;
    this.hydrateMode = false;
    this._terminals = new Map();
    /** @type {Array<{name:string,description?:string,input?:any,_meta?:any}>} */
    this.availableCommands = [];
    /** @type {Map<string|number, {resolve: Function}>} */
    this.pendingPermissions = new Map();
    /** When true, auto-select allow (default product desktop mode). */
    this.autoApprove = true;
  }

  setAutoApprove(on) {
    this.autoApprove = !!on;
  }

  respondPermission(requestId, optionId) {
    const p = this.pendingPermissions.get(requestId);
    if (!p) return false;
    this.pendingPermissions.delete(requestId);
    this.writeLine({
      jsonrpc: "2.0",
      id: requestId,
      result: { outcome: { outcome: "selected", optionId } },
    });
    p.resolve?.(optionId);
    return true;
  }

  async start() {
    if (this.started && this.proc) return;
    // flags before subcommand: grok agent [--experimental-memory] --always-approve stdio
    const args = ["agent", "--always-approve"];
    // memory is typically env GROK_MEMORY / config; flag if supported later
    args.push("stdio");
    this.log(`spawn ${this.cliPath} ${args.join(" ")} (cwd=${this.cwd}) mem=${this.experimentalMemory}`);
    this.proc = spawnCli(this.cliPath, args, {
      cwd: this.cwd,
      env: this.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.rl = createInterface({ input: this.proc.stdout });
    this.rl.on("line", (line) => this.onLine(line));

    this.proc.stdin.on("error", (err) => {
      this.log(`[acp] stdin error: ${err.message}`);
    });
    this.proc.stderr.on("data", (d) => {
      const t = d.toString();
      if (t.trim()) this.log(`[stderr] ${t.slice(0, 400)}`);
    });
    this.proc.on("exit", (code) => {
      this.log(`grok exited code=${code}`);
      this.proc = null;
      this.started = false;
      for (const [, p] of this.pending) {
        if (p.timer) clearTimeout(p.timer);
        p.reject(new Error(`Grok process exited (code ${code})`));
      }
      this.pending.clear();
      this.emit("exit", code);
    });
    this.proc.on("error", (err) => {
      this.log(`spawn error: ${err.message}`);
      this.emit("error", err);
    });

    await this.request("initialize", {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
      clientInfo: { name: "grok-desktop", version: require("../package.json").version || "0.8.7" },
    });
    this.started = true;
    this.emit("initialized");
  }

  async newSession() {
    this.hydrateMode = false;
    const res = await this.request("session/new", { cwd: this.cwd, mcpServers: [] });
    this.sessionId = res.sessionId;
    this.lastSessionMeta = res;
    if (res?.models) {
      this.lastModels = res.models;
      this.currentModelId = res.models.currentModelId || this.currentModelId;
    }
    this.emit("session", res);
    return res;
  }

  async loadSession(sessionId) {
    this.hydrateMode = true;
    try {
      const res = await this.request("session/load", {
        sessionId,
        cwd: this.cwd,
        mcpServers: [],
      });
      this.sessionId = sessionId;
      this.lastSessionMeta = res;
      if (res?.models) {
        this.lastModels = res.models;
        this.currentModelId = res.models.currentModelId || this.currentModelId;
      }
      this.emit("session", { sessionId, ...(res || {}) });
      return { sessionId, ...(res || {}) };
    } finally {
      setTimeout(() => {
        this.hydrateMode = false;
      }, 400);
    }
  }

  /**
   * @param {string | Array<object>} textOrBlocks
   */
  async prompt(textOrBlocks) {
    if (!this.sessionId) throw new Error("no session");
    this.hydrateMode = false;
    const prompt = Array.isArray(textOrBlocks)
      ? textOrBlocks
      : [{ type: "text", text: String(textOrBlocks ?? "") }];
    return this.request("session/prompt", { sessionId: this.sessionId, prompt });
  }

  /**
   * @returns {{ sessionId: string, models?: any }}
   */
  async setModel(modelId) {
    if (!this.sessionId) throw new Error("no session");
    const res = await this.request("session/set_model", {
      sessionId: this.sessionId,
      modelId,
    });
    this.currentModelId = modelId;
    this.emit("model", modelId);
    return res;
  }

  cancel() {
    if (!this.sessionId) return;
    this.writeLine({
      jsonrpc: "2.0",
      method: "session/cancel",
      params: { sessionId: this.sessionId },
    });
  }

  dispose() {
    try {
      this.rl?.close();
    } catch {
      /* ignore */
    }
    try {
      if (this.proc && !this.proc.killed) this.proc.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    this.proc = null;
    this.started = false;
    this.sessionId = null;
    this.hydrateMode = false;
    for (const [, p] of this.pending) {
      if (p.timer) clearTimeout(p.timer);
      p.reject(new Error("disposed"));
    }
    this.pending.clear();
  }

  writeLine(obj) {
    if (!this.proc || !this.proc.stdin?.writable) return false;
    try {
      this.proc.stdin.write(JSON.stringify(obj) + "\n");
      return true;
    } catch (err) {
      this.log(`[acp] write failed: ${err.message}`);
      return false;
    }
  }

  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject };
      this.pending.set(id, entry);
      if (!this.writeLine({ jsonrpc: "2.0", id, method, params })) {
        this.pending.delete(id);
        reject(new Error(`Grok process not running (${method})`));
        return;
      }
      const timeoutMs = method === "session/prompt" ? 1_800_000 : 180_000;
      entry.timer = setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`ACP timeout: ${method}`));
      }, timeoutMs);
    });
  }

  onLine(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }

    if (msg.id != null && (msg.result !== undefined || msg.error !== undefined) && !msg.method) {
      const p = this.pending.get(msg.id);
      if (p) {
        this.pending.delete(msg.id);
        if (p.timer) clearTimeout(p.timer);
        if (msg.error) p.reject(msg.error);
        else p.resolve(msg.result);
      }
      return;
    }

    if (msg.method && msg.id == null) {
      this.handleNotification(msg.method, msg.params || {});
      return;
    }

    if (msg.method && msg.id != null) {
      void this.handleServerRequest(msg);
    }
  }

  handleNotification(method, params) {
    if (
      method === "session/update" ||
      method === "x.ai/session/update" ||
      method === "_x.ai/session/update"
    ) {
      this.routeSessionUpdate(params?.update || params);
    }
  }

  routeSessionUpdate(update) {
    if (!update) return;
    const kind = update.sessionUpdate || update.type;

    if (this.hydrateMode) {
      if (
        kind === "agent_message_chunk" ||
        kind === "agent_thought_chunk" ||
        kind === "user_message_chunk" ||
        kind === "tool_call" ||
        kind === "tool_call_update"
      ) {
        return;
      }
    }

    // Slash commands + skills advertised by agent
    if (
      kind === "available_commands_update" ||
      kind === "availableCommands" ||
      Array.isArray(update.availableCommands)
    ) {
      const list = update.availableCommands || [];
      this.availableCommands = list;
      this.emit("commands", list);
      return;
    }
    if (kind === "current_mode_update" || kind === "mode_update") {
      this.emit("mode", update.currentModeId || update.modeId || update);
      return;
    }
    if (kind === "agent_message_chunk") {
      const text = update.content?.text ?? update.text ?? "";
      if (text) this.emit("messageChunk", text);
      return;
    }
    if (kind === "agent_thought_chunk") {
      const text = update.content?.text ?? update.text ?? "";
      if (text) this.emit("thoughtChunk", text);
      return;
    }
    if (kind === "user_message_chunk") return;
    if (kind === "tool_call") {
      this.emit("toolCall", {
        toolCallId: update.toolCallId,
        title: update.title || update.kind || "tool",
        kind: update.kind,
        status: update.status || "running",
        rawInput: update.rawInput || update.input || null,
        content: update.content || null,
      });
      this.extractMedia(update);
      return;
    }
    if (kind === "tool_call_update") {
      this.emit("toolCallUpdate", {
        toolCallId: update.toolCallId,
        title: update.title || update.kind || "tool",
        kind: update.kind,
        status: update.status || "updated",
        rawInput: update.rawInput || update.input || null,
        content: update.content || null,
        rawOutput: update.rawOutput || null,
      });
      this.extractMedia(update);
      return;
    }
    if (kind === "plan") this.emit("plan", update);
  }

  extractMedia(payload) {
    if (!payload) return;
    const seen = new Set();
    const emitPath = (p, mime) => {
      if (!p || typeof p !== "string" || seen.has(p)) return;
      if (!fs.existsSync(p)) return;
      seen.add(p);
      this.emit("mediaContent", { kind: "path", path: p, mimeType: mime || guessMime(p) });
    };
    const walk = (node, depth = 0) => {
      if (!node || depth > 8) return;
      if (Array.isArray(node)) {
        node.forEach((n) => walk(n, depth + 1));
        return;
      }
      if (typeof node !== "object") return;
      if (node.type === "image" && node.data) {
        this.emit("mediaContent", {
          kind: "base64",
          mimeType: node.mimeType || "image/png",
          data: node.data,
        });
      }
      if (node.type === "resource" && node.uri) {
        const uri = String(node.uri);
        if (uri.startsWith("file://")) {
          try {
            emitPath(fileURLToPath(uri));
          } catch {
            emitPath(uri.slice(7));
          }
        }
        else if (uri.startsWith("/")) emitPath(uri);
      }
      if (typeof node.path === "string" && /\.(png|jpe?g|gif|webp|svg)$/i.test(node.path)) {
        emitPath(node.path);
      }
      if (typeof node.text === "string") {
        const paths = node.text.match(/\/[^\s"'`]+\.(?:png|jpe?g|gif|webp)/gi) || [];
        for (const p of paths) emitPath(p);
        const winPaths =
          node.text.match(/[A-Za-z]:\\[^\r\n"'`<>|]+\.(?:png|jpe?g|gif|webp)/gi) || [];
        for (const p of winPaths) emitPath(p);
      }
      for (const v of Object.values(node)) walk(v, depth + 1);
    };
    walk(payload);
  }

  respondOk(id, result = {}) {
    this.writeLine({ jsonrpc: "2.0", id, result });
  }

  respondError(id, code, message) {
    this.writeLine({ jsonrpc: "2.0", id, error: { code, message } });
  }

  async handleServerRequest(msg) {
    const { method, id, params } = msg;
    try {
      if (method === "fs/read_text_file") {
        const content = await fs.promises.readFile(params.path, "utf8");
        this.respondOk(id, { content });
        return;
      }
      if (method === "fs/write_text_file") {
        await fs.promises.mkdir(path.dirname(params.path), { recursive: true });
        await fs.promises.writeFile(params.path, params.content ?? "", "utf8");
        this.respondOk(id, {});
        return;
      }
      if (method === "terminal/create") {
        const terminalId = `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const child = spawnShell(params.command, {
          shell: true,
          cwd: params.cwd || this.cwd,
          env: this.env,
        });
        const buf = { output: "", exitCode: null, child };
        this._terminals.set(terminalId, buf);
        child.stdout?.on("data", (d) => {
          buf.output += d.toString();
          if (buf.output.length > 200_000) buf.output = buf.output.slice(-200_000);
        });
        child.stderr?.on("data", (d) => {
          buf.output += d.toString();
          if (buf.output.length > 200_000) buf.output = buf.output.slice(-200_000);
        });
        child.on("close", (code) => {
          buf.exitCode = code ?? 0;
        });
        this.respondOk(id, { terminalId });
        if (!this.hydrateMode) {
          this.emit("toolCall", { title: params.command, kind: "execute", status: "running" });
        }
        return;
      }
      if (method === "terminal/output") {
        const buf = this._terminals.get(params.terminalId);
        this.respondOk(id, {
          output: buf?.output || "",
          exitStatus: buf?.exitCode == null ? null : { exitCode: buf.exitCode },
          truncated: false,
        });
        return;
      }
      if (method === "terminal/wait_for_exit") {
        const buf = this._terminals.get(params.terminalId);
        if (!buf) {
          this.respondOk(id, { exitCode: 1 });
          return;
        }
        if (buf.exitCode != null) {
          this.respondOk(id, { exitCode: buf.exitCode });
          return;
        }
        await new Promise((resolve) => buf.child.once("close", () => resolve()));
        this.respondOk(id, { exitCode: buf.exitCode ?? 0 });
        return;
      }
      if (method === "terminal/kill") {
        try {
          this._terminals.get(params.terminalId)?.child?.kill();
        } catch {
          /* ignore */
        }
        this.respondOk(id, {});
        return;
      }
      if (method === "terminal/release") {
        try {
          this._terminals.get(params.terminalId)?.child?.kill();
        } catch {
          /* ignore */
        }
        this._terminals.delete(params.terminalId);
        this.respondOk(id, {});
        return;
      }
      if (method === "session/request_permission") {
        const options = params.options || [];
        const allowId =
          options.find((o) => /allow/i.test(o.optionId || o.kind || o.name || ""))?.optionId ||
          options[0]?.optionId ||
          "allow_once";
        if (this.autoApprove) {
          this.writeLine({
            jsonrpc: "2.0",
            id,
            result: { outcome: { outcome: "selected", optionId: allowId } },
          });
          return;
        }
        // Hand to UI; hang until respondPermission
        this.pendingPermissions.set(id, { resolve: () => {} });
        this.emit("permissionRequest", {
          id,
          sessionId: params.sessionId || this.sessionId,
          toolCall: params.toolCall || {},
          options,
        });
        return;
      }

      this.respondOk(id, {});
    } catch (err) {
      this.log(`[acp] handler error ${method}: ${err.message}`);
      this.respondError(id, -32603, err.message || "Internal error");
    }
  }
}

module.exports = { AcpClient };

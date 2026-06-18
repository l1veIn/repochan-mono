export const SENSITIVE_PATTERNS: Array<[RegExp, string]> = [
  [/(api[_-]?key|api[_-]?secret|api[_-]?token|access[_-]?key|secret[_-]?key|auth[_-]?token|bearer[_-]?token|refresh[_-]?token|app[_-]?secret|client[_-]?secret|private[_-]?key|ssh[_-]?key|github[_-]?token|openai[_-]?api[_-]?key|anthropic[_-]?api[_-]?key|password|pwd|passwd|db[_-]?password|session[_-]?secret|cookie[_-]?secret|jwt[_-]?secret|secret)\s*[=:]\s*['"]?[A-Za-z0-9_\-./+]{16,}['"]?/gi, "$1 = [REDACTED]"],
  [/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|SECRET_KEY))\s*=\s*['"]?[^\s'"#]{8,}['"]?/gm, "$1=[REDACTED]"],
  [/(postgres(?:ql)?|mysql|sqlite|redis|rediss|mongodb|amqp|rabbitmq|mqtt|nats|s3|gs|azblob):\/\/[^\s'")\]]+/gi, "$1://[REDACTED_CONNECTION]"],
  [/(https?:\/\/)[^:]+:[^@]+@/gi, "$1[REDACTED]:[REDACTED]@"],
  [/(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})(?:\/\d{1,2})?/g, "[REDACTED_IP]"],
  [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[REDACTED_EMAIL]"],
  [/-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]"],
  [/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, "[REDACTED_JWT]"],
  [/\b(?:sk-|pk-|AKIA|ASIA|SCW|NQ)[A-Za-z0-9_-]{8,}/gi, "[REDACTED_KEY]"],
];

export function desensitize(text: string) {
  let redactions = 0;
  let result = text;
  for (const [pattern, replacement] of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, (...args) => {
      redactions += 1;
      if (typeof replacement === "string" && replacement.includes("$1")) return String(args[1] ?? "") + replacement.replace("$1", "");
      return replacement;
    });
  }
  return { text: result, redactions };
}

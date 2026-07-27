export type ErrorKind =
  | "VALIDATION"
  | "STORAGE"
  | "IMAGE"
  | "RECOMMENDATION"
  | "BACKUP"
  | "NETWORK"
  | "PWA"
  | "UNKNOWN";

const messages: Record<ErrorKind, string> = {
  VALIDATION: "填写的信息需要检查后再试。",
  STORAGE: "本地保存失败，请检查浏览器存储空间。",
  IMAGE: "图片处理失败，请更换图片后重试。",
  RECOMMENDATION: "暂时无法生成推荐，请调整条件后重试。",
  BACKUP: "备份文件无法处理，请确认文件来源和格式。",
  NETWORK: "远程服务暂时不可用，请检查网络和接口配置。",
  PWA: "离线缓存更新失败，可清理缓存后重试。",
  UNKNOWN: "发生了未预期的问题，请复制错误编号用于排查。",
};

export class AppError extends Error {
  readonly code: string;
  readonly kind: ErrorKind;
  readonly userMessage: string;

  constructor(kind: ErrorKind, detail?: string, cause?: unknown) {
    const code = `${kind}-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    super(detail || messages[kind], { cause });
    this.name = "AppError";
    this.kind = kind;
    this.code = code;
    this.userMessage = messages[kind];
  }
}

export function toAppError(error: unknown, kind: ErrorKind = "UNKNOWN") {
  return error instanceof AppError
    ? error
    : new AppError(kind, error instanceof Error ? error.message : String(error), error);
}

export type ProtectedModuleValues = "*" | ReadonlySet<string>;

export interface ProtectedPublicEntrypointOptions {
  rootDir: string;
  tsconfigPath: string;
  entrypoints: readonly string[];
  protectedModules: ReadonlyMap<string, ProtectedModuleValues>;
  approvedValueImporters: ReadonlyMap<string, ReadonlySet<string>>;
  trustedAdapterValueExports: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface ProtectedPublicEntrypointViolation {
  kind: "configuration" | "import-edge" | "public-export";
  file: string;
  exportedName?: string;
  originFile?: string;
  originName?: string;
  message: string;
}

export function checkProtectedPublicEntrypoints(
  options: ProtectedPublicEntrypointOptions
): readonly ProtectedPublicEntrypointViolation[];

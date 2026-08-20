import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(process.argv[2] ?? process.cwd());
const adrDir = path.join(rootDir, "docs", "adr");
const indexPath = path.join(adrDir, "index.md");
const reservedFiles = new Set(["AGENTS.md", "README.md", "index.md"]);
const statuses = new Set(["proposed", "accepted", "superseded"]);
const origins = new Set(["new", "restored"]);
const errors = [];

if (!existsSync(adrDir) || !statSync(adrDir).isDirectory()) {
  errors.push("ADR directory is missing: " + relative(adrDir));
} else {
  const documents = collectDocuments();
  const parsedDocuments = documents.map((fileName) => parseDocument(fileName));
  const validDocuments = parsedDocuments.filter(
    (document) => document !== undefined
  );
  validateUniqueIds(validDocuments);
  validateReplacements(validDocuments);
  validateIndex(validDocuments);
}

if (errors.length === 0) {
  const documentCount = readdirSync(adrDir).filter(
    (entry) => entry.endsWith(".md") && !reservedFiles.has(entry)
  ).length;
  console.log("ADR validation: ok (" + documentCount + " document(s))");
} else {
  for (const error of errors) {
    console.error(error);
  }
  console.error("ADR validation failed: " + errors.length + " error(s)");
  process.exitCode = 1;
}

function collectDocuments() {
  return readdirSync(adrDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".md") &&
        !reservedFiles.has(entry.name)
    )
    .map((entry) => entry.name)
    .sort();
}

function parseDocument(fileName) {
  const filePath = path.join(adrDir, fileName);
  const source = readFileSync(filePath, "utf8");
  const frontMatterMatch = source.match(
    /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/
  );
  if (frontMatterMatch === null) {
    errors.push(relative(filePath) + ": missing front matter");
    return undefined;
  }

  const metadata = parseMetadata(frontMatterMatch[1].split(/\r?\n/), fileName);
  const body = source.slice(frontMatterMatch[0].length);
  validateMetadata(metadata, fileName);
  validateBody(body, metadata, fileName);

  return {
    fileName,
    filePath,
    metadata,
  };
}

function parseMetadata(lines, fileName) {
  const metadata = new Map();
  for (const line of lines) {
    if (line.trim() === "") {
      continue;
    }
    const match = line.match(/^([a-z_]+):\s*(.*)$/);
    if (match === null) {
      errors.push(
        relative(path.join(adrDir, fileName)) +
          ": invalid metadata line " +
          line
      );
      continue;
    }
    const key = match[1];
    const value = match[2];
    if (metadata.has(key)) {
      errors.push(
        relative(path.join(adrDir, fileName)) +
          ": duplicate metadata field " +
          key
      );
      continue;
    }
    metadata.set(key, value.trim());
  }
  return metadata;
}

function validateMetadata(metadata, fileName) {
  const displayPath = relative(path.join(adrDir, fileName));
  const requiredFields = [
    "id",
    "title",
    "status",
    "origin",
    "recorded",
    "decision_date",
    "supersedes",
    "superseded_by",
  ];
  for (const field of requiredFields) {
    if (!metadata.has(field) || metadata.get(field) === "") {
      errors.push(displayPath + ": missing metadata field " + field);
    }
  }

  const id = metadata.get("id");
  if (id !== undefined && !/^ADR-\d{4}$/.test(id)) {
    errors.push(displayPath + ": id must match ADR-0000");
  }
  const title = metadata.get("title");
  if (title !== undefined && title.trim() === "") {
    errors.push(displayPath + ": title must not be empty");
  }
  const status = metadata.get("status");
  if (status !== undefined && !statuses.has(status)) {
    errors.push(displayPath + ": unsupported status " + status);
  }
  const origin = metadata.get("origin");
  if (origin !== undefined && !origins.has(origin)) {
    errors.push(displayPath + ": unsupported origin " + origin);
  }
  const recorded = metadata.get("recorded");
  if (recorded !== undefined && !isIsoDate(recorded)) {
    errors.push(displayPath + ": recorded must be an ISO date");
  }
  const decisionDate = metadata.get("decision_date");
  if (origin === "restored" && decisionDate !== "unknown") {
    errors.push(displayPath + ": restored ADR must use decision_date: unknown");
  }
  if (
    origin === "new" &&
    decisionDate !== undefined &&
    !isIsoDate(decisionDate)
  ) {
    errors.push(displayPath + ": new ADR decision_date must be an ISO date");
  }
  for (const field of ["supersedes", "superseded_by"]) {
    const refs = parseReferences(metadata.get(field), displayPath, field);
    metadata.set(field, refs);
  }

  const fileNameMatch = fileName.match(
    /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/
  );
  if (fileNameMatch === null) {
    errors.push(displayPath + ": filename must match NNNN-kebab-case.md");
  } else if (id !== undefined && id !== "ADR-" + fileNameMatch[1]) {
    errors.push(displayPath + ": filename prefix must match " + id);
  }
}

function validateBody(body, metadata, fileName) {
  const displayPath = relative(path.join(adrDir, fileName));
  const id = metadata.get("id");
  const title = metadata.get("title");
  const heading = body.match(/^#\s+(ADR-\d{4}):\s+(.+)\s*$/m);
  if (heading === null) {
    errors.push(displayPath + ": missing ADR title heading");
  } else if (
    id !== undefined &&
    title !== undefined &&
    (heading[1] !== id || heading[2] !== title)
  ) {
    errors.push(displayPath + ": title heading must match metadata");
  }

  for (const section of [
    "Контекст",
    "Решение",
    "Альтернативы",
    "Причины выбора",
    "Последствия",
    "Доказательства",
  ]) {
    if (!hasSection(body, section, 2)) {
      errors.push(displayPath + ": missing or empty section ## " + section);
    }
  }
  for (const section of ["Положительные", "Отрицательные"]) {
    if (!hasSection(body, section, 3)) {
      errors.push(displayPath + ": missing or empty subsection ### " + section);
    }
  }
}

function hasSection(body, title, level) {
  const headingPattern = new RegExp(
    "^" + "#".repeat(level) + "\\s+" + escapeRegExp(title) + "\\s*$",
    "m"
  );
  const match = headingPattern.exec(body);
  if (match === null) {
    return false;
  }
  const contentStart = match.index + match[0].length;
  const rest = body.slice(contentStart);
  const nextHeading = rest.search(new RegExp("^#{1," + level + "}\\s+", "m"));
  const content = nextHeading < 0 ? rest : rest.slice(0, nextHeading);
  return content.replace(/^#{1,6}\s+.*$/gm, "").trim() !== "";
}

function validateUniqueIds(documents) {
  const seen = new Set();
  for (const document of documents) {
    const id = document.metadata.get("id");
    if (id === undefined) {
      continue;
    }
    if (seen.has(id)) {
      errors.push("duplicate ADR id " + id);
    }
    seen.add(id);
  }
}

function validateReplacements(documents) {
  const byId = new Map(
    documents.flatMap((document) => {
      const id = document.metadata.get("id");
      return id === undefined ? [] : [[id, document]];
    })
  );
  for (const document of documents) {
    const id = document.metadata.get("id");
    if (id === undefined) {
      continue;
    }
    const supersedes = document.metadata.get("supersedes") ?? [];
    const supersededBy = document.metadata.get("superseded_by") ?? [];
    if (
      document.metadata.get("status") === "superseded" &&
      supersededBy.length === 0
    ) {
      errors.push(id + ": superseded ADR must link to a replacement");
    }
    if (
      document.metadata.get("status") !== "superseded" &&
      supersededBy.length > 0
    ) {
      errors.push(id + ": only superseded ADRs may link through superseded_by");
    }
    for (const targetId of supersedes) {
      const target = byId.get(targetId);
      if (target === undefined) {
        errors.push(id + ": supersedes missing ADR " + targetId);
        continue;
      }
      const targetLinks = target.metadata.get("superseded_by") ?? [];
      if (!targetLinks.includes(id)) {
        errors.push(
          id + ": replacement link to " + targetId + " is not reciprocal"
        );
      }
      if (target.metadata.get("status") !== "superseded") {
        errors.push(targetId + ": replaced ADR must have status superseded");
      }
    }
    for (const targetId of supersededBy) {
      const target = byId.get(targetId);
      if (target === undefined) {
        errors.push(id + ": superseded_by missing ADR " + targetId);
        continue;
      }
      const targetLinks = target.metadata.get("supersedes") ?? [];
      if (!targetLinks.includes(id)) {
        errors.push(
          id + ": replacement link from " + targetId + " is not reciprocal"
        );
      }
    }
  }
}

function validateIndex(documents) {
  if (!existsSync(indexPath)) {
    errors.push("missing index: " + relative(indexPath));
    return;
  }
  const source = readFileSync(indexPath, "utf8");
  const rows = source
    .split(/\r?\n/)
    .filter((line) => /^\|\s*ADR-\d{4}\s*\|/.test(line))
    .map((line) => splitTableRow(line));
  const rowsById = new Map();
  for (const row of rows) {
    if (row.length !== 7) {
      errors.push(relative(indexPath) + ": ADR index row must have 7 columns");
      continue;
    }
    const id = row[0];
    if (rowsById.has(id)) {
      errors.push(relative(indexPath) + ": duplicate index row " + id);
    }
    rowsById.set(id, row);
  }

  const documentById = new Map(
    documents.flatMap((document) => {
      const id = document.metadata.get("id");
      return id === undefined ? [] : [[id, document]];
    })
  );
  for (const [id, document] of documentById) {
    const row = rowsById.get(id);
    if (row === undefined) {
      errors.push(relative(indexPath) + ": missing ADR " + id);
      continue;
    }
    const status = row[1];
    const title = row[2];
    const documentCell = row[3];
    const origin = row[4];
    const supersedesCell = row[5];
    const supersededByCell = row[6];
    const expectedStatus = document.metadata.get("status");
    const expectedTitle = document.metadata.get("title");
    const expectedOrigin = document.metadata.get("origin");
    if (status !== expectedStatus) {
      errors.push(
        relative(indexPath) + ": " + id + " status does not match document"
      );
    }
    if (title !== expectedTitle) {
      errors.push(
        relative(indexPath) + ": " + id + " title does not match document"
      );
    }
    if (origin !== expectedOrigin) {
      errors.push(
        relative(indexPath) + ": " + id + " origin does not match document"
      );
    }
    const documentLink = documentCell.match(/^\[[^\]]+\]\(([^)]+)\)$/)?.[1];
    if (documentLink === undefined) {
      errors.push(
        relative(indexPath) + ": " + id + " document must be a Markdown link"
      );
    } else {
      const resolvedLink = path.resolve(adrDir, documentLink);
      if (
        resolvedLink !== document.filePath ||
        !resolvedLink.startsWith(adrDir + path.sep)
      ) {
        errors.push(
          relative(indexPath) + ": " + id + " document link is incorrect"
        );
      }
    }
    compareIndexReferences(
      id,
      "supersedes",
      parseIndexReferences(supersedesCell),
      document.metadata.get("supersedes") ?? []
    );
    compareIndexReferences(
      id,
      "superseded_by",
      parseIndexReferences(supersededByCell),
      document.metadata.get("superseded_by") ?? []
    );
  }
  for (const id of rowsById.keys()) {
    if (!documentById.has(id)) {
      errors.push(relative(indexPath) + ": index references missing ADR " + id);
    }
  }
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function compareIndexReferences(id, field, actual, expected) {
  if (actual.join(",") !== expected.join(",")) {
    errors.push("index " + id + " " + field + " does not match document");
  }
}

function parseIndexReferences(value) {
  if (
    value === undefined ||
    value === "" ||
    value === "—" ||
    value === "none"
  ) {
    return [];
  }
  return value.split(",").map((entry) => entry.trim());
}

function parseReferences(value, displayPath, field) {
  if (
    value === undefined ||
    value === "" ||
    value === "none" ||
    value === "—"
  ) {
    return [];
  }
  const references = value.split(",").map((entry) => entry.trim());
  for (const reference of references) {
    if (!/^ADR-\d{4}$/.test(reference)) {
      errors.push(
        displayPath + ": " + field + " contains invalid ADR id " + reference
      );
    }
  }
  return references;
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(value + "T00:00:00Z");
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function relative(filePath) {
  return path.relative(rootDir, filePath).replaceAll("\\", "/");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&");
}

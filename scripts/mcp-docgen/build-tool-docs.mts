/**
 * 관리 화면 «도구 설명» 탭의 자료 만들기 (2026-10-24).
 *
 * 도구 설명의 정본은 엣지 함수 `supabase/functions/mcp/handler.js` 의 TOOLS 다(에이전트가 실제로 받는 글).
 * 화면이 같은 글을 보이도록 TOOLS 에서 이름·제목·설명·허용·읽기/쓰기·인자를 뽑아 src/lib/mcpToolDocs.generated.ts 로 쓴다.
 * 손으로 옮겨 적으면 도구를 고칠 때마다 화면 설명이 조용히 낡는다.
 *
 * 쓰는 법: npx tsx scripts/mcp-docgen/build-tool-docs.mts          → 다시 쓴다
 *          npx tsx scripts/mcp-docgen/build-tool-docs.mts --check  → 다르면 실패(회귀 run.mts 가 부른다)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const TOOL_DOCS_PATH = resolve(root, 'src/lib/mcpToolDocs.generated.ts');

interface Param { name: string; type: string; required: boolean; description?: string; options?: string[] }

function typeOf(schema: Record<string, unknown>): string {
  if (Array.isArray(schema.enum)) return 'string';
  const t = schema.type;
  if (t === 'array') {
    const items = (schema.items ?? {}) as Record<string, unknown>;
    return `${items.type === 'object' ? 'object' : String(items.type ?? 'any')}[]`;
  }
  return String(t ?? 'any');
}

export async function toolDocsText(): Promise<string> {
  const { TOOLS } = await import(pathToFileURL(resolve(root, 'supabase/functions/mcp/handler.js')).href);
  const docs = (TOOLS as Array<Record<string, any>>).map((t) => {
    const props = (t.inputSchema?.properties ?? {}) as Record<string, Record<string, unknown>>;
    const required = new Set<string>(t.inputSchema?.required ?? []);
    const params: Param[] = Object.entries(props).map(([name, schema]) => ({
      name,
      type: typeOf(schema),
      required: required.has(name),
      ...(typeof schema.description === 'string' ? { description: schema.description } : {}),
      ...(Array.isArray(schema.enum) ? { options: schema.enum as string[] } : {}),
    }));
    return {
      name: t.name as string,
      title: (t.title ?? t.annotations?.title ?? t.name) as string,
      description: t.description as string,
      grants: (Array.isArray(t.grant) ? t.grant : [t.grant]) as string[],
      readOnly: t.annotations?.readOnlyHint === true,
      destructive: t.annotations?.destructiveHint === true,
      params,
    };
  });
  return `// 자동 생성 — scripts/mcp-docgen/build-tool-docs.mts. 손으로 고치지 말 것.
// 원본 = supabase/functions/mcp/handler.js 의 TOOLS (에이전트가 받는 설명 그대로). 관리 화면 «도구 설명» 탭이 쓴다.

export interface McpToolDoc {
  name: string;
  title: string;
  description: string;
  grants: string[];
  readOnly: boolean;
  destructive: boolean;
  params: Array<{ name: string; type: string; required: boolean; description?: string; options?: string[] }>;
}

export const MCP_TOOL_DOCS: McpToolDoc[] = ${JSON.stringify(docs, null, 1)};
`;
}

const same = (a: string, b: string) => a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');

export async function toolDocsFresh(): Promise<boolean> {
  return existsSync(TOOL_DOCS_PATH) && same(readFileSync(TOOL_DOCS_PATH, 'utf8'), await toolDocsText());
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--check')) {
    if (await toolDocsFresh()) console.log('도구 설명 최신');
    else {
      console.error('mcpToolDocs.generated.ts 가 handler.js 와 다릅니다 — npx tsx scripts/mcp-docgen/build-tool-docs.mts 로 다시 쓰세요.');
      process.exitCode = 1;
    }
  } else {
    const text = await toolDocsText();
    writeFileSync(TOOL_DOCS_PATH, text);
    console.log(`썼다: mcpToolDocs.generated.ts (${(text.length / 1024).toFixed(1)}KB)`);
  }
}

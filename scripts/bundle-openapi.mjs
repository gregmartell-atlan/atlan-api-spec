/**
 * Bundle multi-file OpenAPI spec into a single JSON file for Swagger UI.
 *
 * This script:
 * 1. Reads openapi/openapi.yaml
 * 2. Resolves all $ref references to local files
 * 3. Outputs a single bundled JSON to src/generated/atlan-openapi-bundled.json
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OPENAPI_DIR = path.join(ROOT, 'openapi');
const OUTPUT_PATH = path.join(ROOT, 'src', 'generated', 'atlan-openapi-bundled.json');

const failedRefs = new Set();

async function readYaml(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const yaml = await import('js-yaml');
  return yaml.load(content);
}

async function resolveRefs(obj, baseDir) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return Promise.all(obj.map(item => resolveRefs(item, baseDir)));
  }

  if (obj.$ref && typeof obj.$ref === 'string') {
    const ref = obj.$ref;

    if (ref.startsWith('./') || ref.startsWith('../')) {
      const [filePart, hashPart] = ref.split('#');
      const refPath = path.resolve(baseDir, filePart);
      const refDir = path.dirname(refPath);

      try {
        const refContent = await readYaml(refPath);
        let resolved = refContent;

        if (hashPart) {
          const parts = hashPart.split('/').filter(Boolean);
          for (const part of parts) {
            resolved = resolved?.[part];
          }
        }

        if (resolved === undefined) {
          failedRefs.add(ref);
          console.warn(`WARN: Could not resolve $ref path fragment: ${ref}`);
          return obj;
        }

        return resolveRefs(resolved, refDir);
      } catch (e) {
        if (!failedRefs.has(ref)) {
          failedRefs.add(ref);
          console.error(`ERROR: Failed to resolve $ref: ${ref} from ${baseDir}`);
          console.error(`  Reason: ${e.message}`);
        }
        throw new Error(`Failed to resolve $ref: ${ref}`);
      }
    }

    return obj;
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = await resolveRefs(value, baseDir);
  }
  return result;
}

async function validateBundledSpec(bundled) {
  const errors = [];

  if (!bundled.paths) {
    errors.push('Missing paths section');
  }
  if (!bundled.components?.schemas) {
    errors.push('Missing components/schemas section');
  }

  return errors;
}

async function main() {
  console.log('Bundling OpenAPI spec...');

  const mainSpecPath = path.join(OPENAPI_DIR, 'openapi.yaml');

  try {
    const mainSpec = await readYaml(mainSpecPath);
    const bundled = await resolveRefs(mainSpec, OPENAPI_DIR);

    const validationErrors = await validateBundledSpec(bundled);
    if (validationErrors.length > 0) {
      console.error('ERROR: Generated spec is invalid:');
      validationErrors.forEach(e => console.error(`  - ${e}`));
      process.exit(1);
    }

    if (failedRefs.size > 0) {
      console.error(`\nERROR: ${failedRefs.size} reference(s) could not be resolved.`);
      console.error('Fix the above warnings before proceeding.');
      process.exit(1);
    }

    await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await fs.writeFile(OUTPUT_PATH, JSON.stringify(bundled, null, 2) + '\n', 'utf8');

    console.log(`Wrote bundled OpenAPI spec to: ${OUTPUT_PATH}`);

    const pathCount = Object.keys(bundled.paths || {}).length;
    let opCount = 0;
    for (const pathItem of Object.values(bundled.paths || {})) {
      opCount += Object.keys(pathItem || {}).filter(k =>
        ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(k)
      ).length;
    }
    const tagCount = (bundled.tags || []).length;
    const schemaCount = Object.keys(bundled.components?.schemas || {}).length;

    console.log(`Stats: ${pathCount} paths, ${opCount} operations, ${tagCount} tags, ${schemaCount} schemas`);
  } catch (e) {
    console.error('Fatal error during bundling:', e.message);
    process.exit(1);
  }
}

main();

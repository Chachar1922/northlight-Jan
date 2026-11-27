#!/usr/bin/env node
/**
 * Cloud configuration checker (read-only). Validates northlight.cloud.json:
 *   - resource names follow the naming convention,
 *   - every resource (and the resource group) has the required tags,
 *   - tag values are sensible,
 *   - the required resource types exist and names are unique.
 * Exits with code 1 if anything is wrong, so CI blocks the deployment.
 *
 * Usage: node tools/check-cloud.js [path/to/config.json]
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

/** Naming convention (documented in README). */
const NAME_RULES = {
  resourceGroup: { regex: /^rg-[a-z0-9]+-[a-z0-9]+-(dev|test|prod)$/, example: 'rg-northlight-web-prod' },
  webApp: { regex: /^app-[a-z0-9]+-[a-z0-9]+-(dev|test|prod)$/, example: 'app-northlight-web-prod' },
  storage: { regex: /^st[a-z0-9]{1,22}$/, example: 'stnorthlightwebprod (3-24 lowercase letters/digits, no hyphens)' },
};
const ENVIRONMENTS = ['dev', 'test', 'prod'];
const REQUIRED_TYPES = ['webApp', 'storage'];
const TAG_RULES = {
  owner: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'must be an e-mail address',
  env: (v) => ENVIRONMENTS.includes(v) || `must be one of ${ENVIRONMENTS.join(', ')}`,
  'cost-center': (v) => /^CC-\d{4}$/.test(v) || 'must look like CC-1234',
};

/** Returns an array of error strings (empty = valid). Pure function, unit-tested. */
function validate(config) {
  const errors = [];
  if (!config || typeof config !== 'object' || Array.isArray(config)) return ['Configuration is not a JSON object.'];
  // Structure: required top-level fields with the right types.
  for (const key of ['project', 'provider', 'environment']) if (typeof config[key] !== 'string' || !config[key]) errors.push(`Missing or invalid "${key}" (expected a non-empty string).`);
  if (!Array.isArray(config.requiredTags)) errors.push('Missing or invalid "requiredTags" (expected an array).');
  if (!config.resourceGroup || typeof config.resourceGroup !== 'object') errors.push('Missing "resourceGroup" object.');
  if (!Array.isArray(config.resources)) errors.push('Missing "resources" array.');
  if (errors.length) return errors;
  const required = Array.isArray(config.requiredTags) && config.requiredTags.length ? config.requiredTags : Object.keys(TAG_RULES);
  for (const t of Object.keys(TAG_RULES)) if (!required.includes(t)) errors.push(`requiredTags must include "${t}".`);

  const checkResource = (label, type, res) => {
    if (!res || typeof res !== 'object') { errors.push(`${label}: missing.`); return; }
    const rule = NAME_RULES[type];
    if (typeof res.name !== 'string' || !rule.regex.test(res.name)) errors.push(`${label}: invalid name "${res.name}". Expected e.g. ${rule.example}.`);
    const tags = res.tags && typeof res.tags === 'object' ? res.tags : {};
    for (const tag of required) {
      if (tags[tag] === undefined || String(tags[tag]).trim() === '') { errors.push(`${label} ("${res.name}"): missing required tag "${tag}".`); continue; }
      const check = TAG_RULES[tag] && TAG_RULES[tag](String(tags[tag]));
      if (check !== undefined && check !== true) errors.push(`${label} ("${res.name}"): tag "${tag}" ${check}.`);
    }
    if (config.environment && tags.env && tags.env !== config.environment) errors.push(`${label} ("${res.name}"): tag env "${tags.env}" does not match environment "${config.environment}".`);
    // The environment embedded in the name must agree with the config as well.
    const m = /-(dev|test|prod)$/.exec(res.name || '');
    if (m && config.environment && m[1] !== config.environment) errors.push(`${label}: name "${res.name}" is for "${m[1]}" but environment is "${config.environment}".`);
  };

  if (!ENVIRONMENTS.includes(config.environment)) errors.push(`environment must be one of ${ENVIRONMENTS.join(', ')}.`);
  checkResource('resourceGroup', 'resourceGroup', config.resourceGroup);

  const resources = Array.isArray(config.resources) ? config.resources : [];
  if (!resources.length) errors.push('resources: at least one resource is required.');
  resources.forEach((r, i) => {
    if (!r || !NAME_RULES[r.type] || r.type === 'resourceGroup') { errors.push(`resources[${i}]: unknown type "${r && r.type}".`); return; }
    checkResource(`resources[${i}] (${r.type})`, r.type, r);
  });
  for (const type of REQUIRED_TYPES) if (!resources.some((r) => r && r.type === type)) errors.push(`resources: a "${type}" resource is required.`);

  const names = [config.resourceGroup && config.resourceGroup.name, ...resources.map((r) => r && r.name)].filter(Boolean);
  names.filter((n, i) => names.indexOf(n) !== i).forEach((n) => errors.push(`Duplicate resource name "${n}".`));
  return errors;
}

function main(argv) {
  const file = path.resolve(argv[2] || path.join(__dirname, '..', 'northlight.cloud.json'));
  let config;
  try { config = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    console.error(`FAIL: cannot read ${file}: ${e.message}`);
    return 1;
  }
  const errors = validate(config);
  if (errors.length) {
    console.error(`FAIL: ${errors.length} problem(s) in ${path.basename(file)}:`);
    errors.forEach((e) => console.error(`  - ${e}`));
    return 1;
  }
  console.log(`PASS: ${path.basename(file)} is valid (${1 + config.resources.length} resources, tags: ${config.requiredTags.join(', ')}).`);
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv);
module.exports = { validate, NAME_RULES, TAG_RULES };

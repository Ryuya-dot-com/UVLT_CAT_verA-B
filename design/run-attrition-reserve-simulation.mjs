#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MONTE_CARLO_REPLICATES,
  DEFAULT_PUBLIC_SIMULATION_SEED,
  formatResultsCsv,
  formatResultsMarkdown,
  runAttritionReserveSimulation
} from "./attrition-reserve-simulation.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const defaultOutputDirectory = path.join(scriptDirectory, "results");
const reproducibilityNodeVersion = "24.9.0";

if (process.versions.node !== reproducibilityNodeVersion) {
  throw new Error(`Tracked attrition artifacts require Node ${reproducibilityNodeVersion}; found ${process.versions.node}`);
}

function parseArguments(argv) {
  const options = {
    check: false,
    monteCarloReplicates: DEFAULT_MONTE_CARLO_REPLICATES,
    publicSeed: DEFAULT_PUBLIC_SIMULATION_SEED,
    outputDirectory: defaultOutputDirectory
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") {
      options.check = true;
      continue;
    }
    const value = argv[index + 1];
    if (argument === "--replicates") {
      options.monteCarloReplicates = Number.parseInt(value, 10);
    } else if (argument === "--seed") {
      options.publicSeed = value;
    } else if (argument === "--output-dir") {
      options.outputDirectory = path.resolve(projectRoot, value);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
    index += 1;
  }
  return options;
}

async function writeAtomically(filePath, content) {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, content, { encoding: "utf8", mode: 0o644 });
  await rename(temporaryPath, filePath);
}

async function verifyExact(filePath, expected) {
  let actual;
  try {
    actual = await readFile(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new Error(`Missing generated artifact: ${path.relative(projectRoot, filePath)}`);
    }
    throw error;
  }
  if (actual !== expected) {
    throw new Error(`Generated artifact is stale: ${path.relative(projectRoot, filePath)}`);
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const artifact = runAttritionReserveSimulation({
    monteCarloReplicates: options.monteCarloReplicates,
    publicSeed: options.publicSeed
  });
  const outputs = new Map([
    ["attrition-reserve-results.json", `${JSON.stringify(artifact, null, 2)}\n`],
    ["attrition-reserve-results.csv", formatResultsCsv(artifact)],
    ["attrition-reserve-results.md", formatResultsMarkdown(artifact)]
  ]);

  if (options.check) {
    for (const [fileName, content] of outputs) {
      await verifyExact(path.join(options.outputDirectory, fileName), content);
    }
  } else {
    await mkdir(options.outputDirectory, { recursive: true });
    for (const [fileName, content] of outputs) {
      await writeAtomically(path.join(options.outputDirectory, fileName), content);
    }
  }
  process.stdout.write(`${JSON.stringify({
    mode: options.check ? "checked" : "written",
    outputDirectory: path.relative(projectRoot, options.outputDirectory),
    scenarios: artifact.results.length,
    monteCarloReplicatesPerScenario: artifact.monteCarloReplicatesPerScenario,
    publicSimulationSeed: artifact.publicSimulationSeed,
    payloadSha256: artifact.integrity.payloadSha256
  })}\n`);
}

await main();

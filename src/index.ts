#!/usr/bin/env node

import { exec } from "child_process";
import path from "path";
import fs from "fs/promises";
import { Project, Node, VariableDeclarationKind } from "ts-morph";

const dir = path.join(process.cwd(), "temp");

function sh(cmd: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    exec(cmd, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

(async () => {
  if (process.argv.length !== 4) {
    console.error(`usage: ${process.argv[1]} <old_version> <new_version>`);
    console.error("package versions must be one of:");
    console.error(" - absolute path to built package");
    console.error(" - npm reference (e.g. npm:latest)");
    console.error(" - url to tarball");
    process.exit(1);
  }

  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  process.chdir(dir);

  const oldPkg = process.argv[2];
  const newPkg = process.argv[3];

  console.log(`Analyzing breaking changes from ${oldPkg} to ${newPkg}...`);

  console.log("Installing packages...");

  // Set up a temporary npm package in the temp dir and install both old and new versions of the package
  await sh(`npm init -y`);
  await sh(`npm install old@${oldPkg}`);
  await sh(`npm install new@${newPkg}`);
  await sh(`npm install --save-dev typescript`);
  await sh(`npm exec tsc -- --init`);

  await fs.mkdir("src/");
  // A placeholder file is required for the directory to be added to the project properly
  await fs.writeFile("src/placeholder.ts", "");

  const project = new Project({ tsConfigFilePath: "./tsconfig.json" });
  project.addDirectoryAtPath("src/");

  // Add the type definitions from the old and new package to the projects so that we can prepare them
  const oldTypedefs = project.addSourceFilesAtPaths(
    "node_modules/old/types/**.d.ts",
  );
  const newTypedefs = project.addSourceFilesAtPaths(
    "node_modules/new/types/**.d.ts",
  );

  console.log("Preparing type definitions...");
  // prep: Remove private and protected fields from the definitions; we don't want to consider them in the analysis
  for (const f of [...oldTypedefs, ...newTypedefs]) {
    f.forEachDescendant((node) => {
      if (Node.isModifierable(node)) {
        if (node.hasModifier("private") || node.hasModifier("protected")) {
          node.toggleModifier("private", false);
          (node as any).remove?.();
        }
      }
    });
  }

  const file = project.createSourceFile("src/index.ts");

  const oldPackageDeclaration = file
    .addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      hasDeclareKeyword: true,
      declarations: [
        {
          name: "oldApi",
          type: `typeof import("old")`,
        },
        {
          name: "newApi",
          type: `typeof import("new")`,
        },
      ],
    })
    .getDeclarations()[0];

  for (const symbol of oldPackageDeclaration.getType().getProperties()) {
    file.addStatements(
      `const _${symbol.getName()}: typeof oldApi.${symbol.getName()} = newApi.${symbol.getName()};`,
    );
  }

  console.log("Getting diagnostics...");
  const diagnostics = project.getPreEmitDiagnostics();

  // TODO: how to go from diagnostic to list of breaking changes / summary report?
  // The TS errors _are_ parseable but ideally it should just take a quick glance

  if (diagnostics.length === 0) {
    console.log("✅ No breaking changes detected.");
  } else {
    console.log();
    console.log(
      `⚠️ Detected ${diagnostics.length} possible breaking change${
        diagnostics.length === 1 ? "" : "s"
      }:`,
    );
    console.log();
    console.log(project.formatDiagnosticsWithColorAndContext(diagnostics));
    process.exit(1);
  }
})();
